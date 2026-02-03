import { Request, Response } from 'express';
import KBArticle from '../models/KBArticle';
import KBArticleLevelMapping from '../models/KBArticleLevelMapping';
import KBLevel from '../models/KBLevel';
import GCSService from '../services/gcsService';
import mongoose from 'mongoose';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Create a new KB Article
 */
export const createArticle = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      documentName,
      documentType,
      projectIds: rawProjectIds,
      htmlContent,
      description,
      externalUrl,
      publishedDate,
      levelIds: rawLevelIds,
      tags: rawTags,
      author,
      status,
      isFeatured,
      showNewTag,
      displayOrder,
    } = req.body;
    const userId = (req as any).user.userId;
    const file = req.file;

    // Parse JSON strings from FormData
    const projectIds = typeof rawProjectIds === 'string' ? JSON.parse(rawProjectIds) : rawProjectIds;
    const levelIds = typeof rawLevelIds === 'string' ? JSON.parse(rawLevelIds) : rawLevelIds;
    const tags = typeof rawTags === 'string' ? JSON.parse(rawTags) : rawTags;

    // Validation
    if (!documentName || !documentType || !projectIds || projectIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Document name, type, and at least one project are required',
      });
      return;
    }

    if (!levelIds || levelIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'At least one level mapping is required',
      });
      return;
    }

    // Handle PDF upload
    let pdfUrl, pdfFilename, pdfSize;
    if ((documentType === 'pdf' || documentType === 'both') && file) {
      const projectCode = Array.isArray(projectIds) ? projectIds[0] : projectIds;
      const uploadResult = await GCSService.uploadPDF(file, projectCode);
      pdfUrl = uploadResult.url;
      pdfFilename = uploadResult.filename;
      pdfSize = uploadResult.size;
    }

    // Sanitize HTML content
    const sanitizedHtml = htmlContent ? DOMPurify.sanitize(htmlContent) : undefined;

    // Create article
    const newArticle = new KBArticle({
      documentName,
      documentType,
      projectIds: Array.isArray(projectIds) ? projectIds : [projectIds],
      pdfUrl,
      pdfFilename,
      pdfSize,
      htmlContent: sanitizedHtml,
      description,
      externalUrl,
      publishedDate: publishedDate ? new Date(publishedDate) : new Date(),
      tags: tags || [],
      author: author || (req as any).user.name,
      status: status || 'active',
      isFeatured: isFeatured || false,
      showNewTag: showNewTag !== undefined ? showNewTag : true,
      displayOrder: displayOrder || 0,
      createdBy: userId,
      publishedAt: new Date(),
    });

    await newArticle.save();

    // Create level mappings
    const mappingPromises = levelIds.map((levelId: string) =>
      new KBArticleLevelMapping({
        articleId: newArticle._id,
        levelId: levelId,
      }).save()
    );

    await Promise.all(mappingPromises);

    res.status(201).json({
      success: true,
      message: 'KB Article created successfully',
      data: newArticle,
    });
  } catch (error: any) {
    console.error('Create KB Article error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create KB Article',
      error: error.message,
    });
  }
};

/**
 * Get all KB Articles (Admin)
 */
