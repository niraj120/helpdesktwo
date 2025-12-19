import { Request, Response } from 'express';
import { FeedbackResponse } from '../models/FeedbackResponse';
import { FeedbackForm } from '../models/FeedbackForm';
import { Ticket } from '../models/Ticket';

// @desc    Submit Feedback Response
// @route   POST /api/feedback-responses
// @access  Private (Student)
export const submitFeedbackResponse = async (req: Request, res: Response) => {
  try {
    const { ticketId, formId, answers, studentId: studentIdFromBody } = req.body;
    const user = (req as any).user;
    
    // Determine student ID - from auth or from request body (for public submission)
    let studentId = user?.id || user?.userId || studentIdFromBody;

    if (!ticketId || !formId || !answers) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID, Form ID, and answers are required'
      });
    }

    // Verify ticket exists
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // If authenticated, verify ownership
    if (user) {
      if (ticket.metadata?.studentEmail !== user.email && String(ticket.createdBy) !== String(user.id)) {
        return res.status(403).json({
          success: false,
          message: 'You can only submit feedback for your own tickets'
        });
      }
    } else {
      // For public submissions, verify studentId matches ticket
      if (!studentIdFromBody || String(ticket.createdBy) !== String(studentIdFromBody)) {
        return res.status(403).json({
          success: false,
          message: 'Invalid student information'
        });
      }
    }

    // Verify form exists and is active
    const form = await FeedbackForm.findById(formId);
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Feedback form not found'
      });
    }

    if (!form.isActive) {
      return res.status(400).json({
        success: false,
        message: 'This feedback form is no longer active'
      });
    }

    // Check if multiple submissions are allowed
    if (!form.settings.allowMultipleSubmissions) {
      const existingResponse = await FeedbackResponse.findOne({
        ticketId,
        studentId
      });

      if (existingResponse) {
        return res.status(400).json({
          success: false,
          message: 'You have already submitted feedback for this ticket'
        });
      }
    }

    // Extract overall rating if there's a rating question
    const ratingAnswer = answers.find((a: any) => a.questionType === 'rating');
    const overallRating = ratingAnswer ? Number(ratingAnswer.answer) : undefined;

    // Get IP and User Agent
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const response = await FeedbackResponse.create({
      projectId: ticket.metadata?.projectId,
      ticketId,
      formId,
      studentId,
      answers,
      overallRating,
      ipAddress,
      userAgent
    });

    // Populate response
    const populatedResponse = await FeedbackResponse.findById(response._id)
      .populate('studentId', 'firstName lastName email')
      .populate('formId', 'name')
      .populate('ticketId', 'ticketNumber subject');

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully. Thank you!',
      data: populatedResponse
    });
  } catch (error: any) {
    console.error('Error submitting feedback response:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit feedback'
    });
  }
};

// @desc    Get Feedback Response for a Ticket
// @route   GET /api/feedback-responses/ticket/:ticketId
// @access  Private
export const getFeedbackByTicket = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;

    const responses = await FeedbackResponse.find({ ticketId })
      .populate('studentId', 'firstName lastName email')
      .populate('formId', 'name')
      .sort({ submittedAt: -1 });

    return res.json({
      success: true,
      data: responses
    });
  } catch (error: any) {
    console.error('Error fetching feedback by ticket:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch feedback'
    });
  }
};

// @desc    Get all Feedback Responses for a Project
// @route   GET /api/feedback-responses/project/:projectId
// @access  Private (Admin)
export const getFeedbackByProject = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { formId, startDate, endDate, minRating, maxRating } = req.query;

    const query: any = { projectId };

    if (formId) query.formId = formId;
    if (minRating) query.overallRating = { $gte: Number(minRating) };
    if (maxRating) query.overallRating = { ...query.overallRating, $lte: Number(maxRating) };
    if (startDate || endDate) {
      query.submittedAt = {};
      if (startDate) query.submittedAt.$gte = new Date(startDate as string);
      if (endDate) query.submittedAt.$lte = new Date(endDate as string);
    }

    const responses = await FeedbackResponse.find(query)
      .populate('studentId', 'firstName lastName email')
      .populate('formId', 'name')
      .populate('ticketId', 'ticketNumber subject')
      .sort({ submittedAt: -1 });

    return res.json({
      success: true,
      data: responses,
      count: responses.length
    });
  } catch (error: any) {
    console.error('Error fetching feedback by project:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch feedback'
    });
  }
};

// @desc    Get Feedback Statistics for a Project
// @route   GET /api/feedback-responses/project/:projectId/stats
// @access  Private (Admin)
export const getFeedbackStats = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const stats = await FeedbackResponse.aggregate([
      { $match: { projectId: projectId as any } },
      {
        $group: {
          _id: null,
          totalResponses: { $sum: 1 },
          averageRating: { $avg: '$overallRating' },
          ratingDistribution: {
            $push: '$overallRating'
          }
        }
      }
    ]);

    const ratingCounts = await FeedbackResponse.aggregate([
      { $match: { projectId: projectId as any, overallRating: { $exists: true } } },
      {
        $group: {
          _id: '$overallRating',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return res.json({
      success: true,
      data: {
        ...(stats[0] || { totalResponses: 0, averageRating: 0 }),
        ratingCounts: ratingCounts.reduce((acc: any, curr: any) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {})
      }
    });
  } catch (error: any) {
    console.error('Error fetching feedback stats:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch feedback statistics'
    });
  }
};

// @desc    Check if Student has Submitted Feedback for Ticket
// @route   GET /api/feedback-responses/ticket/:ticketId/check
// @access  Private (Student)
export const checkFeedbackSubmitted = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const studentId = (req as any).user?.id || (req as any).user?.userId;

    const response = await FeedbackResponse.findOne({
      ticketId,
      studentId
    });

    return res.json({
      success: true,
      data: {
        hasSubmitted: !!response,
        response: response || null
      }
    });
  } catch (error: any) {
    console.error('Error checking feedback submission:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to check feedback status'
    });
  }
};
