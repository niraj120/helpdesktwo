import { Request, Response } from 'express';
import { FeedbackForm } from '../models/FeedbackForm';

// @desc    Create Feedback Form
// @route   POST /api/feedback-forms
// @access  Private (FEEDBACK_FORM_CREATE permission)
export const createFeedbackForm = async (req: Request, res: Response) => {
  try {
    const {
      projectId,
      name,
      description,
      questions,
      isActive,
      triggers,
      emailTemplate,
      settings
    } = req.body;

    const userId = (req as any).user.userId;

    const form = await FeedbackForm.create({
      projectId,
      name,
      description,
      questions,
      isActive: isActive !== undefined ? isActive : true,
      triggers: triggers || [{ type: 'ticket_closed', enabled: true, conditions: {} }],
      emailTemplate,
      settings: settings || {
        showAfterTicketClosed: true,
        allowMultipleSubmissions: false,
        sendEmailNotification: true,
        emailDelay: 0
      },
      createdBy: userId
    });

    return res.status(201).json({
      success: true,
      message: 'Feedback form created successfully',
      data: form
    });
  } catch (error: any) {
    console.error('Error creating feedback form:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create feedback form'
    });
  }
};

// @desc    Get all Feedback Forms for a project
// @route   GET /api/feedback-forms/project/:projectId
// @access  Private
export const getFeedbackFormsByProject = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const forms = await FeedbackForm.find({ projectId })
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: forms
    });
  } catch (error: any) {
    console.error('Error fetching feedback forms:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch feedback forms'
    });
  }
};

// @desc    Get single Feedback Form
// @route   GET /api/feedback-forms/:id
// @access  Private
export const getFeedbackFormById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const form = await FeedbackForm.findById(id)
      .populate('createdBy', 'firstName lastName email');

    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Feedback form not found'
      });
    }

    return res.json({
      success: true,
      data: form
    });
  } catch (error: any) {
    console.error('Error fetching feedback form:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch feedback form'
    });
  }
};

// @desc    Get Active Feedback Form for a project
// @route   GET /api/feedback-forms/project/:projectId/active
// @access  Public (for students)
export const getActiveFeedbackForm = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const form = await FeedbackForm.findOne({
      projectId,
      isActive: true
    });

    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'No active feedback form found for this project'
      });
    }

    return res.json({
      success: true,
      data: form
    });
  } catch (error: any) {
    console.error('Error fetching active feedback form:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch active feedback form'
    });
  }
};

// @desc    Update Feedback Form
// @route   PUT /api/feedback-forms/:id
// @access  Private (FEEDBACK_FORM_EDIT permission)
export const updateFeedbackForm = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      questions,
      isActive,
      triggers,
      emailTemplate,
      settings
    } = req.body;

    const form = await FeedbackForm.findById(id);

    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Feedback form not found'
      });
    }

    // Update fields
    if (name !== undefined) form.name = name;
    if (description !== undefined) form.description = description;
    if (questions !== undefined) form.questions = questions;
    if (isActive !== undefined) form.isActive = isActive;
    if (triggers !== undefined) form.triggers = triggers;
    if (emailTemplate !== undefined) form.emailTemplate = emailTemplate;
    if (settings !== undefined) form.settings = { ...form.settings, ...settings };

    await form.save();

    return res.json({
      success: true,
      message: 'Feedback form updated successfully',
      data: form
    });
  } catch (error: any) {
    console.error('Error updating feedback form:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update feedback form'
    });
  }
};

// @desc    Delete Feedback Form
// @route   DELETE /api/feedback-forms/:id
// @access  Private (FEEDBACK_FORM_DELETE permission)
export const deleteFeedbackForm = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const form = await FeedbackForm.findByIdAndDelete(id);

    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Feedback form not found'
      });
    }

    return res.json({
      success: true,
      message: 'Feedback form deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting feedback form:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete feedback form'
    });
  }
};

// @desc    Toggle Feedback Form Active Status
// @route   PATCH /api/feedback-forms/:id/toggle-active
// @access  Private (FEEDBACK_FORM_EDIT permission)
export const toggleFeedbackFormActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const form = await FeedbackForm.findById(id);

    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Feedback form not found'
      });
    }

    form.isActive = !form.isActive;
    await form.save();

    return res.json({
      success: true,
      message: `Feedback form ${form.isActive ? 'activated' : 'deactivated'} successfully`,
      data: form
    });
  } catch (error: any) {
    console.error('Error toggling feedback form status:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to toggle feedback form status'
    });
  }
};
