import { Storage } from "@google-cloud/storage";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

// Try to initialize Google Cloud Storage, fall back to local storage if fails
let storage: Storage | null = null;
let useLocalStorage = false;
const localStoragePath = path.join(__dirname, "../../uploads/kb");

try {
  // Check if GCS_CREDENTIALS environment variable is set (JSON string)
  if (process.env.GCS_CREDENTIALS) {
    console.log("🔑 Using GCS credentials from environment variable");
    const credentials = JSON.parse(process.env.GCS_CREDENTIALS);
    storage = new Storage({
      projectId:
        process.env.GCS_PROJECT_ID ||
        credentials.project_id ||
        "helpdesk-dev-478611",
      credentials: credentials,
    });
    console.log("✅ GCS Storage initialized for Knowledge Base (from env)");
  }
  // Otherwise, check for key file
  else {
    const gcsKeyFile =
      process.env.GCS_KEY_FILE ||
      path.join(__dirname, "../../config/gcs-key.json");

    if (fs.existsSync(gcsKeyFile)) {
      storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID || "helpdesk-dev-478611",
        keyFilename: gcsKeyFile,
      });
      console.log(
        `✅ GCS Storage initialized for Knowledge Base (from file: ${gcsKeyFile})`,
      );
    } else {
      console.log("📁 Using local storage for Knowledge Base");
      console.log(`   Reason: GCS key file not found at: ${gcsKeyFile}`);
      console.log(
        "   Set GCS_KEY_FILE env variable or create backend/config/gcs-key.json",
      );
      useLocalStorage = true;
    }
  }
} catch (error) {
  console.warn("⚠️  GCS initialization failed, using local storage:", error);
  useLocalStorage = true;
}

