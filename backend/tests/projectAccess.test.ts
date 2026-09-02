/**
 * Phase 1 — project authorization guards (unit tests, no DB).
 *
 * Proves the cross-project denial logic for both guards:
 *   - requireProjectAccess  → project id comes from params/query/body
 *   - requireResourceProject → project comes from the stored resource
 *
 * res/next are mocked; requireResourceProject's model is a stub, so these run
 * without Mongo or a server.
 */
import {
  requireProjectAccess,
  requireResourceProject,
} from "../src/middleware/requireProjectAccess";

const PROJECT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

function makeRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn(() => res);
  return res;
}

/** A user whose union scope contains exactly the given project ids. */
function userWithProjects(ids: string[]) {
  return {
    userId: "u1",
    email: "agent@example.com",
    role: { code: "AGENT" },
    projects: ids, // role projects
    userDirectProjects: [],
  };
}

const superAdmin = {
  userId: "sa",
  email: "sa@example.com",
  role: { code: "SUPER_ADMIN" },
  projects: [],
  userDirectProjects: [],
};

describe("requireProjectAccess (project id from request)", () => {
  it("allows a user accessing their own project (param)", () => {
    const guard = requireProjectAccess("projectId");
    const req: any = { params: { projectId: PROJECT_A }, user: userWithProjects([PROJECT_A]) };
    const res = makeRes();
    const next = jest.fn();
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("denies (403) a user accessing another project", () => {
    const guard = requireProjectAccess("projectId");
    const req: any = { params: { projectId: PROJECT_B }, user: userWithProjects([PROJECT_A]) };
    const res = makeRes();
    const next = jest.fn();
    guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("super-admin may access any project", () => {
    const guard = requireProjectAccess("projectId");
    const req: any = { params: { projectId: PROJECT_B }, user: superAdmin };
    const res = makeRes();
    const next = jest.fn();
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("reads the project id from the body when no param (create routes)", () => {
    const guard = requireProjectAccess("projectId");
    const req: any = { params: {}, body: { projectId: PROJECT_A }, user: userWithProjects([PROJECT_A]) };
    const res = makeRes();
    const next = jest.fn();
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("400 when no project id is present anywhere", () => {
    const guard = requireProjectAccess("projectId");
    const req: any = { params: {}, user: userWithProjects([PROJECT_A]) };
    const res = makeRes();
    const next = jest.fn();
    guard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireResourceProject (project from the stored resource)", () => {
  // Stub model whose findById(...).select(...).lean() resolves to `doc`.
  const modelReturning = (doc: any): any => ({
    findById: () => ({ select: () => ({ lean: async () => doc }) }),
  });

  it("allows when the resource belongs to the user's project", async () => {
    const guard = requireResourceProject(modelReturning({ projectId: PROJECT_A }), "id");
    const req: any = { params: { id: "res1" }, user: userWithProjects([PROJECT_A]) };
    const res = makeRes();
    const next = jest.fn();
    await guard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("denies (403) when the resource belongs to another project", async () => {
    const guard = requireResourceProject(modelReturning({ projectId: PROJECT_B }), "id");
    const req: any = { params: { id: "res1" }, user: userWithProjects([PROJECT_A]) };
    const res = makeRes();
    const next = jest.fn();
    await guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("404 when the resource does not exist", async () => {
    const guard = requireResourceProject(modelReturning(null), "id");
    const req: any = { params: { id: "missing" }, user: userWithProjects([PROJECT_A]) };
    const res = makeRes();
    const next = jest.fn();
    await guard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("honours a custom project field (tickets use `project`)", async () => {
    const guard = requireResourceProject(modelReturning({ project: PROJECT_B }), "id", "project");
    const req: any = { params: { id: "t1" }, user: userWithProjects([PROJECT_A]) };
    const res = makeRes();
    const next = jest.fn();
    await guard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("super-admin may act on any resource", async () => {
    const guard = requireResourceProject(modelReturning({ projectId: PROJECT_B }), "id");
    const req: any = { params: { id: "res1" }, user: superAdmin };
    const res = makeRes();
    const next = jest.fn();
    await guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
