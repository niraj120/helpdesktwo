import { Response } from 'express';
import { KnowledgeBaseArticle } from '../models/KnowledgeBaseArticle';
import { AuthRequest } from '../middleware/auth';

// @desc    Get all KB articles for a project
// @route   GET /api/kb/project/:projectId
// @access  Public (for student portal) / Private (for admin)
export const getArticlesByProject = async (req: AuthRequest, res: Response) => {
  console.log('🔍 [KB Controller] getArticlesByProject called');
  console.log('🔍 [KB Controller] req.user:', req.user ? 'EXISTS' : 'UNDEFINED (public access)');
  
  try {
    const { projectId } = req.params;
    const { category, search, status = 'published' } = req.query;

    const query: any = { 
      projectId,
      isActive: true
    };

    // If user is authenticated, they can see all statuses
    if (req.user) {
      // Only filter by status if it's not "all"
      if (status && status !== 'all') {
        query.status = status;
      }
      // If status is "all" or not provided, don't filter by status (show all)
    } else {
      // Public access only sees published articles
      query.status = 'published';
    }

    if (category) query.category = category;
    
    if (search) {
      query.$text = { $search: search as string };
    }

    const articles = await KnowledgeBaseArticle.find(query)
      .populate('author', 'name email')
      .sort({ displayOrder: 1, publishedAt: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: articles,
      count: articles.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch articles'
    });
  }
};

// @desc    Get single KB article
// @route   GET /api/kb/:id
// @access  Public
export const getArticleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const article = await KnowledgeBaseArticle.findById(id)
      .populate('author', 'name email');

    if (!article) {
      res.status(404).json({
        success: false,
        error: 'Article not found'
      });
      return;
    }

    // Increment view count
    article.viewCount += 1;
    await article.save();

    res.json({
      success: true,
      data: article
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch article'
    });
  }
};

// @desc    Create KB article
// @route   POST /api/kb
// @access  Private (SuperAdmin only)
export const createArticle = async (req: AuthRequest, res: Response) => {
  try {
    const { 
      projectId, 
      title, 
      content, 
      category, // Keep for backward compatibility
      categoryId, 
      subcategoryId,
      contentType,
      pdfUrl,
      pdfFileName,
      tags, 
      status, 
      displayOrder 
    } = req.body;

    // Validate required fields based on content type
    if (contentType === 'pdf' && !pdfUrl) {
      return res.status(400).json({
        success: false,
        error: 'PDF URL is required for PDF content type'
      });
    }

    if (contentType === 'html' && !content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required for HTML content type'
      });
    }

    const article = await KnowledgeBaseArticle.create({
      projectId,
      title,
      content: contentType === 'html' ? content : undefined,
      category, // Keep for backward compatibility
      categoryId,
      subcategoryId,
      contentType: contentType || 'html',
      pdfUrl,
      pdfFileName,
      tags,
      status,
      displayOrder: displayOrder || 0,
      author: req.user!.userId,
      publishedAt: status === 'published' ? new Date() : undefined
    });

    const populatedArticle = await KnowledgeBaseArticle.findById(article._id)
      .populate('author', 'name email')
      .populate('categoryId', 'name')
      .populate('subcategoryId', 'name');

    return res.status(201).json({
      success: true,
      data: populatedArticle
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create article'
    });
  }
};

// @desc    Update KB article
// @route   PUT /api/kb/:id
// @access  Private (SuperAdmin only)
export const updateArticle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      content, 
      category, 
      categoryId, 
      subcategoryId,
      contentType,
      pdfUrl,
      pdfFileName,
      tags, 
      status, 
      displayOrder, 
      isActive 
    } = req.body;

    const article = await KnowledgeBaseArticle.findById(id);

    if (!article) {
      res.status(404).json({
        success: false,
        error: 'Article not found'
      });
      return;
    }

    // Update fields
    if (title !== undefined) article.title = title;
    if (content !== undefined) article.content = content;
    if (category !== undefined) article.category = category;
    if (categoryId !== undefined) article.categoryId = categoryId;
    if (subcategoryId !== undefined) article.subcategoryId = subcategoryId;
    if (contentType !== undefined) article.contentType = contentType;
    if (pdfUrl !== undefined) article.pdfUrl = pdfUrl;
    if (pdfFileName !== undefined) article.pdfFileName = pdfFileName;
    if (tags !== undefined) article.tags = tags;
    if (displayOrder !== undefined) article.displayOrder = displayOrder;
    if (isActive !== undefined) article.isActive = isActive;
    
    // Handle status change
    if (status !== undefined && status !== article.status) {
      article.status = status;
      if (status === 'published' && !article.publishedAt) {
        article.publishedAt = new Date();
      }
    }

    await article.save();

    const updatedArticle = await KnowledgeBaseArticle.findById(id)
      .populate('author', 'name email')
      .populate('categoryId', 'name')
      .populate('subcategoryId', 'name');

    res.json({
      success: true,
      data: updatedArticle
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update article'
    });
  }
};

// @desc    Delete KB article
// @route   DELETE /api/kb/:id
// @access  Private (SuperAdmin only)
export const deleteArticle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const article = await KnowledgeBaseArticle.findById(id);

    if (!article) {
      res.status(404).json({
        success: false,
        error: 'Article not found'
      });
      return;
    }

    await article.deleteOne();

    res.json({
      success: true,
      message: 'Article deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete article'
    });
  }
};

// @desc    Mark article as helpful/not helpful
// @route   POST /api/kb/:id/feedback
// @access  Public
export const articleFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { helpful } = req.body; // true for helpful, false for not helpful

    const article = await KnowledgeBaseArticle.findById(id);

    if (!article) {
      res.status(404).json({
        success: false,
        error: 'Article not found'
      });
      return;
    }

    if (helpful === true) {
      article.helpfulCount += 1;
    } else if (helpful === false) {
      article.notHelpfulCount += 1;
    }

    await article.save();

    res.json({
      success: true,
      data: {
        helpfulCount: article.helpfulCount,
        notHelpfulCount: article.notHelpfulCount
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit feedback'
    });
  }
};

// @desc    Get KB categories for a project
// @route   GET /api/kb/project/:projectId/categories
// @access  Public
export const getCategories = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;

    const categories = await KnowledgeBaseArticle.distinct('category', {
      projectId,
      status: 'published',
      isActive: true,
      category: { $exists: true, $ne: '' }
    });

    res.json({
      success: true,
      data: categories
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch categories'
    });
  }
};
