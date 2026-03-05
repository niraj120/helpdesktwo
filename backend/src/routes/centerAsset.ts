import express from "express";
import {
  bulkMapAssets,
  unmapCenterAssets,
  getCenterAssetMappings,
  getCenterAssetMappingById,
  updateCenterAssetMapping,
  uploadAssetPhotos,
  uploadCenterAssetPhotos,
  deleteCenterAssetPhoto,
  deleteCenterAssetMapping,
  getAssetMappingStats,
} from "../controllers/centerAssetController";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";

const router = express.Router();

// Stats
router.get(
  "/stats/summary",
  auth,
  checkPermission("ASSET_MANAGE"),
  getAssetMappingStats,
);

// Bulk map assets to centers
router.post("/bulk-map", auth, checkPermission("ASSET_CREATE"), bulkMapAssets);

// Unmap (delete) specific assets from a center
router.delete(
  "/unmap",
  auth,
  checkPermission("ASSET_DELETE"),
  unmapCenterAssets,
);

// Photo management
router.post(
  "/:id/photos",
  auth,
  checkPermission("ASSET_MANAGE"),
  (req, res, next) => {
    uploadAssetPhotos(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
      return uploadCenterAssetPhotos(req, res);
    });
  },
);
router.delete(
  "/:id/photos/:photoIndex",
  auth,
  checkPermission("ASSET_MANAGE"),
  deleteCenterAssetPhoto,
);

// CRUD operations
router.get("/", auth, checkPermission("ASSET_MANAGE"), getCenterAssetMappings);
router.get(
  "/:id",
  auth,
  checkPermission("ASSET_MANAGE"),
  getCenterAssetMappingById,
);
router.put(
  "/:id",
  auth,
  checkPermission("ASSET_MANAGE"),
  updateCenterAssetMapping,
);
router.delete(
  "/:id",
  auth,
  checkPermission("ASSET_DELETE"),
  deleteCenterAssetMapping,
);

export default router;
