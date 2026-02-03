import { Request, Response } from 'express';
import KBArticle from '../models/KBArticle';
import KBLevel from '../models/KBLevel';
import KBArticleLevelMapping from '../models/KBArticleLevelMapping';
import KBTable from '../models/KBTable';
import mongoose from 'mongoose';

/**
 * Get all public KB articles organized by levels
 */
export const getPublicArticles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, levelId, search } = req.query;

    // For super admin with 'all', skip project filter validation
    const isAllProjects = projectId === 'all';

    if (!projectId) {
      res.status(400).json({
        success: false,
        message: 'Project ID is required',
      });
      return;
    }

    // Get all active levels for the project (or all projects for super admin)
    const levelsQuery: any = {
      status: 'active',
    };
    
    // Only filter by project if not 'all'
    if (!isAllProjects) {
      levelsQuery.projectIds = projectId;
    }

    if (levelId) {
      levelsQuery._id = levelId;
    }

    const levels = await KBLevel.find(levelsQuery).sort({ levelOrder: 1 }).lean();

    // OPTIMIZED: Batch fetch all data upfront instead of N+1 queries per level
    const levelIds = levels.map(l => l._id);

    // Batch fetch all mappings for all levels in one query
    const allMappings = await KBArticleLevelMapping.find({
      levelId: { $in: levelIds },
    }).lean();

    // Get all unique article IDs
    const allArticleIds = [...new Set(allMappings.map(m => m.articleId.toString()))];

    // Build article filter for batch fetch
    const articleFilter: any = {
      _id: { $in: allArticleIds },
      status: 'active',
      $or: [
        { publishType: 'immediate' },
        {
          publishType: 'scheduled',
          scheduledPublishDate: { $lte: new Date() },
          $or: [
            { scheduledUnpublishDate: { $gte: new Date() } },
            { scheduledUnpublishDate: null },
          ],
        },
      ],
    };
    
    if (!isAllProjects) {
      articleFilter.projectIds = projectId;
    }

    if (search) {
      articleFilter.$text = { $search: search as string };
    }

    // Batch fetch all articles (exclude htmlContent in list for performance)
    const allArticles = await KBArticle.find(articleFilter)
      .select('documentName documentType pdfUrl externalUrl description showNewTag isFeatured author publishedAt viewsCount tags displayOrder')
      .sort({ isFeatured: -1, displayOrder: 1, publishedAt: -1 })
      .lean();

    // Batch fetch all tables for all levels
    const tablesQuery: any = {
      levelIds: { $in: levelIds },
      status: 'active',
    };
    if (!isAllProjects) {
      tablesQuery.projectId = projectId;
    }
    
    const allTables = await KBTable.find(tablesQuery)
      .select('tableName description status levelIds')
      .sort({ tableName: 1 })
      .lean();

    // Create lookup maps for O(1) access
    const articleMap = new Map(allArticles.map(a => [a._id.toString(), a]));
    const mappingsByLevel = new Map<string, string[]>();
    allMappings.forEach(m => {
      const levelId = m.levelId.toString();
      if (!mappingsByLevel.has(levelId)) {
        mappingsByLevel.set(levelId, []);
      }
      mappingsByLevel.get(levelId)!.push(m.articleId.toString());
    });

    // Map levels with their articles and tables (no additional queries)
    const levelsWithArticles = levels.map(level => {
      const levelIdStr = level._id.toString();
      const articleIdsForLevel = mappingsByLevel.get(levelIdStr) || [];
      
      // Get articles for this level from the map
      const articles = articleIdsForLevel
        .map(id => articleMap.get(id))
        .filter(Boolean)
        .sort((a: any, b: any) => {
          if (a.isFeatured !== b.isFeatured) return b.isFeatured ? 1 : -1;
          return (a.displayOrder || 0) - (b.displayOrder || 0);
        });

      // Get tables that include this level
      const tables = allTables.filter(t => 
        t.levelIds?.some((lid: any) => lid.toString() === levelIdStr)
      );

      return {
        id: level._id,
        levelName: level.levelName,
        levelOrder: level.levelOrder,
        levelIcon: level.levelIcon,
        articles: articles.map((article: any) => ({
          id: article._id,
          documentName: article.documentName,
          documentType: article.documentType,
          pdfUrl: article.pdfUrl,
          externalUrl: article.externalUrl,
          description: article.description,
          showNewTag: article.showNewTag,
          isFeatured: article.isFeatured,
          author: article.author,
          publishedAt: article.publishedAt,
          viewsCount: article.viewsCount,
          tags: article.tags,
        })),
        tables: tables.map((table: any) => ({
          _id: table._id,
          tableName: table.tableName,
          description: table.description,
          status: table.status,
        })),
      };
    });

    res.status(200).json({
      success: true,
      data: {
        levels: levelsWithArticles,
      },
    });
  } catch (error: any) {
    console.error('Get public KB articles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch knowledge base articles',
      error: error.message,
    });
  }
};

