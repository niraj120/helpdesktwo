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
import {
  requireProjectAccess,
  requireResourceProject,
} from "../middleware/requireProjectAccess";
import { Asset } from "../models/Asset";

const router = express.Router();
const ownsAsset = requireResourceProject(Asset, "id");

// Enforce project scope for project-portal logins on all asset routes.
// enforceAssetProjectScope only guards project-portal tokens; the guards below
// additionally enforce the union project scope for multi-project/global users.
router.use(auth, enforceAssetProjectScope);

// Get asset categories
router.get("/categories/list", getAssetCategories);

// CRUD operations
router.post("/", checkPermission("ASSET_CREATE"), requireProjectAccess("projectId"), createAsset);
router.get("/", checkPermission("ASSET_VIEW"), getAllAssets);
router.get("/:id", checkPermission("ASSET_VIEW"), ownsAsset, getAssetById);
router.put("/:id", checkPermission("ASSET_EDIT"), ownsAsset, updateAsset);
router.delete("/:id", checkPermission("ASSET_DELETE"), ownsAsset, deleteAsset);

export default router;
