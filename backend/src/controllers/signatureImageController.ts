import { Request, Response } from "express";
import multer from "multer";
import { GCSService } from "../services/gcsService";
import config from "../config";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed"));
    }
  },
});

export const uploadSignatureImageMiddleware = upload.single("image");

/**
 * @route   POST /api/upload/signature-image
 * @desc    Upload an email signature image; returns a publicly accessible URL.
 *          Uses GCS when configured, falls back to the backend's local /uploads dir.
 * @access  Private (any authenticated user)
 */
export const uploadSignatureImage = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const result = await GCSService.uploadSignatureImage(file);

    // For local-storage fallback the result is a relative path; prefix with the
    // backend's public base URL so email clients can reach the image.
    let imageUrl = result.url;
    if (result.isLocal) {
      const backendBase = config.urls.backend.replace(/\/$/, "");
      imageUrl = `${backendBase}${result.url}`;
    }

    return res.status(200).json({ success: true, url: imageUrl });
  } catch (error: any) {
    console.error("Error uploading signature image:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload image",
    });
  }
};
