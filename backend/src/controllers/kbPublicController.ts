import { Request, Response } from "express";
import KBArticle from "../models/KBArticle";
import KBLevel from "../models/KBLevel";
import KBArticleLevelMapping from "../models/KBArticleLevelMapping";
import KBTable from "../models/KBTable";
import mongoose from "mongoose";
import GCSService from "../services/gcsService";

// Student role ID - used for public student portal access
const STUDENT_ROLE_ID = "6915aeb10561bff7f36244a9";

/**
 * Refresh a signed GCS URL if it appears to be expired or close to expiration.
 * Supports both v2 (Expires param) and v4 (X-Goog-Date + X-Goog-Expires) signed URLs.
 * Returns a fresh signed URL or the original URL if not a GCS URL.
 */
async function refreshSignedUrlIfNeeded(
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
      console.log(`🔄 Refreshing expired GCS signed URL`);
      return await GCSService.getSignedUrl(url);
    }

    // URL seems fine, return as-is
    return url;
  } catch (error) {
    console.error("Error checking/refreshing signed URL:", error);
    // Try to refresh anyway since we know it's a GCS URL
    try {
      return await GCSService.getSignedUrl(url);
    } catch (refreshError) {
      console.error("Failed to refresh URL:", refreshError);
      return url;
    }
  }
}

/**
 * Build visibility filter for KB articles based on user authentication and role
 * @param req - Express request object
 * @param context - Optional context override (e.g., 'student-portal' for public student pages)
 */
function buildVisibilityFilter(req: Request): any {
  const user = (req as any).user;
  const context = req.query.context as string;

  // If context is student-portal and user is not authenticated, treat as Student role
  if (!user && context === "student-portal") {
    console.log(
      "[KB_VISIBILITY] Student portal context - applying Student role visibility",
    );
    return {
      $or: [
        { visibility: { $exists: false } }, // Legacy articles without visibility field
        { visibility: "all" },
        { visibility: "public" },
        { alsoShowOnPublicPortal: true }, // Explicitly opted-in to show on portal
        {
          visibility: "role_based",
          visibleToRoles: new mongoose.Types.ObjectId(STUDENT_ROLE_ID),
        },
      ],
    };
  }

  if (!user) {
    // Unauthenticated user - can only see 'all' and 'public' articles
    return {
      $or: [
        { visibility: { $exists: false } }, // Legacy articles without visibility field
        { visibility: "all" },
        { visibility: "public" },
        { alsoShowOnPublicPortal: true }, // Explicitly opted-in to show on portal
      ],
    };
  }

  // Support both 'role' and 'roleId' field names from different auth middlewares
  // Also handle case where role might be an ObjectId object
  let userRoleId: string | null = null;
  const roleValue = user.roleId || user.role;

  console.log("[KB_VISIBILITY] roleValue type:", typeof roleValue);
  console.log("[KB_VISIBILITY] roleValue:", JSON.stringify(roleValue));

  if (roleValue) {
    // If it's already an ObjectId object, get string representation
    if (typeof roleValue === "object" && roleValue._id) {
      userRoleId = roleValue._id.toString();
      console.log("[KB_VISIBILITY] Extracted _id from object:", userRoleId);
    } else if (typeof roleValue === "object" && roleValue.toString) {
      userRoleId = roleValue.toString();
      console.log("[KB_VISIBILITY] Used toString():", userRoleId);
    } else if (typeof roleValue === "string") {
      userRoleId = roleValue;
      console.log("[KB_VISIBILITY] Used string directly:", userRoleId);
    }
  }

  console.log("[KB_VISIBILITY] Final userRoleId:", userRoleId);
  console.log(
    "[KB_VISIBILITY] Valid ObjectId format:",
    userRoleId ? /^[0-9a-fA-F]{24}$/.test(userRoleId) : false,
  );

  // Check if this is a Student role - students should see 'public' articles
  const isStudentRole = userRoleId === STUDENT_ROLE_ID;

  // Authenticated internal user (DNO, Counselor, etc.) - can see 'all', 'internal', and role-based articles
  // NOTE: 'public' visibility is ONLY for public URLs (student portal, submit-ticket) - NOT for internal staff
  const visibilityConditions: any[] = [
    { visibility: { $exists: false } }, // Legacy articles without visibility field
    { visibility: "all" },
    { visibility: "internal" },
  ];

  // Students should also see 'public' articles
  if (isStudentRole) {
    visibilityConditions.push({ visibility: "public" });
  }

  // Add role-based filter if user has a valid role ID (24 hex chars)
  if (userRoleId && /^[0-9a-fA-F]{24}$/.test(userRoleId)) {
    visibilityConditions.push({
      visibility: "role_based",
      visibleToRoles: new mongoose.Types.ObjectId(userRoleId),
    });
  }

  return { $or: visibilityConditions };
}

