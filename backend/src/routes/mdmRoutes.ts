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
} from "../controllers/mdmController";

const router = Router();

router.use(auth);

// Test endpoints (specific paths before /:id)
router.post("/test-credentials", checkPermission("MDM_VIEW"), testMDMCredentials);
router.post("/:id/test", checkPermission("MDM_VIEW"), testMDMSource);

// CRUD
router.get("/", checkPermission("MDM_VIEW"), listMDMSources);
router.get("/:id", checkPermission("MDM_VIEW"), getMDMSource);
router.post("/", checkPermission("MDM_MANAGE"), createMDMSource);
router.put("/:id", checkPermission("MDM_MANAGE"), updateMDMSource);
router.delete("/:id", checkPermission("MDM_MANAGE"), deleteMDMSource);

export default router;
