/**
 * Cluster (school-group) routes. Phase 1 — Service Request master data.
 */
import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth";
import { checkPermission } from "../../../middleware/permissions";
import {
  listClusters,
  createCluster,
  updateCluster,
  deleteCluster,
} from "../controllers/clusterController";

const router = Router();
router.use(authMiddleware);

router.get(
  "/",
  checkPermission(["SR_CONFIG_MANAGE", "PROJECT_VIEW_ALL"]),
  listClusters,
);
router.post("/", checkPermission("SR_CONFIG_MANAGE"), createCluster);
router.put("/:id", checkPermission("SR_CONFIG_MANAGE"), updateCluster);
router.delete("/:id", checkPermission("SR_CONFIG_MANAGE"), deleteCluster);

export default router;
