import { Request, Response } from 'express';
import FAQ from '../models/FAQ';
import { sendSuccessResponse, sendErrorResponse } from '../utils/responseHandler';
import { getPaginationParams, sendPaginatedResponse } from '../utils/pagination';

// Get all FAQs for a project
export const getFAQsByProject = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { status, category } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const query: any = { projectId };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (category && category !== 'all') {
      query.category = category;
    }

    const [faqs, total] = await Promise.all([
      FAQ.find(query)
        .sort({ displayOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FAQ.countDocuments(query)
    ]);

    sendPaginatedResponse(res, faqs, total, page, limit, { message: 'FAQs retrieved successfully' });
  } catch (error: any) {
    console.error('Error fetching FAQs:', error);
    sendErrorResponse(res, error.message || 'Failed to fetch FAQs', 500);
  }
};

// Get single FAQ
export const getFAQById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const faq = await FAQ.findById(id);
    
    if (!faq) {
      return sendErrorResponse(res, 'FAQ not found', 404);
    }

    sendSuccessResponse(res, faq, 'FAQ retrieved successfully');
  } catch (error: any) {
    console.error('Error fetching FAQ:', error);
    sendErrorResponse(res, error.message || 'Failed to fetch FAQ', 500);
  }
};

// Create new FAQ
export const createFAQ = async (req: Request, res: Response) => {
  try {
    const { projectId, question, answer, category, tags, status, displayOrder } = req.body;
    const user = (req as any).user;

    console.log('📝 Creating FAQ - User object:', {
      userId: user?.userId,
      email: user?.email,
      firstName: user?.firstName,
      lastName: user?.lastName,
      hasUser: !!user
    });

    if (!projectId || !question || !answer) {
      return sendErrorResponse(res, 'Project ID, question, and answer are required', 400);
    }

    if (!user || !user.userId || !user.email) {
      console.error('❌ Invalid user object:', user);
      return sendErrorResponse(res, 'User authentication failed', 401);
    }

    // Construct user name from firstName and lastName, or use email as fallback
    const userName = user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user.email;

    const faq = new FAQ({
      projectId,
      question,
      answer,
      category: category || 'General',
      tags: tags || [],
      status: status || 'active',
      displayOrder: displayOrder || 0,
      createdBy: {
        userId: user.userId,
        name: userName,
        email: user.email,
      },
    });

    await faq.save();

    sendSuccessResponse(res, faq, 'FAQ created successfully', 201);
  } catch (error: any) {
    console.error('Error creating FAQ:', error);
    sendErrorResponse(res, error.message || 'Failed to create FAQ', 500);
  }
};

// Update FAQ
export const updateFAQ = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { question, answer, category, tags, status, displayOrder } = req.body;
    const user = (req as any).user;

    const faq = await FAQ.findById(id);
    
    if (!faq) {
      return sendErrorResponse(res, 'FAQ not found', 404);
    }

    if (question !== undefined) faq.question = question;
    if (answer !== undefined) faq.answer = answer;
    if (category !== undefined) faq.category = category;
    if (tags !== undefined) faq.tags = tags;
    if (status !== undefined) faq.status = status;
    if (displayOrder !== undefined) faq.displayOrder = displayOrder;

    // Construct user name from firstName and lastName, or use email as fallback
    const userName = user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user.email;

    faq.updatedBy = {
      userId: user.userId,
      name: userName,
      email: user.email,
    };

    await faq.save();

    sendSuccessResponse(res, faq, 'FAQ updated successfully');
  } catch (error: any) {
    console.error('Error updating FAQ:', error);
    sendErrorResponse(res, error.message || 'Failed to update FAQ', 500);
  }
};

// Delete FAQ
export const deleteFAQ = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const faq = await FAQ.findByIdAndDelete(id);
    
    if (!faq) {
      return sendErrorResponse(res, 'FAQ not found', 404);
    }

    sendSuccessResponse(res, null, 'FAQ deleted successfully');
  } catch (error: any) {
    console.error('Error deleting FAQ:', error);
    sendErrorResponse(res, error.message || 'Failed to delete FAQ', 500);
  }
};

// Increment view count
export const incrementFAQView = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const faq = await FAQ.findByIdAndUpdate(
      id,
      { $inc: { viewCount: 1 } },
      { new: true }
    );

    if (!faq) {
      return sendErrorResponse(res, 'FAQ not found', 404);
    }

    sendSuccessResponse(res, faq, 'View count incremented');
  } catch (error: any) {
    console.error('Error incrementing view count:', error);
    sendErrorResponse(res, error.message || 'Failed to increment view count', 500);
  }
};

// Submit feedback (helpful/not helpful)
export const submitFAQFeedback = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isHelpful } = req.body;

    const updateField = isHelpful ? 'helpfulCount' : 'notHelpfulCount';
    
    const faq = await FAQ.findByIdAndUpdate(
      id,
      { $inc: { [updateField]: 1 } },
      { new: true }
    );

    if (!faq) {
      return sendErrorResponse(res, 'FAQ not found', 404);
    }

    sendSuccessResponse(res, faq, 'Feedback submitted successfully');
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
    sendErrorResponse(res, error.message || 'Failed to submit feedback', 500);
  }
};

// Get FAQ categories for a project
export const getFAQCategories = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const categories = await FAQ.distinct('category', { projectId, status: 'active' });

    sendSuccessResponse(res, categories, 'Categories retrieved successfully');
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    sendErrorResponse(res, error.message || 'Failed to fetch categories', 500);
  }
};
