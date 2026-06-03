import express from "express";
import {
  createAsset,
  getAllAssets,
  getAssetById,
  updateAsset,
  deleteAsset,
  getAssetCategories,
} from "../controllers/assetController";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { enforceAssetProjectScope } from "../middleware/projectScope";

const router = express.Router();

// Enforce project scope for project-portal logins on all asset routes
router.use(auth, enforceAssetProjectScope);

// Get asset categories
router.get("/categories/list", getAssetCategories);

// CRUD operations
router.post("/", checkPermission("ASSET_CREATE"), createAsset);
router.get("/", checkPermission("ASSET_VIEW"), getAllAssets);
router.get("/:id", checkPermission("ASSET_VIEW"), getAssetById);
router.put("/:id", checkPermission("ASSET_EDIT"), updateAsset);
router.delete("/:id", checkPermission("ASSET_DELETE"), deleteAsset);

export default router;