export const getArticles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, levelId, status, page = 1, limit = 20, search } = req.query;

    const filter: any = {};

    // Only add project filter if projectId is provided and not 'all' (super admin view)
    if (projectId && projectId !== 'all') {
      filter.projectIds = projectId;
    }

    if (status) {
      const validStatuses = ['active', 'draft', 'archived'];
      if (validStatuses.includes(status as string)) {
        filter.status = status;
      }
    }

    if (search) {
      // Sanitize search to prevent injection
      const sanitizedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
      if (sanitizedSearch) {
        filter.$or = [
          { title: { $regex: sanitizedSearch, $options: 'i' } },
          { excerpt: { $regex: sanitizedSearch, $options: 'i' } },
          { tags: { $regex: sanitizedSearch, $options: 'i' } },
        ];
      }
    }

    // ============================================
    // ADDITIONAL FILTERS (date range, tags, author, featured)
    // ============================================
    
    // Date range filter (publishedAt)
    if (req.query.publishedAfter || req.query.publishedBefore) {
      filter.publishedAt = {};
      if (req.query.publishedAfter) {
        const afterDate = new Date(req.query.publishedAfter as string);
        if (!isNaN(afterDate.getTime())) filter.publishedAt.$gte = afterDate;
      }
      if (req.query.publishedBefore) {
        const beforeDate = new Date(req.query.publishedBefore as string);
        if (!isNaN(beforeDate.getTime())) {
          beforeDate.setHours(23, 59, 59, 999);
          filter.publishedAt.$lte = beforeDate;
        }
      }
      if (Object.keys(filter.publishedAt).length === 0) delete filter.publishedAt;
    }
    
    // Tags filter
    if (req.query.tags) {
      const tagList = String(req.query.tags).split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        filter.tags = { $in: tagList };
      }
    }
    
    // Author filter
    if (req.query.author) {
      filter.createdBy = req.query.author;
    }
    
    // Featured filter
    if (req.query.isFeatured === 'true') {
      filter.isFeatured = true;
    } else if (req.query.isFeatured === 'false') {
      filter.isFeatured = false;
    }

    // ============================================
    // SORTING
    // ============================================
    const allowedSortFields = ['createdAt', 'publishedAt', 'viewCount', 'title', 'displayOrder'];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string) ? req.query.sortBy as string : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    // Maintain featured priority unless explicitly sorting by another field
    const sortObj: Record<string, 1 | -1> = req.query.sortBy 
      ? { [sortBy]: sortOrder as 1 | -1 } 
      : { isFeatured: -1, displayOrder: 1, createdAt: -1 };

    // Enforce max limit
    const effectiveLimit = Math.min(Number(limit) || 20, 100);
    const skip = (Number(page) - 1) * effectiveLimit;

    // OPTIMIZED: Exclude heavy content field from list view, use excerpt instead
    let query = KBArticle.find(filter)
      .select('-content -htmlContent -revisionHistory')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .sort(sortObj)
      .skip(skip)
      .limit(effectiveLimit);

    const articles = await query.lean();

    // Optimized: Batch fetch all level mappings instead of N+1 queries
    // This reduces database calls from N+1 to just 2
    const articleIds = articles.map(a => a._id);
    const allMappings = await KBArticleLevelMapping.find({
      articleId: { $in: articleIds },
    })
      .populate('levelId', 'levelName')
      .lean();

    // Group mappings by article ID
    const mappingsByArticle = new Map<string, any[]>();
    allMappings.forEach((mapping: any) => {
      const articleIdStr = mapping.articleId.toString();
      if (!mappingsByArticle.has(articleIdStr)) {
        mappingsByArticle.set(articleIdStr, []);
      }
      mappingsByArticle.get(articleIdStr)!.push(mapping.levelId);
    });

    // Attach levels to articles
    const articlesWithLevels = articles.map((article) => ({
      ...article,
      levels: mappingsByArticle.get(article._id.toString()) || [],
    }));

    // Filter by level if specified
    let filteredArticles = articlesWithLevels;
    if (levelId) {
      filteredArticles = articlesWithLevels.filter((article) =>
        article.levels.some((level: any) => level._id.toString() === levelId)
      );
    }

    const total = await KBArticle.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        articles: filteredArticles,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    console.error('Get KB Articles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KB Articles',
      error: error.message,
    });
  }
};

/**
 * Get single KB Article by ID
 */
export const getArticleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid article ID',
      });
      return;
    }

    const article = await KBArticle.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!article) {
      res.status(404).json({
        success: false,
        message: 'KB Article not found',
      });
      return;
    }

    // Get level mappings
    const mappings = await KBArticleLevelMapping.find({
      articleId: id,
    }).populate('levelId', 'levelName levelOrder');

    // Increment view count
    article.viewsCount += 1;
    await article.save();

    res.status(200).json({
      success: true,
      data: {
        ...article.toObject(),
        levels: mappings.map((m) => m.levelId),
      },
    });
  } catch (error: any) {
    console.error('Get KB Article by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KB Article',
      error: error.message,
    });
  }
};

/**
 * Update KB Article
 */