/**
 * Get all public KB articles organized by levels
 */
export const getPublicArticles = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId, levelId, search } = req.query;

    // For super admin with 'all', skip project filter validation
    const isAllProjects = projectId === "all";

    if (!projectId) {
      res.status(400).json({
        success: false,
        message: "Project ID is required",
      });
      return;
    }

    // Get all active levels for the project (or all projects for super admin)
    const levelsQuery: any = {
      status: "active",
    };

    // Only filter by project if not 'all'
    if (!isAllProjects) {
      levelsQuery.projectIds = projectId;
    }

    if (levelId) {
      levelsQuery._id = levelId;
    }

    const levels = await KBLevel.find(levelsQuery)
      .sort({ levelOrder: 1 })
      .lean();

    // OPTIMIZED: Batch fetch all data upfront instead of N+1 queries per level
    const levelIds = levels.map((l) => l._id);

    // Batch fetch all mappings for all levels in one query
    const allMappings = await KBArticleLevelMapping.find({
      levelId: { $in: levelIds },
    }).lean();

    // Get all unique article IDs
    const allArticleIds = [
      ...new Set(allMappings.map((m) => m.articleId.toString())),
    ];

    // Build article filter for batch fetch
    // Note: Most articles don't have publishType field, so we treat missing/null as "immediate" (published)
    const publishTypeFilter = {
      $or: [
        { publishType: { $exists: false } }, // No publishType = immediately published
        { publishType: null }, // Null publishType = immediately published
        { publishType: "immediate" },
        {
          publishType: "scheduled",
          scheduledPublishDate: { $lte: new Date() },
          $or: [
            { scheduledUnpublishDate: { $gte: new Date() } },
            { scheduledUnpublishDate: null },
            { scheduledUnpublishDate: { $exists: false } },
          ],
        },
      ],
    };

    // Build visibility filter based on user authentication and role
    const visibilityFilter = buildVisibilityFilter(req);
    console.log("[KB_VISIBILITY] User:", (req as any).user?.email);
    console.log("[KB_VISIBILITY] User role:", (req as any).user?.role);
    console.log(
      "[KB_VISIBILITY] Filter:",
      JSON.stringify(visibilityFilter, null, 2),
    );

    const articleFilter: any = {
      _id: { $in: allArticleIds },
      status: "active",
      $and: [publishTypeFilter, visibilityFilter],
    };

    if (!isAllProjects) {
      articleFilter.projectIds = projectId;
    }

    if (search) {
      articleFilter.$text = { $search: search as string };
    }

    // Batch fetch all articles (exclude htmlContent in list for performance)
    const allArticles = await KBArticle.find(articleFilter)
      .select(
        "documentName documentType pdfUrl externalUrl description showNewTag isFeatured author publishedAt viewsCount tags displayOrder",
      )
      .sort({ isFeatured: -1, displayOrder: 1, publishedAt: -1 })
      .lean();

    console.log("[KB_VISIBILITY] Articles found:", allArticles.length);
    console.log(
      "[KB_VISIBILITY] Article names:",
      allArticles.map((a) => a.documentName),
    );

    // Batch fetch all tables for all levels
    const tablesQuery: any = {
      levelIds: { $in: levelIds },
      status: "active",
    };
    if (!isAllProjects) {
      tablesQuery.projectId = projectId;
    }

    const allTables = await KBTable.find(tablesQuery)
      .select("tableName description status levelIds displayStyle dataSource")
      .sort({ tableName: 1 })
      .lean();

    // Create lookup maps for O(1) access
    const articleMap = new Map(allArticles.map((a) => [a._id.toString(), a]));
    const mappingsByLevel = new Map<string, string[]>();
    allMappings.forEach((m) => {
      const levelId = m.levelId.toString();
      if (!mappingsByLevel.has(levelId)) {
        mappingsByLevel.set(levelId, []);
      }
      mappingsByLevel.get(levelId)!.push(m.articleId.toString());
    });

    // Map levels with their articles and tables (no additional queries)
    const levelsWithArticles = await Promise.all(
      levels.map(async (level) => {
        const levelIdStr = level._id.toString();
        const articleIdsForLevel = mappingsByLevel.get(levelIdStr) || [];

        // Get articles for this level from the map
        const articles = articleIdsForLevel
          .map((id) => articleMap.get(id))
          .filter(Boolean)
          .sort((a: any, b: any) => {
            // Featured articles first
            if (a.isFeatured !== b.isFeatured) return b.isFeatured ? 1 : -1;
            // Then sort by displayOrder ascending (lower number = higher priority/first)
            const orderA = Number(a.displayOrder) || 0;
            const orderB = Number(b.displayOrder) || 0;
            return orderA - orderB;
          });

        // Get tables that include this level
        const tables = allTables.filter((t) =>
          t.levelIds?.some((lid: any) => lid.toString() === levelIdStr),
        );

        // Refresh signed URLs for articles with pdfUrl
        const articlesWithFreshUrls = await Promise.all(
          articles.map(async (article: any) => ({
            id: article._id,
            documentName: article.documentName,
            documentType: article.documentType,
            pdfUrl: await refreshSignedUrlIfNeeded(article.pdfUrl),
            externalUrl: article.externalUrl,
            description: article.description,
            showNewTag: article.showNewTag,
            isFeatured: article.isFeatured,
            author: article.author,
            publishedAt: article.publishedAt,
            viewsCount: article.viewsCount,
            tags: article.tags,
          })),
        );

        return {
          id: level._id,
          levelName: level.levelName,
          levelOrder: level.levelOrder,
          levelIcon: level.levelIcon,
          articles: articlesWithFreshUrls,
          tables: tables.map((table: any) => ({
            _id: table._id,
            tableName: table.tableName,
            description: table.description,
            status: table.status,
            displayStyle: table.displayStyle || "table",
            dataSource: table.dataSource || "manual",
          })),
        };
      }),
    );

    res.status(200).json({
      success: true,
      data: {
        levels: levelsWithArticles,
      },
    });
  } catch (error: any) {
    console.error("Get public KB articles error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch knowledge base articles",
      error: error.message,
    });
  }
};

