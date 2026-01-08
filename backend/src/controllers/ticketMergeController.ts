import { Request, Response } from 'express';
import { Ticket } from '../models/Ticket';

/**
 * @route   POST /api/tickets/:id/merge
 * @desc    Merge multiple tickets into primary ticket
 * @access  Private (TICKET_MERGE)
 */
export const mergeTickets = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // Primary ticket ID
    const { ticketIds } = req.body; // Array of ticket IDs to merge into primary
    const userId = (req as any).user?.id;

    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ message: 'No tickets provided to merge' });
    }

    // Fetch primary ticket
    const primaryTicket = await Ticket.findById(id);
    if (!primaryTicket) {
      return res.status(404).json({ message: 'Primary ticket not found' });
    }

    // Fetch tickets to merge
    const ticketsToMerge = await Ticket.find({ _id: { $in: ticketIds } })
      .populate('comments.createdBy', 'firstName lastName email')
      .populate('attachments.uploadedBy', 'firstName lastName email');

    if (ticketsToMerge.length === 0) {
      return res.status(404).json({ message: 'No valid tickets found to merge' });
    }

    // Prepare merge data
    const mergedComments: any[] = [];
    const mergedAttachments: any[] = [];
    const mergedTicketNumbers: string[] = [];

    // Collect data from all tickets to merge
    ticketsToMerge.forEach(ticket => {
      mergedTicketNumbers.push(ticket.ticketNumber);

      // Add comments with reference note
      if (ticket.comments && ticket.comments.length > 0) {
        ticket.comments.forEach((comment: any) => {
          mergedComments.push({
            text: `[Merged from ${ticket.ticketNumber}] ${comment.text}`,
            createdBy: comment.createdBy._id,
            createdAt: comment.createdAt,
            mergedFrom: ticket.ticketNumber
          });
        });
      }

      // Add attachments with reference note
      if (ticket.attachments && ticket.attachments.length > 0) {
        ticket.attachments.forEach((attachment: any) => {
          mergedAttachments.push({
            filename: attachment.filename,
            fileUrl: attachment.fileUrl,
            fileSize: attachment.fileSize,
            mimeType: attachment.mimeType,
            uploadedBy: attachment.uploadedBy._id,
            uploadedAt: attachment.uploadedAt,
            mergedFrom: ticket.ticketNumber
          });
        });
      }
    });

    // Update primary ticket
    primaryTicket.comments = primaryTicket.comments || [];
    primaryTicket.attachments = primaryTicket.attachments || [];

    // Add merge notification comment
    primaryTicket.comments.push({
      text: `Merged ${ticketsToMerge.length} ticket(s): ${mergedTicketNumbers.join(', ')}`,
      createdBy: userId,
      createdAt: new Date(),
      isSystemComment: true
    } as any);

    // Add merged comments and attachments
    primaryTicket.comments.push(...mergedComments);
    primaryTicket.attachments.push(...mergedAttachments);

    // Update description if needed (append merged ticket details)
    const mergeDetails = ticketsToMerge.map(t => 
      `\n\n--- Merged from ${t.ticketNumber} ---\n${t.description || 'No description'}`
    ).join('');

    if (mergeDetails) {
      primaryTicket.description = (primaryTicket.description || '') + mergeDetails;
    }

    await primaryTicket.save();

    // Close merged tickets and add reference to primary
    const closedStatus = await require('../models/Status').default.findOne({ 
      name: 'Closed',
      project: primaryTicket.project 
    });

    for (const ticket of ticketsToMerge) {
      ticket.comments = ticket.comments || [];
      ticket.comments.push({
        text: `This ticket was merged into ${primaryTicket.ticketNumber}`,
        createdBy: userId,
        createdAt: new Date(),
        isSystemComment: true
      } as any);

      if (closedStatus) {
        ticket.status = closedStatus._id;
      }

      // Mark as merged
      (ticket as any).mergedInto = primaryTicket._id;
      await ticket.save();
    }

    res.json({
      message: `Successfully merged ${ticketsToMerge.length} ticket(s) into ${primaryTicket.ticketNumber}`,
      primaryTicket,
      mergedTickets: mergedTicketNumbers
    });
    return;
  } catch (error: any) {
    console.error('Merge tickets error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
    return;
  }
};
