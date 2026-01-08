import { Request, Response } from 'express';
import { Ticket } from '../models/Ticket';

/**
 * @route   GET /api/tickets/:id/comments
 * @desc    Get all comments for a ticket
 * @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN)
 */
export const getComments = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findById(id)
      .populate('comments.createdBy', 'firstName lastName email');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json({ comments: ticket.comments || [] });
    return;
  } catch (error: any) {
    console.error('Get comments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
    return;
  }
};

/**
 * @route   POST /api/tickets/:id/comments
 * @desc    Add comment to ticket
 * @access  Private (TICKET_ADD_COMMENT)
 */
export const createComment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = (req as any).user?.id;

    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const comment = {
      text: text.trim(),
      createdBy: userId,
      createdAt: new Date()
    };

    ticket.comments = ticket.comments || [];
    ticket.comments.push(comment as any);
    await ticket.save();

    // Populate the newly added comment
    await ticket.populate('comments.createdBy', 'firstName lastName email');
    const newComment = ticket.comments[ticket.comments.length - 1];

    res.status(201).json({
      message: 'Comment added successfully',
      comment: newComment
    });
    return;
  } catch (error: any) {
    console.error('Create comment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
    return;
  }
};

/**
 * @route   PUT /api/tickets/:id/comments/:commentId
 * @desc    Update comment (only by comment creator)
 * @access  Private (TICKET_EDIT_COMMENT)
 */
export const updateComment = async (req: Request, res: Response) => {
  try {
    const { id, commentId } = req.params;
    const { text } = req.body;
    const userId = (req as any).user?.id;

    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const comment = ticket.comments?.find((c: any) => c._id.toString() === commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if user is the comment creator
    if ((comment as any).createdBy.toString() !== userId) {
      return res.status(403).json({ message: 'You can only edit your own comments' });
    }

    // Update comment
    (comment as any).text = text.trim();
    (comment as any).updatedAt = new Date();
    await ticket.save();

    await ticket.populate('comments.createdBy', 'firstName lastName email');
    const updatedComment = ticket.comments?.find((c: any) => c._id.toString() === commentId);

    res.json({
      message: 'Comment updated successfully',
      comment: updatedComment
    });
    return;
  } catch (error: any) {
    console.error('Update comment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
    return;
  }
};

/**
 * @route   DELETE /api/tickets/:id/comments/:commentId
 * @desc    Delete comment (only by comment creator)
 * @access  Private (TICKET_DELETE_COMMENT)
 */
export const deleteComment = async (req: Request, res: Response) => {
  try {
    const { id, commentId } = req.params;
    const userId = (req as any).user?.id;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const comment = ticket.comments?.find((c: any) => c._id.toString() === commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if user is the comment creator
    if ((comment as any).createdBy.toString() !== userId) {
      return res.status(403).json({ message: 'You can only delete your own comments' });
    }

    // Remove comment
    ticket.comments = ticket.comments?.filter((c: any) => c._id.toString() !== commentId);
    await ticket.save();

    res.json({ message: 'Comment deleted successfully' });
    return;
  } catch (error: any) {
    console.error('Delete comment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
    return;
  }
};
