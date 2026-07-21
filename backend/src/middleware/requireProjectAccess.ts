import { Response, NextFunction } from "express";
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
    const projectId = req.params[param];
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

export default requireProjectAccess;
