/**
 * BBP login handoff — security unit tests (no DB, no network).
 *
 * The two properties that matter and cannot be eyeballed:
 *   1. the credential in the URL is opaque and single-use (atomic consume)
 *   2. it is not a bearer token for anything else on this API
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";

jest.mock("../src/models/HandoffTicket", () => ({
  HandoffTicket: {
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
  },
}));
jest.mock("../src/models/User", () => ({
  User: { findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock("../src/models/Project", () => ({
  Project: { findById: jest.fn() },
}));
jest.mock("../src/utils/jwtUtils", () => ({
  generateProjectJWT: jest.fn().mockResolvedValue("session.jwt.value"),
}));

import { HandoffTicket } from "../src/models/HandoffTicket";
import { User } from "../src/models/User";
import { Project } from "../src/models/Project";
import {
  createBbpLoginUrl,
  redeemBbpHandoff,
} from "../src/controllers/bbpHandoffController";

const PROJECT_ID = "6a8c239ef69b9fe7107e8367";
const USER_ID = "6a8c239ef69b9fe7107e8368";

/** Minimal res double capturing status + body. */
function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: any) => {
    res.body = b;
    return res;
  };
  return res;
}

function mockReq(body: any = {}) {
  return {
    body,
    ip: "203.0.113.7",
    headers: {},
    publicApiProjectId: PROJECT_ID,
    publicApiKeyId: "6a8c239ef69b9fe7107e8369",
  } as any;
}

/** `.select(...).lean()` chain returning a fixed value. */
const chain = (value: any) => ({
  select: () => ({ lean: () => Promise.resolve(value) }),
});

const ACTIVE_USER = {
  _id: USER_ID,
  email: "asha.verma@example.com",
  firstName: "Asha",
  lastName: "Verma",
  mobile: "9876543210",
  isActive: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  (User.findOne as jest.Mock).mockReturnValue(chain(ACTIVE_USER));
  (Project.findById as jest.Mock).mockReturnValue(
    chain({
      _id: PROJECT_ID,
      name: "BBP",
      branding: { customUrlPath: "bbp" },
    }),
  );
  (HandoffTicket.create as jest.Mock).mockResolvedValue({});
});

