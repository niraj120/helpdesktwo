/**
 * BBP → Helpdesk login handoff.
 *
 * Two endpoints, nothing else:
 *
 *   1. POST /v1/auth/login-url        (server-to-server, X-API-Key)
 *      BBP's backend asks for a login URL for one of its users. We resolve the
 *      user inside the project the API key belongs to, mint a SHORT-LIVED
 *      one-time ticket, and return a ready-to-open URL with that ticket in it.
 *
 *   2. POST /api/auth/handoff/redeem  (called by our own frontend)
 *      The handoff page posts the ticket back and receives the real session JWT
 *      in the response BODY — the session token never travels in a URL.
 *
 * Why two steps instead of putting the session JWT straight in the URL: URLs end
 * up in browser history, access logs, and Referer headers.
 *
 * The ticket in the URL is deliberately NOT a JWT. It is 32 random bytes, and
 * only its SHA-256 hash is stored. That gives three properties a self-contained
 * JWT cannot:
 *
 *   - It is not a bearer credential anywhere else. A JWT signed with our own
 *     session secret is accepted by the auth middleware; an opaque ticket is
 *     accepted by exactly one endpoint.
 *   - It is single-use. Redemption is one atomic findOneAndUpdate on
 *     `usedAt: null`, so a replayed URL — from history, a log, a shared link —
 *     is dead the instant it is first redeemed.
 *   - It is revocable. Deleting the row kills the ticket; a JWT is valid until
 *     it expires no matter what we do.
 */
import { Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { config } from "../config";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { HandoffTicket } from "../models/HandoffTicket";
import { PublicApiRequest } from "../middleware/validatePublicApiKey";
import { generateProjectJWT } from "../utils/jwtUtils";
import { normaliseMobile } from "../utils/normaliseMobile";

/** Handoff ticket lifetime. One page load — deliberately tiny. */
const HANDOFF_TTL_SECONDS = 120;

/** Lifetime of the session the handoff produces. Shorter than a normal login
 *  (7d) because the user can always re-enter from BBP at no friction. */
const SESSION_TTL = "8h";

/** Where the user may land after redeem. Only these paths are accepted — an
 *  open `returnPath` would let anyone holding the API key bounce a logged-in
 *  user to an arbitrary URL.
 *
 *  `projectPrefixed` reflects how the route is mounted in the SPA: the student
 *  portal lives under /:customUrlPath/…, while the staff Service Request hub is
 *  mounted at the app root. Getting this wrong produces a 404 that looks like a
 *  login failure, so the flag lives here rather than being inferred later. */
interface AllowedPath {
  /** What the partner sends as `returnPath`. */
  request: string;
  /** Whether the SPA route sits under the project's custom URL path. */
  projectPrefixed: boolean;
}

const ALLOWED_RETURN_PATHS: AllowedPath[] = [
  // Staff / internal — the project portal's Service Request hub (ISR raise +
  // own + assigned). Project-scoped: an unauthenticated hit lands on that
  // project's own login page, not the admin console's.
  { request: "/portal/service-requests?tab=new", projectPrefixed: true },
  { request: "/portal/service-requests", projectPrefixed: true },
  { request: "/portal/dashboard", projectPrefixed: true },
  // Requester portal.
  { request: "/student/dashboard", projectPrefixed: true },
  { request: "/student/submit-ticket", projectPrefixed: true },
  { request: "/student/my-tickets", projectPrefixed: true },
  { request: "/student/faq", projectPrefixed: true },
];

const DEFAULT_RETURN_PATH = "/portal/service-requests?tab=new";

/** Turn an allowlisted request path into the absolute in-app path to navigate
 *  to. The frontend navigates to this verbatim — it does no prefixing of its
 *  own, so this function is the single place the two route shapes are resolved. */
function resolveReturnPath(entry: AllowedPath, projectPath: string): string {
  return entry.projectPrefixed
    ? `/${projectPath}${entry.request}`
    : entry.request;
}

/** 32 bytes from the CSPRNG. Never a UUID, never anything derived from the
 *  user id or the clock. */
function mintTicket(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashTicket(ticket: string): string {
  return crypto.createHash("sha256").update(ticket).digest("hex");
}

function fail(
  res: Response,
  code: string,
  message: string,
  status = 400,
): void {
  res.status(status).json({ status: "error", code, message });
}

/**
 * Match both the 10-digit ("9876543210") and 12-digit ("919876543210") forms,
 * since users may be stored either way. Same rule `lookupUser` uses.
 */
function mobileVariants(normMobile: string): { $in: string[] } {
  const variants = [normMobile];
  if (normMobile.startsWith("91") && normMobile.length === 12) {
    variants.push(normMobile.slice(2));
  }
  return { $in: variants };
}

// ── POST /v1/auth/login-url ──────────────────────────────────────────────────
// Body: { email?, mobile?, returnPath? }  — one of email/mobile is required.
export const createBbpLoginUrl = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  try {
    const projectId = req.publicApiProjectId!;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const rawMobile = String(req.body?.mobile || "").trim();
    const requestedPath = String(req.body?.returnPath || "").trim();

    if (!email && !rawMobile) {
      return void fail(
        res,
        "BAD_REQUEST",
        "Either email or mobile is required.",
      );
    }

    const wanted = requestedPath || DEFAULT_RETURN_PATH;
    const allowed = ALLOWED_RETURN_PATHS.find((p) => p.request === wanted);
    if (!allowed) {
      return void fail(
        res,
        "INVALID_RETURN_PATH",
        `returnPath must be one of: ${ALLOWED_RETURN_PATHS.map((p) => p.request).join(", ")}`,
      );
    }

    // Resolve the user INSIDE this API key's project. A key for project A can
    // never mint a login for a user who only belongs to project B.
    const projectObjectId = new mongoose.Types.ObjectId(projectId);
    const query: Record<string, unknown> = { projects: projectObjectId };

    if (email) {
      query.email = email;
    } else {
      const normMobile = normaliseMobile(rawMobile);
      if (!normMobile) {
        return void fail(
          res,
          "BAD_REQUEST",
          "Mobile must be 10–13 digits including country code.",
        );
      }
      query.mobile = mobileVariants(normMobile);
    }

    const user = await User.findOne(query)
      .select("_id email firstName lastName fullName mobile isActive")
      .lean();

    if (!user) {
      return void fail(
        res,
        "USER_NOT_FOUND",
        "No Helpdesk user with that identifier in this project. Create the user via POST /v1/users first, then retry.",
        404,
      );
    }

    if (user.isActive === false) {
      return void fail(
        res,
        "USER_INACTIVE",
        "This user is deactivated in the Helpdesk.",
        403,
      );
    }

    const project = await Project.findById(projectId)
      .select("name branding.customUrlPath")
      .lean();

    const projectPath = project?.branding?.customUrlPath;
    if (!projectPath) {
      return void fail(
        res,
        "PROJECT_NOT_CONFIGURED",
        "This project has no branding.customUrlPath configured, so a login URL cannot be built.",
        500,
      );
    }

    const ticket = mintTicket();
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000);

    await HandoffTicket.create({
      tokenHash: hashTicket(ticket),
      userId: user._id,
      projectId: projectObjectId,
      apiKeyId: req.publicApiKeyId
        ? new mongoose.Types.ObjectId(req.publicApiKeyId)
        : undefined,
      // Stored resolved, so redeem never has to re-derive it.
      returnPath: resolveReturnPath(allowed, projectPath),
      usedAt: null,
      expiresAt,
    });

    const loginUrl =
      `${config.urls.frontend}/${projectPath}/partner-login` +
      `?token=${encodeURIComponent(ticket)}`;

    // Audit: mint. A mint with no matching redeem inside the TTL is worth
    // alerting on. The ticket itself is never logged.
    console.log(
      `🔗 BBP handoff minted — user=${user.email} project=${project.name} ` +
        `path=${allowed.request} apiKey=${req.publicApiKeyId || "unknown"} ip=${req.ip}`,
    );

    res.json({
      status: "success",
      data: {
        login_url: loginUrl,
        token: ticket,
        expires_in: HANDOFF_TTL_SECONDS,
        user: {
          id: String(user._id),
          name:
            (user as any).fullName ||
            `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          email: user.email,
          mobile: (user as any).mobile || null,
        },
      },
    });
  } catch (e: any) {
    console.error("❌ BBP login-url error:", e);
    fail(res, "INTERNAL", e?.message || "Failed to create login URL.", 500);
  }
};

// ── POST /api/auth/handoff/redeem ────────────────────────────────────────────
// Body: { token }. Public — the handoff ticket IS the credential.
export const redeemBbpHandoff = async (
  req: PublicApiRequest,
  res: Response,
): Promise<void> => {
  // One generic message for every failure mode, so this endpoint can't be used
  // to probe which tickets exist or why one was rejected.
  const reject = (code: string) =>
    res.status(401).json({
      success: false,
      code,
      message:
        "This login link is invalid or has expired. Please try again from BBP.",
    });

  try {
    const ticket = String(req.body?.token || "").trim();
    if (!ticket) return void reject("HANDOFF_INVALID");

    const tokenHash = hashTicket(ticket);
    const now = new Date();

    // Atomic consume. Two parallel redeems of the same ticket: exactly one
    // matches `usedAt: null` and wins. Never read-then-write here.
    const claimed = await HandoffTicket.findOneAndUpdate(
      { tokenHash, usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now } },
      { new: true },
    ).lean();

    if (!claimed) {
      // Work out WHY, for the log only — the response stays generic.
      const existing = await HandoffTicket.findOne({ tokenHash })
        .select("usedAt expiresAt userId")
        .lean();

      if (existing?.usedAt) {
        // A ticket redeemed twice means the URL leaked or was shared. Loud.
        console.warn(
          `🚨 BBP handoff REPLAY — ticket already used at ${existing.usedAt.toISOString()} ` +
            `user=${existing.userId} ip=${req.ip} ua=${req.headers["user-agent"] || "-"}`,
        );
        return void reject("HANDOFF_ALREADY_USED");
      }

      if (existing) {
        console.log(`⏱️ BBP handoff expired — user=${existing.userId} ip=${req.ip}`);
        return void reject("HANDOFF_EXPIRED");
      }

      console.log(`❔ BBP handoff invalid — unknown ticket ip=${req.ip}`);
      return void reject("HANDOFF_INVALID");
    }

    const user = await User.findById(claimed.userId).populate({
      path: "role",
      populate: { path: "permissions" },
    });

    if (!user || user.isActive === false) return void reject("HANDOFF_INVALID");

    // The user must still belong to the project the ticket was minted for.
    const stillInProject = (user.projects || []).some(
      (p: any) => String(p) === String(claimed.projectId),
    );
    if (!stillInProject) return void reject("HANDOFF_INVALID");

    const project = await Project.findById(claimed.projectId)
      .select("name branding.customUrlPath")
      .lean();
    if (!project) return void reject("HANDOFF_INVALID");

    const sessionToken = await generateProjectJWT(
      user,
      { _id: project._id, name: (project as any).name },
      { expiresIn: SESSION_TTL },
    );

    const role: any = user.role;
    const permissions: string[] = Array.isArray(role?.permissions)
      ? role.permissions.map((p: any) => (typeof p === "string" ? p : p.code))
      : [];

    // Audit: redeem.
    console.log(
      `✅ BBP handoff redeemed — user=${user.email} project=${(project as any).name} ip=${req.ip}`,
    );

    res.json({
      success: true,
      data: {
        token: sessionToken,
        returnPath: claimed.returnPath || DEFAULT_RETURN_PATH,
        projectPath: project.branding?.customUrlPath || "",
        projectId: String(project._id),
        permissions,
        user: {
          id: String(user._id),
          email: user.email,
          name:
            (user as any).fullName ||
            `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          mobile: (user as any).mobile || null,
          role: role
            ? { _id: String(role._id), code: role.code, name: role.name }
            : null,
        },
      },
    });
  } catch (e: any) {
    console.error("❌ BBP handoff redeem error:", e);
    reject("HANDOFF_INVALID");
  }
};