// Create local directories if using local storage
if (useLocalStorage) {
  [
    localStoragePath,
    path.join(localStoragePath, "kb-pdfs"),
    path.join(localStoragePath, "kb-images"),
  ].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

const bucketName = process.env.GCS_BUCKET_NAME || "helpdesk-knowledge-base";
const bucket = storage ? storage.bucket(bucketName) : null;

export class GCSService {
  /**
   * Upload PDF to Google Cloud Storage (GCS Required)
   * Files are automatically organized by project: {projectCode}/kb-pdfs/{filename}
   */
  static async uploadPDF(
    file: Express.Multer.File,
    projectCode: string,
  ): Promise<{
    url: string;
    filename: string;
    size: number;
    fullPath: string;
  }> {
    if (!bucket) {
      throw new Error(
        "Google Cloud Storage is not configured. Please set GCS_PROJECT_ID, GCS_BUCKET_NAME, and GCS_KEY_FILE or GCS_CREDENTIALS environment variables.",
      );
    }

    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `${timestamp}_${sanitizedName}`;
    // Organize by project folder: {projectCode}/kb-pdfs/{filename}
    const fullPath = `${projectCode}/kb-pdfs/${filename}`;

    const blob = bucket.file(fullPath);

    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype,
        metadata: {
          uploadedBy: "SAC-Helpdesk",
          projectCode: projectCode,
          uploadTimestamp: new Date().toISOString(),
        },
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on("error", (err) => {
        console.error("GCS upload error:", err);
        reject(new Error("Failed to upload PDF to cloud storage"));
      });

      blobStream.on("finish", async () => {
        try {
          // Generate a v2 signed URL with a far-future expiry (~100 years).
          // v4 signed URLs are hard-capped at 7 days by GCS; v2 has no such limit.
          const [signedUrl] = await blob.getSignedUrl({
            version: "v2",
            action: "read",
            expires: new Date("2126-01-01T00:00:00Z"), // ~100 years
          });

          console.log(`☁️ GCS: Uploaded PDF to ${fullPath}`);
          console.log(`🔗 Signed URL generated (long-lived v2)`);
          resolve({
            url: signedUrl,
            filename: filename,
            fullPath: fullPath,
            size: file.size,
          });
        } catch (error) {
          console.error("GCS upload error:", error);
          reject(error);
        }
      });

      blobStream.end(file.buffer);
    });
  }

  /**
   * Delete PDF from Google Cloud Storage (GCS Required)
   * Supports both old flat structure and new project folder structure
   */
  static async deletePDF(filePathOrFilename: string): Promise<void> {
    try {
      if (!bucket) {
        console.error("GCS not configured - cannot delete PDF");
        return;
      }

      // filePathOrFilename can be either "PROJECT_CODE/kb-pdfs/file.pdf" or just "file.pdf"
      const fullPath = filePathOrFilename.includes("/")
        ? filePathOrFilename
        : `kb-pdfs/${filePathOrFilename}`;
      await bucket.file(fullPath).delete();
      console.log(`✅ Successfully deleted PDF from GCS: ${fullPath}`);
    } catch (error) {
      console.error("Delete error:", error);
      throw new Error(
        "Failed to delete PDF from GCS. Please check GCS configuration.",
      );
    }
  }

  /**
   * Get signed URL for temporary access (GCS Required)
   * Supports both old flat structure and new project folder structure
   */
  static async getSignedUrl(
    filePathOrFilename: string,
    expiresInMinutes: number = 60,
  ): Promise<string> {
    try {
      if (!bucket) {
        throw new Error(
          "Google Cloud Storage is not configured. Signed URLs require GCS.",
        );
      }

      let fullPath: string;
      // Strip query string first — signed URLs contain ?X-Goog-Algorithm=...&X-Goog-Signature=... etc.
      const pathWithoutQuery = filePathOrFilename.split("?")[0];
      // Accept full GCS storage URLs like https://storage.googleapis.com/{bucket}/{path}
      const gcsStoragePrefix = `https://storage.googleapis.com/${bucketName}/`;
      if (pathWithoutQuery.startsWith(gcsStoragePrefix)) {
        fullPath = pathWithoutQuery.slice(gcsStoragePrefix.length);
      } else if (
        pathWithoutQuery.startsWith("https://storage.googleapis.com/")
      ) {
        // URL for a different bucket — extract path after second slash segment
        const withoutScheme = pathWithoutQuery.replace(
          "https://storage.googleapis.com/",
          "",
        );
        fullPath = withoutScheme.slice(withoutScheme.indexOf("/") + 1);
      } else if (filePathOrFilename.includes("/")) {
        // Already a relative GCS path like "ticket-attachments/file.ext" or "PROJECT/kb-pdfs/file.pdf"
        fullPath = filePathOrFilename;
      } else {
        // Plain filename — default to kb-pdfs folder (backward compat)
        fullPath = `kb-pdfs/${filePathOrFilename}`;
      }

      const [url] = await bucket.file(fullPath).getSignedUrl({
        version: "v2",
        action: "read",
        expires: new Date("2126-01-01T00:00:00Z"), // long-lived v2 signed URL
      });
      return url;
    } catch (error) {
      console.error("GCS signed URL error:", error);
      throw new Error(
        "Failed to generate signed URL. Please check GCS configuration.",
      );
    }
  }

  /**
   * Upload role document to Google Cloud Storage (GCS Required)
   * Files organized by: role-documents/{filename}
   */
  static async uploadRoleDocument(file: Express.Multer.File): Promise<{
    url: string;
    filename: string;
    size: number;
    fullPath: string;
  }> {
    if (!bucket) {
      throw new Error(
        "Google Cloud Storage is not configured. Please set GCS_PROJECT_ID, GCS_BUCKET_NAME, and GCS_KEY_FILE or GCS_CREDENTIALS environment variables.",
      );
    }

    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `${timestamp}_${sanitizedName}`;
    const fullPath = `role-documents/${filename}`;

    const blob = bucket.file(fullPath);

    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype,
        metadata: {
          uploadedBy: "SAC-Helpdesk-RBAC",
          uploadTimestamp: new Date().toISOString(),
        },
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on("error", (err) => {
        console.error("GCS role document upload error:", err);
        reject(
          new Error(
            "Failed to upload role document to cloud storage. Please check GCS configuration.",
          ),
        );
      });

      blobStream.on("finish", async () => {
        try {
          // Make document publicly readable
          await blob.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${fullPath}`;
          console.log(`☁️ GCS: Uploaded role document to ${fullPath}`);
          resolve({
            url: publicUrl,
            filename,
            fullPath,
            size: file.size,
          });
        } catch (error) {
          console.error("GCS makePublic error:", error);
          reject(error);
        }
      });

      blobStream.end(file.buffer);
    });
  }

  /**
   * Delete role document from Google Cloud Storage (GCS Required)
   */
  static async deleteRoleDocument(fullPath: string): Promise<void> {
    try {
      if (!bucket) {
        console.error("GCS not configured - cannot delete role document");
        return;
      }

      await bucket.file(fullPath).delete();
      console.log(
        `✅ Successfully deleted role document from GCS: ${fullPath}`,
      );
    } catch (error) {
      console.error("GCS role document delete error:", error);
      // Don't throw error - document deletion is not critical
    }
  }

  /**
   * Upload image from rich text editor (GCS Required)
   * Images organized by project: {projectCode}/kb-images/{filename}
   */
  static async uploadEditorImage(
    file: Express.Multer.File,
    projectCode: string = "shared",
  ): Promise<string> {
    if (!bucket) {
      throw new Error(
        "Google Cloud Storage is not configured. Please set GCS_PROJECT_ID, GCS_BUCKET_NAME, and GCS_KEY_FILE or GCS_CREDENTIALS environment variables.",
      );
    }

    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `${uuidv4()}_${sanitizedName}`;
    // Organize by project folder: {projectCode}/kb-images/{filename}
    const fullPath = `${projectCode}/kb-images/${filename}`;

    const blob = bucket.file(fullPath);

    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype,
        metadata: {
          uploadedBy: "SAC-Helpdesk-Editor",
          uploadTimestamp: new Date().toISOString(),
        },
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on("error", (err) => {
        console.error("GCS image upload error:", err);
        reject(new Error("Failed to upload image to cloud storage"));
      });

      blobStream.on("finish", async () => {
        try {
          // Make image publicly readable
          await blob.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${fullPath}`;
          console.log(`☁️ GCS: Uploaded image to ${fullPath}`);
          resolve(publicUrl);
        } catch (error) {
          reject(error);
        }
      });

      blobStream.end(file.buffer);
    });
  }

  /**
   * Delete image from rich text editor (GCS Required)
   * Supports both old flat structure and new project folder structure
   */
  static async deleteEditorImage(filePathOrFilename: string): Promise<void> {
    try {
      if (!bucket) {
        console.error("GCS not configured - cannot delete image");
        return;
      }

      // Support both full path and filename only
      const fullPath = filePathOrFilename.includes("/")
        ? filePathOrFilename
        : `kb-images/${filePathOrFilename}`;
      await bucket.file(fullPath).delete();
      console.log(`✅ Successfully deleted image from GCS: ${fullPath}`);
    } catch (error) {
      console.error("GCS image delete error:", error);
      // Don't throw error - image deletion is not critical
    }
  }

  /**
   * Check if file exists in bucket (GCS Required)
   * Supports both old flat structure and new project folder structure
   */
  static async fileExists(filePathOrFilename: string): Promise<boolean> {
    try {
      if (!bucket) {
        console.error("GCS not configured - cannot check file existence");
        return false;
      }

      const fullPath = filePathOrFilename.includes("/")
        ? filePathOrFilename
        : `kb-pdfs/${filePathOrFilename}`;
      const [exists] = await bucket.file(fullPath).exists();
      return exists;
    } catch (error) {
      console.error("GCS file exists check error:", error);
      return false;
    }
  }

  /**
   * Upload project branding image (logo or favicon) to GCS
   * Images organized by: project-branding/{projectCode}/{type}/{filename}
   * @param imageData - Base64 encoded image data (with or without data URI prefix)
   * @param projectCode - Project code for organization
   * @param type - 'logo' or 'favicon'
   * @returns Public URL of the uploaded image
   */
  static async uploadProjectBrandingImage(
    imageData: string,
    projectCode: string,
    type: "logo" | "favicon",
  ): Promise<string> {
    if (!bucket) {
      throw new Error(
        "Google Cloud Storage is not configured. Please set GCS_PROJECT_ID, GCS_BUCKET_NAME, and GCS_KEY_FILE or GCS_CREDENTIALS environment variables.",
      );
    }

    // Parse base64 data - handle both with and without data URI prefix
    let mimeType = "image/png";
    let base64Data = imageData;

    if (imageData.includes("base64,")) {
      const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
      }
    }

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
      "image/x-icon": "ico",
      "image/vnd.microsoft.icon": "ico",
    };
    const ext = extMap[mimeType] || "png";

    const filename = `${type}_${Date.now()}.${ext}`;
    const fullPath = `project-branding/${projectCode}/${type}/${filename}`;

    const blob = bucket.file(fullPath);
    const buffer = Buffer.from(base64Data, "base64");

    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000", // Cache for 1 year
        metadata: {
          uploadedBy: "SAC-Helpdesk-Branding",
          projectCode: projectCode,
          imageType: type,
          uploadTimestamp: new Date().toISOString(),
        },
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on("error", (err) => {
        console.error(`GCS ${type} upload error:`, err);
        reject(new Error(`Failed to upload ${type} to cloud storage`));
      });

      blobStream.on("finish", async () => {
        try {
          // Make image publicly readable
          await blob.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${fullPath}`;
          console.log(`☁️ GCS: Uploaded project ${type} to ${fullPath}`);
          resolve(publicUrl);
        } catch (error) {
          console.error(`GCS makePublic error for ${type}:`, error);
          reject(error);
        }
      });

      blobStream.end(buffer);
    });
  }

  /**
   * Delete project branding image from GCS
   * @param url - The public URL of the image to delete
   */
  static async deleteProjectBrandingImage(url: string): Promise<void> {
    try {
      if (!bucket) {
        console.error("GCS not configured - cannot delete branding image");
        return;
      }

      // Extract file path from URL
      // URL format: https://storage.googleapis.com/{bucket}/project-branding/{projectCode}/{type}/{filename}
      const urlPattern = new RegExp(
        `https://storage\\.googleapis\\.com/${bucketName}/(.+)`,
      );
      const match = url.match(urlPattern);

      if (!match) {
        console.log("Not a GCS URL, skipping delete:", url);
        return;
      }

      const fullPath = match[1];
      await bucket.file(fullPath).delete();
      console.log(
        `✅ Successfully deleted branding image from GCS: ${fullPath}`,
      );
    } catch (error) {
      console.error("GCS branding image delete error:", error);
      // Don't throw error - image deletion is not critical
    }
  }

  /**
   * Upload ticket attachment (reply, online submission, offline submission)
   * Uses GCS when configured; falls back to local disk otherwise.
   * Always returns a `path` field usable directly as an href.
   */
  static async uploadTicketFile(
    file: Express.Multer.File,
    subfolder: string = "ticket-attachments",
  ): Promise<{ url: string; path: string; filename: string; size: number }> {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const uniqueFilename = `${file.fieldname || "file"}-${timestamp}-${random}${ext}`;

    if (bucket) {
      // ── GCS path ────────────────────────────────────────────────────
      const gcsPath = `${subfolder}/${uniqueFilename}`;
      const blob = bucket.file(gcsPath);

      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: file.mimetype,
          metadata: {
            uploadedBy: "SAC-Helpdesk-Ticket",
            uploadTimestamp: new Date().toISOString(),
          },
        },
      });

      return new Promise((resolve, reject) => {
        blobStream.on("error", (err) => {
          console.error("GCS ticket file upload error:", err);
          reject(new Error("Failed to upload ticket attachment to GCS"));
        });

        blobStream.on("finish", async () => {
          try {
            // Generate a v2 signed URL with a far-future expiry (~100 years).
            // v4 signed URLs are hard-capped at 7 days by GCS; v2 has no such limit.
            const [signedUrl] = await blob.getSignedUrl({
              version: "v2",
              action: "read",
              expires: new Date("2126-01-01T00:00:00Z"), // ~100 years
            });
            console.log(`☁️  GCS: Uploaded ticket attachment to ${gcsPath}`);
            console.log(`🔗 Signed URL generated (long-lived v2)`);
            resolve({
              url: signedUrl,
              path: signedUrl,
              filename: file.originalname,
              size: file.size,
            });
          } catch (signErr) {
            // Signing failed (e.g. missing Service Account Token Creator IAM role).
            // Fall back to the raw GCS path so at least the path is stored correctly.
            console.warn(
              "GCS signing failed for ticket attachment, storing raw path:",
              (signErr as Error).message,
            );
            const rawPath = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
            resolve({
              url: rawPath,
              path: rawPath,
              filename: file.originalname,
              size: file.size,
            });
          }
        });

        blobStream.end(file.buffer);
      });
    } else {
      // ── Local fallback ───────────────────────────────────────────────
      const localDir = path.join(__dirname, "../../uploads", subfolder);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      fs.writeFileSync(path.join(localDir, uniqueFilename), file.buffer);
      const relativePath = `/uploads/${subfolder}/${uniqueFilename}`;
      console.log(`📁 Local: Saved ticket attachment to ${relativePath}`);
      return {
        url: relativePath,
        path: relativePath,
        filename: file.originalname,
        size: file.size,
      };
    }
  }

  /**
   * Get file metadata (GCS Required)
   * Supports both old flat structure and new project folder structure
   */
  static async getFileMetadata(filePathOrFilename: string): Promise<any> {
    try {
      if (!bucket) {
        throw new Error(
          "Google Cloud Storage is not configured. Cannot retrieve file metadata.",
        );
      }

      const fullPath = filePathOrFilename.includes("/")
        ? filePathOrFilename
        : `kb-pdfs/${filePathOrFilename}`;
      const [metadata] = await bucket.file(fullPath).getMetadata();
      return metadata;
    } catch (error) {
      console.error("GCS metadata error:", error);
      throw new Error(
        "Failed to get file metadata. Please check GCS configuration.",
      );
    }
  }

  /**
   * Upload an email signature image to GCS with public read access.
   * Returns a fully-qualified public URL suitable for embedding in emails.
   * Falls back to local disk when GCS is not configured (returns relative path).
   */
  static async uploadSignatureImage(
    file: Express.Multer.File,
  ): Promise<{ url: string; isLocal: boolean }> {
    const ext = path.extname(file.originalname) || ".png";
    const filename = `${uuidv4()}${ext}`;

    if (bucket) {
      const fullPath = `email-signatures/${filename}`;
      const blob = bucket.file(fullPath);

      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: file.mimetype,
          cacheControl: "public, max-age=31536000",
          metadata: {
            uploadedBy: "SAC-Helpdesk-Signature",
            uploadTimestamp: new Date().toISOString(),
          },
        },
      });

      return new Promise((resolve, reject) => {
        blobStream.on("error", (err) => {
          console.error("GCS signature image upload error:", err);
          reject(new Error("Failed to upload signature image to GCS"));
        });

        blobStream.on("finish", async () => {
          try {
            await blob.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${fullPath}`;
            console.log(`☁️ GCS: Uploaded signature image to ${fullPath}`);
            resolve({ url: publicUrl, isLocal: false });
          } catch (error) {
            console.error("GCS makePublic error for signature image:", error);
            reject(error);
          }
        });

        blobStream.end(file.buffer);
      });
    } else {
      // Local fallback — save under uploads/signature-images/
      const localDir = path.join(__dirname, "../../uploads/signature-images");
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      fs.writeFileSync(path.join(localDir, filename), file.buffer);
      const relativePath = `/uploads/signature-images/${filename}`;
      console.log(`📁 Local: Saved signature image to ${relativePath}`);
      return { url: relativePath, isLocal: true };
    }
  }
}

export default GCSService;