export const updateArticle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      documentName,
      documentType,
      projectIds: rawProjectIds,
      htmlContent,
      description,
      externalUrl,
      publishedDate,
      levelIds: rawLevelIds,
      tags: rawTags,
      author,
      status,
      isFeatured,
      showNewTag,
      displayOrder,
    } = req.body;
    const userId = (req as any).user.userId;
    const file = req.file;

    // Parse JSON strings from FormData
    const projectIds = rawProjectIds && typeof rawProjectIds === 'string' ? JSON.parse(rawProjectIds) : rawProjectIds;
    const levelIds = rawLevelIds && typeof rawLevelIds === 'string' ? JSON.parse(rawLevelIds) : rawLevelIds;
    const tags = rawTags && typeof rawTags === 'string' ? JSON.parse(rawTags) : rawTags;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid article ID',
      });
      return;
    }

    const article = await KBArticle.findById(id);

    if (!article) {
      res.status(404).json({
        success: false,
        message: 'KB Article not found',
      });
      return;
    }

    // Update basic fields first
    if (documentName) article.documentName = documentName;
    if (projectIds) article.projectIds = Array.isArray(projectIds) ? projectIds : [projectIds];
    if (description !== undefined) article.description = description;

    // Determine which content type to keep based on documentType
    const targetDocType = documentType || article.documentType;
    
    // Handle PDF upload (if new file uploaded)
    if (file) {
      // Delete old PDF if exists (ignore errors if already deleted)
      if (article.pdfFilename) {
        await GCSService.deletePDF(article.pdfFilename).catch((err) =>
          console.log('ℹ️  Old PDF already deleted or not found:', article.pdfFilename)
        );
      }

      // Upload new PDF
      const projectCode = projectIds?.[0] || article.projectIds[0].toString();
      const uploadResult = await GCSService.uploadPDF(file, projectCode);
      article.pdfUrl = uploadResult.url;
      article.pdfFilename = uploadResult.filename;
      article.pdfSize = uploadResult.size;
      console.log('✅ New PDF uploaded');
    }

    // Clear fields based on documentType
    if (targetDocType === 'pdf') {
      // PDF only - clear external URL and HTML
      article.externalUrl = undefined;
      article.htmlContent = undefined;
      console.log('📄 Document type: PDF - cleared externalUrl and htmlContent');
    } else if (targetDocType === 'link') {
      // External link only - clear PDF and HTML
      if (article.pdfFilename) {
        await GCSService.deletePDF(article.pdfFilename).catch((err) =>
          console.log('ℹ️  PDF already deleted or not found:', article.pdfFilename)
        );
      }
      article.pdfUrl = undefined;
      article.pdfFilename = undefined;
      article.pdfSize = undefined;
      article.htmlContent = undefined;
      if (externalUrl !== undefined) article.externalUrl = externalUrl;
      console.log('🔗 Document type: Link - cleared PDF and HTML, kept externalUrl');
    } else if (targetDocType === 'html') {
      // HTML only - clear PDF and external URL, but keep existing HTML if not provided
      if (article.pdfFilename) {
        await GCSService.deletePDF(article.pdfFilename).catch((err) =>
          console.log('ℹ️  PDF already deleted or not found:', article.pdfFilename)
        );
      }
      article.pdfUrl = undefined;
      article.pdfFilename = undefined;
      article.pdfSize = undefined;
      article.externalUrl = undefined;
      // Only update htmlContent if provided, otherwise keep existing
      if (htmlContent !== undefined) {
        article.htmlContent = DOMPurify.sanitize(htmlContent);
      }
      console.log('📝 Document type: HTML - cleared PDF and externalUrl, kept htmlContent');
    } else if (targetDocType === 'both') {
      // Both PDF and HTML - clear only external URL
      article.externalUrl = undefined;
      // Only update htmlContent if provided, otherwise keep existing
      if (htmlContent !== undefined) {
        article.htmlContent = DOMPurify.sanitize(htmlContent);
      }
      console.log('📄📝 Document type: Both - cleared externalUrl, kept PDF and HTML');
    }

    // Update document type if provided
    if (documentType) article.documentType = documentType;
    if (publishedDate !== undefined) article.publishedDate = publishedDate ? new Date(publishedDate) : undefined;
    
    // Update other fields
    if (tags) article.tags = tags;
    if (author !== undefined) article.author = author;
    if (status) article.status = status;
    if (isFeatured !== undefined) article.isFeatured = isFeatured;
    if (showNewTag !== undefined) article.showNewTag = showNewTag;
    if (displayOrder !== undefined) article.displayOrder = displayOrder;
    article.updatedBy = userId;

    await article.save();

    // Update level mappings if provided
    if (levelIds) {
      // Delete existing mappings
      await KBArticleLevelMapping.deleteMany({ articleId: id });

      // Create new mappings
      const mappingPromises = levelIds.map((levelId: string) =>
        new KBArticleLevelMapping({
          articleId: id,
          levelId: levelId,
        }).save()
      );

      await Promise.all(mappingPromises);
    }

    res.status(200).json({
      success: true,
      message: 'KB Article updated successfully',
      data: article,
    });
  } catch (error: any) {
    console.error('Update KB Article error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update KB Article',
      error: error.message,
    });
  }
};