/**
 * Get single public article with view increment
 */
export const getPublicArticleById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { projectId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid article ID",
      });
      return;
    }

    if (!projectId) {
      res.status(400).json({
        success: false,
        message: "Project ID is required",
      });
      return;
    }

    // Build visibility filter based on user authentication and role
    const visibilityFilter = buildVisibilityFilter(req);

    const articleQuery: any = {
      _id: id,
      status: "active",
      projectIds: projectId,
      ...visibilityFilter,
    };

    const article = await KBArticle.findOne(articleQuery).select(
      "-createdBy -updatedBy",
    );

    if (!article) {
      res.status(404).json({
        success: false,
        message: "Article not found or not available",
      });
      return;
    }

    // Cast article to any for property access
    const articleData = article as any;

    // Check if article is published
    // If publishType is missing/null, treat as immediately published (default)
    const isPublished =
      !articleData.publishType ||
      articleData.publishType === "immediate" ||
      (articleData.publishType === "scheduled" &&
        articleData.scheduledPublishDate &&
        articleData.scheduledPublishDate <= new Date() &&
        (!articleData.scheduledUnpublishDate ||
          articleData.scheduledUnpublishDate >= new Date()));

    if (!isPublished) {
      res.status(404).json({
        success: false,
        message: "Article is not yet published",
      });
      return;
    }

    // Get level mappings
    const mappings = await KBArticleLevelMapping.find({
      articleId: id,
    }).populate("levelId", "levelName levelOrder");

    // Increment view count
    article.viewsCount += 1;
    await article.save();

    // Get related articles (same levels, different article)
    const relatedArticleIds = await KBArticleLevelMapping.find({
      levelId: { $in: mappings.map((m) => m.levelId) },
      articleId: { $ne: id },
    })
      .limit(5)
      .distinct("articleId");

    const relatedArticles = await KBArticle.find({
      _id: { $in: relatedArticleIds },
      status: "active",
    })
      .select("documentName documentType isFeatured")
      .limit(5)
      .lean();

    // Refresh signed URL if needed
    const freshPdfUrl = await refreshSignedUrlIfNeeded(article.pdfUrl);

    res.status(200).json({
      success: true,
      data: {
        article: {
          id: article._id,
          documentName: article.documentName,
          documentType: article.documentType,
          pdfUrl: freshPdfUrl,
          htmlContent: article.htmlContent,
          author: article.author,
          publishedAt: article.publishedAt,
          viewsCount: article.viewsCount,
          tags: article.tags,
        },
        levels: mappings.map((m) => m.levelId),
        relatedArticles,
      },
    });
  } catch (error: any) {
    console.error("Get public article by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch article",
      error: error.message,
    });
  }
};

