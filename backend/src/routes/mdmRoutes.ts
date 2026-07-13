import { Router } from "express";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import {
  listMDMSources,
  getMDMSource,
  createMDMSource,
  updateMDMSource,
  deleteMDMSource,
  testMDMSource,
  testMDMCredentials,
  updateMDMCacheConfig,
  syncMDMDatasetNow,
  rebuildMDMJoinNow,
  listMDMSyncJobs,
  testMDMCacheLookup,
} from "../controllers/mdmController";

const router = Router();

router.use(auth);

// Test endpoints (specific paths before /:id)
router.post("/test-credentials", checkPermission("MDM_VIEW"), testMDMCredentials);
router.post("/:id/test", checkPermission("MDM_VIEW"), testMDMSource);
router.put("/:id/cache-config", checkPermission("MDM_MANAGE"), updateMDMCacheConfig);
router.post(
  "/:id/cache/datasets/:datasetKey/sync",
  checkPermission("MDM_MANAGE"),
  syncMDMDatasetNow,
);
router.post(
  "/:id/cache/joins/:joinKey/rebuild",
  checkPermission("MDM_MANAGE"),
  rebuildMDMJoinNow,
);
router.get("/:id/cache/jobs", checkPermission("MDM_VIEW"), listMDMSyncJobs);
router.get(
  "/:id/cache/test-lookup",
  checkPermission("MDM_VIEW"),
  testMDMCacheLookup,
);

// CRUD
router.get("/", checkPermission("MDM_VIEW"), listMDMSources);
router.get("/:id", checkPermission("MDM_VIEW"), getMDMSource);
router.post("/", checkPermission("MDM_MANAGE"), createMDMSource);
router.put("/:id", checkPermission("MDM_MANAGE"), updateMDMSource);
router.delete("/:id", checkPermission("MDM_MANAGE"), deleteMDMSource);

export default router;