/**
 * Get single public article with view increment
 */
export const getPublicArticleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { projectId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid article ID',
      });
      return;
    }

    if (!projectId) {
      res.status(400).json({
        success: false,
        message: 'Project ID is required',
      });
      return;
    }

    const article = await KBArticle.findOne({
      _id: id,
      status: 'active',
      projectIds: projectId,
    }).select('-createdBy -updatedBy');

    if (!article) {
      res.status(404).json({
        success: false,
        message: 'Article not found or not available',
      });
      return;
    }

    // Cast article to any for property access
    const articleData = article as any;

    // Check if article is published
    const isPublished =
      articleData.publishType === 'immediate' ||
      (articleData.publishType === 'scheduled' &&
        articleData.scheduledPublishDate &&
        articleData.scheduledPublishDate <= new Date() &&
        (!articleData.scheduledUnpublishDate || articleData.scheduledUnpublishDate >= new Date()));

    if (!isPublished) {
      res.status(404).json({
        success: false,
        message: 'Article is not yet published',
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

    // Get related articles (same levels, different article)
    const relatedArticleIds = await KBArticleLevelMapping.find({
      levelId: { $in: mappings.map((m) => m.levelId) },
      articleId: { $ne: id },
    })
      .limit(5)
      .distinct('articleId');

    const relatedArticles = await KBArticle.find({
      _id: { $in: relatedArticleIds },
      status: 'active',
    })
      .select('documentName documentType isFeatured')
      .limit(5)
      .lean();

    res.status(200).json({
      success: true,
      data: {
        article: {
          id: article._id,
          documentName: article.documentName,
          documentType: article.documentType,
          pdfUrl: article.pdfUrl,
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
    console.error('Get public article by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch article',
      error: error.message,
    });
  }
};

/**
 * Search public articles
 */
export const searchPublicArticles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, projectId } = req.query;

    if (!q || !projectId) {
      res.status(400).json({
        success: false,
        message: 'Search query and project ID are required',
      });
      return;
    }

    const searchTerm = q as string;
    const searchRegex = new RegExp(searchTerm, 'i'); // Case-insensitive search
    const isAllProjects = projectId === 'all';

    // Search across multiple fields including HTML content
    const filter: any = {
      status: 'active',
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
    filter.$and = [
      {
        $or: [
          { publishType: 'immediate' },
          {
            publishType: 'scheduled',
            scheduledPublishDate: { $lte: new Date() },
            $or: [
              { scheduledUnpublishDate: { $gte: new Date() } },
              { scheduledUnpublishDate: null },
            ],
          },
        ],
      },
    ];

    const articles = await KBArticle.find(filter)
      .select('documentName documentType pdfUrl externalUrl htmlContent description showNewTag isFeatured author publishedAt viewsCount tags')
      .populate('levels', 'levelName levelOrder levelIcon')
      .sort({ isFeatured: -1, publishedAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      data: articles,
    });
  } catch (error: any) {
    console.error('Search public articles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search articles',
      error: error.message,
    });
  }
};