/**
 * Search public articles
 */
export const searchPublicArticles = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { q, projectId } = req.query;

    if (!q || !projectId) {
      res.status(400).json({
        success: false,
        message: "Search query and project ID are required",
      });
      return;
    }

    const searchTerm = q as string;
    const searchRegex = new RegExp(searchTerm, "i"); // Case-insensitive search
    const isAllProjects = projectId === "all";

    // Search across multiple fields including HTML content
    const filter: any = {
      status: "active",
      $or: [
        { documentName: searchRegex },
        { description: searchRegex },
        { htmlContent: searchRegex },
        { author: searchRegex },
        { tags: searchRegex },
      ],
    };

    // Only filter by project if not 'all'
    if (!isAllProjects) {
      filter.projectIds = projectId;
    }

    // Published articles only
    // Note: Most articles don't have publishType field, so we treat missing/null as "immediate" (published)
    const publishTypeFilter = {
      $or: [
        { publishType: { $exists: false } },
        { publishType: null },
        { publishType: "immediate" },
        {
          publishType: "scheduled",
          scheduledPublishDate: { $lte: new Date() },
          $or: [
            { scheduledUnpublishDate: { $gte: new Date() } },
            { scheduledUnpublishDate: null },
            { scheduledUnpublishDate: { $exists: false } },
          ],
        },
      ],
    };

    // Build visibility filter based on user authentication and role
    const visibilityFilter = buildVisibilityFilter(req);

    filter.$and = [publishTypeFilter, visibilityFilter];

    const articles = await KBArticle.find(filter)
      .select(
        "documentName documentType pdfUrl externalUrl htmlContent description showNewTag isFeatured author publishedAt viewsCount tags",
      )
      .sort({ isFeatured: -1, publishedAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      data: articles,
    });
  } catch (error: any) {
    console.error("Search public articles error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search articles",
      error: error.message,
    });
  }
};