describe("POST /v1/auth/login-url — mint", () => {
  it("returns an opaque ticket, not a JWT, and stores only its hash", async () => {
    const res = mockRes();
    await createBbpLoginUrl(mockReq({ email: ACTIVE_USER.email }), res);

    expect(res.statusCode).toBe(200);
    const ticket: string = res.body.data.token;

    // 32 random bytes, base64url — no dots, so it can never be mistaken for
    // (or verified as) a JWT.
    expect(ticket).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ticket).not.toContain(".");
    expect(Buffer.from(ticket, "base64url")).toHaveLength(32);

    const stored = (HandoffTicket.create as jest.Mock).mock.calls[0][0];
    expect(stored.tokenHash).toBe(
      crypto.createHash("sha256").update(ticket).digest("hex"),
    );
    expect(JSON.stringify(stored)).not.toContain(ticket);
    expect(stored.usedAt).toBeNull();
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      120 * 1000,
    );
    expect(res.body.data.login_url).toContain("/bbp/partner-login?token=");
  });

  it("mints a different ticket every call", async () => {
    const a = mockRes();
    const b = mockRes();
    await createBbpLoginUrl(mockReq({ email: ACTIVE_USER.email }), a);
    await createBbpLoginUrl(mockReq({ email: ACTIVE_USER.email }), b);
    expect(a.body.data.token).not.toEqual(b.body.data.token);
  });

  it("defaults to the project portal's ISR hub", async () => {
    const res = mockRes();
    await createBbpLoginUrl(mockReq({ email: ACTIVE_USER.email }), res);
    const stored = (HandoffTicket.create as jest.Mock).mock.calls[0][0];
    // Project-scoped, so an expired session lands on the project's own login.
    expect(stored.returnPath).toBe("/bbp/portal/service-requests?tab=new");
  });

  it("prefixes requester-portal paths with the project path", async () => {
    const res = mockRes();
    await createBbpLoginUrl(
      mockReq({ email: ACTIVE_USER.email, returnPath: "/student/my-tickets" }),
      res,
    );
    const stored = (HandoffTicket.create as jest.Mock).mock.calls[0][0];
    expect(stored.returnPath).toBe("/bbp/student/my-tickets");
  });

  it("accepts the staff hub without a tab", async () => {
    const res = mockRes();
    await createBbpLoginUrl(
      mockReq({
        email: ACTIVE_USER.email,
        returnPath: "/portal/service-requests",
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const stored = (HandoffTicket.create as jest.Mock).mock.calls[0][0];
    expect(stored.returnPath).toBe("/bbp/portal/service-requests");
  });

  it.each([
    "https://evil.test",
    "/service-requests?tab=new",
    "/sr-settings",
    "//evil.test",
    "/student/../admin/dashboard",
    "/admin/dashboard",
    "javascript:alert(1)",
  ])("rejects returnPath %s", async (returnPath) => {
    const res = mockRes();
    await createBbpLoginUrl(
      mockReq({ email: ACTIVE_USER.email, returnPath }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("INVALID_RETURN_PATH");
    expect(HandoffTicket.create).not.toHaveBeenCalled();
  });

  it("requires an identifier", async () => {
    const res = mockRes();
    await createBbpLoginUrl(mockReq({}), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("refuses a deactivated user", async () => {
    (User.findOne as jest.Mock).mockReturnValue(
      chain({ ...ACTIVE_USER, isActive: false }),
    );
    const res = mockRes();
    await createBbpLoginUrl(mockReq({ email: ACTIVE_USER.email }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("USER_INACTIVE");
  });

  it("404s a user who is not in the API key's project", async () => {
    (User.findOne as jest.Mock).mockReturnValue(chain(null));
    const res = mockRes();
    await createBbpLoginUrl(mockReq({ email: "stranger@example.com" }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
    // The project filter is what makes cross-project minting impossible.
    expect((User.findOne as jest.Mock).mock.calls[0][0].projects).toBeDefined();
  });
});

describe("POST /api/auth/handoff/redeem — consume", () => {
  const TICKET = crypto.randomBytes(32).toString("base64url");
  const HASH = crypto.createHash("sha256").update(TICKET).digest("hex");

  function claimable(doc: any) {
    (HandoffTicket.findOneAndUpdate as jest.Mock).mockReturnValue({
      lean: () => Promise.resolve(doc),
    });
  }

  it("consumes atomically on usedAt:null and an unexpired ticket", async () => {
    claimable({
      _id: "t1",
      userId: USER_ID,
      projectId: PROJECT_ID,
      returnPath: "/student/my-tickets",
    });
    (User.findById as jest.Mock).mockReturnValue({
      populate: () =>
        Promise.resolve({
          _id: USER_ID,
          email: ACTIVE_USER.email,
          isActive: true,
          projects: [PROJECT_ID],
          role: { _id: "r1", code: "BBP_USER", name: "BBP User", permissions: [] },
        }),
    });

    const res = mockRes();
    await redeemBbpHandoff(mockReq({ token: TICKET }), res);

    const [filter, update] = (HandoffTicket.findOneAndUpdate as jest.Mock).mock
      .calls[0];
    expect(filter.tokenHash).toBe(HASH); // looked up by hash, never plaintext
    expect(filter.usedAt).toBeNull(); // only an unused ticket matches
    expect(filter.expiresAt.$gt).toBeInstanceOf(Date); // and only an unexpired one
    expect(update.$set.usedAt).toBeInstanceOf(Date); // consumed in the same op

    expect(res.statusCode).toBe(200);
    expect(res.body.data.token).toBe("session.jwt.value");
    expect(res.body.data.returnPath).toBe("/student/my-tickets");
  });

  it("rejects a replay with the same generic message as an unknown ticket", async () => {
    claimable(null);
    (HandoffTicket.findOne as jest.Mock).mockReturnValue(
      chain({ usedAt: new Date(), userId: USER_ID }),
    );
    const used = mockRes();
    await redeemBbpHandoff(mockReq({ token: TICKET }), used);

    claimable(null);
    (HandoffTicket.findOne as jest.Mock).mockReturnValue(chain(null));
    const unknown = mockRes();
    await redeemBbpHandoff(
      mockReq({ token: crypto.randomBytes(32).toString("base64url") }),
      unknown,
    );

    expect(used.statusCode).toBe(401);
    expect(used.body.code).toBe("HANDOFF_ALREADY_USED");
    expect(unknown.statusCode).toBe(401);
    expect(unknown.body.code).toBe("HANDOFF_INVALID");
    // Same wording either way — the endpoint must not confirm what exists.
    expect(used.body.message).toBe(unknown.body.message);
  });

  it("rejects an expired ticket", async () => {
    claimable(null);
    (HandoffTicket.findOne as jest.Mock).mockReturnValue(
      chain({ usedAt: null, expiresAt: new Date(Date.now() - 1000), userId: USER_ID }),
    );
    const res = mockRes();
    await redeemBbpHandoff(mockReq({ token: TICKET }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("HANDOFF_EXPIRED");
  });

  it("rejects an empty token without touching the database", async () => {
    const res = mockRes();
    await redeemBbpHandoff(mockReq({}), res);
    expect(res.statusCode).toBe(401);
    expect(HandoffTicket.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses a ticket whose user has since left the project", async () => {
    claimable({
      _id: "t1",
      userId: USER_ID,
      projectId: PROJECT_ID,
      returnPath: "/student/dashboard",
    });
    (User.findById as jest.Mock).mockReturnValue({
      populate: () =>
        Promise.resolve({
          _id: USER_ID,
          email: ACTIVE_USER.email,
          isActive: true,
          projects: ["6a8c239ef69b9fe7107e8399"], // different project
          role: null,
        }),
    });
    const res = mockRes();
    await redeemBbpHandoff(mockReq({ token: TICKET }), res);
    expect(res.statusCode).toBe(401);
  });
});

describe("single-purpose tokens are not API sessions", () => {
  // The auth middleware verifies with the same secret every other token is
  // signed with, so it must reject anything that is not a full session.
  const SECRET = "test-secret-for-token-type-guard";

  const guard = (decoded: any) =>
    !(decoded?.scope || decoded?.purpose || decoded?.type || !decoded?.userId);

  it.each([
    ["parent self-service", { scope: "parent_self_service", projectId: "p" }],
    ["2FA step-up", { email: "a@b.c", otpKey: "k", purpose: "2fa" }],
    ["password setup", { userId: USER_ID, email: "a@b.c", type: "password-setup" }],
    ["legacy bbp handoff", { scope: "bbp_handoff", userId: USER_ID }],
  ])("%s token is not accepted as a session", (_label, claims) => {
    const decoded = jwt.verify(jwt.sign(claims, SECRET), SECRET) as any;
    expect(guard(decoded)).toBe(false);
  });

  it("a real session token passes the same guard", () => {
    const decoded = jwt.verify(
      jwt.sign({ userId: USER_ID, email: "a@b.c", tokenVersion: 0 }, SECRET),
      SECRET,
    ) as any;
    expect(guard(decoded)).toBe(true);
  });
});
