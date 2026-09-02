import { Response, NextFunction } from "express";
import { Model } from "mongoose";
import { AuthRequest } from "./auth";
import { getProjectScope, canAccessProject } from "../utils/projectScope";

/**
 * Route guard that restricts a per-project endpoint to the project(s) the
 * caller is actually assigned to. Super Admins bypass (getProjectScope returns
 * `{ all: true }`), so they retain global access.
 *
 * Use AFTER authMiddleware and the permission check — the permission answers
 * "may this role do X at all", this answers "…for THIS project". Pair them so a
 * project-scoped admin can't edit another project's settings by changing the id.
 *
 *   router.put("/:id/tata-voice",
 *     authMiddleware,
 *     checkPermission("PROJECT_MANAGE_SETTINGS"),
 *     requireProjectAccess(),           // defaults to req.params.id
 *     updateTataVoiceConfig);
 */
export const requireProjectAccess =
  (param = "id") =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    // Accept the project id from the path param, query string, or body — so the
    // same guard covers both `/:projectId/...` routes and body-based creates
    // (e.g. POST /faqs with { projectId } in the body).
    const projectId =
      req.params[param] ??
      (req.query?.[param] as string | undefined) ??
      req.body?.[param];
    if (!projectId) {
      res
        .status(400)
        .json({ success: false, message: `Missing project id (${param})` });
      return;
    }
    const scope = getProjectScope(req);
    if (canAccessProject(scope, projectId)) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      message: "Forbidden: this project is outside your access scope",
    });
  };

/**
 * Route guard for resource-scoped endpoints keyed on a RESOURCE id (not a
 * project id) — e.g. PUT /statuses/:statusId, DELETE /categories/:categoryId.
 *
 * The URL param is the resource's own id, so we cannot authorize the project
 * directly. Instead: load the stored record, read its own project field, and
 * authorize THAT project. This is the "resource-owns-project" rule — it stops a
 * project-scoped admin editing another project's resource by guessing its id.
 *
 * Use AFTER authMiddleware + the permission check:
 *   router.put("/:statusId",
 *     authMiddleware,
 *     checkPermission("MASTER_DATA_MANAGE_STATUSES"),
 *     requireResourceProject(Status, "statusId"),
 *     updateStatus);
 *
 * @param model        the Mongoose model holding the resource
 * @param param        the route param carrying the resource id (default "id")
 * @param projectField the field on the resource holding its project ObjectId
 *                     (default "projectId"; Ticket/Asset use "project")
 */
export const requireResourceProject =
  (model: Model<any>, param = "id", projectField = "projectId") =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params[param];
    if (!id) {
      res
        .status(400)
        .json({ success: false, message: `Missing resource id (${param})` });
      return;
    }
    let doc: any;
    try {
      doc = await model.findById(id).select(projectField).lean();
    } catch {
      res.status(400).json({ success: false, message: "Invalid resource id" });
      return;
    }
    if (!doc) {
      res.status(404).json({ success: false, message: "Resource not found" });
      return;
    }
    const projectId = String(doc[projectField] ?? "");
    const scope = getProjectScope(req);
    if (canAccessProject(scope, projectId)) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      message: "Forbidden: this resource is outside your project access scope",
    });
  };

export default requireProjectAccess;