/**
 * Delete KB Article
 */
export const deleteArticle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid article ID',
      });
      return;
    }

    const article = await KBArticle.findById(id);

    if (!article) {
      res.status(404).json({
        success: false,
        message: 'KB Article not found',
      });
      return;
    }

    // Delete PDF from GCS if exists
    if (article.pdfFilename) {
      await GCSService.deletePDF(article.pdfFilename).catch((err) =>
        console.error('Failed to delete PDF:', err)
      );
    }

    // Delete level mappings
    await KBArticleLevelMapping.deleteMany({ articleId: id });

    // Delete article
    await KBArticle.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'KB Article and associated PDF deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete KB Article error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete KB Article',
      error: error.message,
    });
  }
};

/**
 * Search KB Articles
 */
export const searchArticles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, projectId } = req.query;

    if (!q) {
      res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
      return;
    }

    const filter: any = {
      $text: { $search: q as string },
      status: 'active',
    };

    if (projectId) {
      filter.projectIds = projectId;
    }

    // Only show published articles
    filter.$or = [
      { publishType: 'immediate' },
      {
        publishType: 'scheduled',
        scheduledPublishDate: { $lte: new Date() },
        $or: [
          { scheduledUnpublishDate: { $gte: new Date() } },
          { scheduledUnpublishDate: null },
        ],
      },
    ];

    const articles = await KBArticle.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(20)
      .lean();

    // Optimized: Batch fetch all level mappings instead of N+1 queries
    const articleIds = articles.map(a => a._id);
    const allMappings = await KBArticleLevelMapping.find({
      articleId: { $in: articleIds },
    })
      .populate('levelId', 'levelName')
      .lean();

    // Group mappings by article ID
    const mappingsByArticle = new Map<string, string[]>();
    allMappings.forEach((mapping: any) => {
      const articleIdStr = mapping.articleId.toString();
      if (!mappingsByArticle.has(articleIdStr)) {
        mappingsByArticle.set(articleIdStr, []);
      }
      if (mapping.levelId?.levelName) {
        mappingsByArticle.get(articleIdStr)!.push(mapping.levelId.levelName);
      }
    });

    // Build response with levels attached
    const articlesWithLevels = articles.map((article) => {
      // Create excerpt
      const excerpt =
        article.htmlContent
          ?.replace(/<[^>]*>/g, '')
          .substring(0, 200) + '...' || '';

      return {
        id: article._id,
        documentName: article.documentName,
        excerpt,
        levels: mappingsByArticle.get(article._id.toString()) || [],
        relevanceScore: (article as any).score,
      };
    });

    res.status(200).json({
      success: true,
      data: articlesWithLevels,
    });
  } catch (error: any) {
    console.error('Search KB Articles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search KB Articles',
      error: error.message,
    });
  }
};

/**
 * Upload image for rich text editor
 */
export const uploadEditorImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    const { projectCode } = req.body;

    if (!file) {
      res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
      return;
    }

    // Use projectCode if provided, otherwise default to 'shared'
    const imageUrl = await GCSService.uploadEditorImage(file, projectCode || 'shared');

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: imageUrl,
      },
    });
  } catch (error: any) {
    console.error('Upload editor image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message,
    });
  }
};
