import GCSService from "../services/gcsService";

/**
 * Refresh a signed GCS URL if it appears to be expired or close to expiration.
 * Supports both v2 (Expires param) and v4 (X-Goog-Date + X-Goog-Expires) signed URLs.
 * Returns a fresh signed URL or the original URL if not a GCS URL.
 *
 * This is used by both kbPublicController (KB viewer for all roles) and
 * kbArticleController (private article management API) so that expired v4-signed
 * URLs stored in MongoDB get regenerated as long-lived v2 URLs on every request.
 */
export async function refreshSignedUrlIfNeeded(
  url: string | undefined,
): Promise<string | undefined> {
  if (!url) return url;

  // Only process GCS storage URLs
  if (!url.includes("storage.googleapis.com")) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    const now = Math.floor(Date.now() / 1000);
    let isExpired = false;

    // Check for v2 signed URL (Expires parameter is Unix timestamp)
    const expiresV2 = urlObj.searchParams.get("Expires");
    if (expiresV2) {
      const expiryTimestamp = parseInt(expiresV2, 10);
      // Expired or will expire within 24 hours
      isExpired = expiryTimestamp < now + 86400;
    }

    // Check for v4 signed URL (X-Goog-Date + X-Goog-Expires)
    const googDate = urlObj.searchParams.get("X-Goog-Date");
    const googExpires = urlObj.searchParams.get("X-Goog-Expires");
    if (googDate && googExpires) {
      // Parse X-Goog-Date format: 20260224T092016Z
      const year = parseInt(googDate.substring(0, 4), 10);
      const month = parseInt(googDate.substring(4, 6), 10) - 1;
      const day = parseInt(googDate.substring(6, 8), 10);
      const hour = parseInt(googDate.substring(9, 11), 10);
      const minute = parseInt(googDate.substring(11, 13), 10);
      const second = parseInt(googDate.substring(13, 15), 10);
      const startTime = Date.UTC(year, month, day, hour, minute, second) / 1000;
      const duration = parseInt(googExpires, 10);
      const expiryTimestamp = startTime + duration;
      // Expired or will expire within 24 hours
      isExpired = expiryTimestamp < now + 86400;
    }

    if (isExpired) {
      console.log(
        `[GCS] Refreshing expired signed URL (${url.includes("X-Goog-Algorithm") ? "v4" : "v2"})`,
      );
      return await GCSService.getSignedUrl(url);
    }

    // URL seems fine, return as-is
    return url;
  } catch (error) {
    console.error("[GCS] Error checking/refreshing signed URL:", error);
    // Try to refresh anyway since we know it's a GCS URL
    try {
      return await GCSService.getSignedUrl(url);
    } catch (refreshError) {
      console.error("[GCS] Failed to refresh URL:", refreshError);
      return url;
    }
  }
}
