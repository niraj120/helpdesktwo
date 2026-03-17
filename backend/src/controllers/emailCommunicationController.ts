import { Request, Response } from "express";
import TicketEmailCommunication from "../models/TicketEmailCommunication";
import { Ticket } from "../models/Ticket";
import ProjectEmailConfig from "../models/ProjectEmailConfig";
import { sendTicketReplyEmail } from "../utils/emailService";
import { logOutgoingEmail } from "../utils/emailCommunicationLogger";
import { logApiError, ErrorContext } from "../utils/errorLogger"; // Task 8.1

/**
 * @desc    Get all email communications for a ticket
 * @route   GET /api/tickets/:id/communications
 * @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN)
 */
export const getEmailCommunications = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id: ticketId } = req.params;

    // Verify ticket exists
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({
        success: false,
        error: "Ticket not found",
      });
      return;
    }

    // Get all email communications for this ticket, sorted chronologically
    const communications = await TicketEmailCommunication.find({ ticketId })
      .sort({ createdAt: 1 }) // Oldest first
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: communications,
      count: communications.length,
    });
  } catch (error: any) {
    console.error("Error fetching email communications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch email communications",
      details: error.message,
    });
  }
};

/**
 * @desc    Get single email communication by ID
 * @route   GET /api/tickets/:id/communications/:commId
 * @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN)
 */
export const getEmailCommunicationById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id: ticketId, commId } = req.params;

    const communication = await TicketEmailCommunication.findOne({
      _id: commId,
      ticketId,
    });

    if (!communication) {
      res.status(404).json({
        success: false,
        error: "Email communication not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: communication,
    });
  } catch (error: any) {
    console.error("Error fetching email communication:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch email communication",
      details: error.message,
    });
  }
};

/**
 * @desc    Send email reply to ticket
 * @route   POST /api/tickets/:id/reply-email
 * @access  Private (TICKET_REPLY or TICKET_VIEW_ALL)
 */
export const sendTicketReply = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id: ticketId } = req.params;
    const { replyContent, replyContentHtml, inReplyToMessageId } = req.body;
    const user = (req as any).user;

    // Validate input
    if (!replyContent || replyContent.trim() === "") {
      res.status(400).json({
        success: false,
        error: "Reply content is required",
      });
      return;
    }

    // Fetch ticket
    const ticket = await Ticket.findById(ticketId)
      .populate("project", "name")
      .populate("createdBy", "firstName lastName email")
      .exec();

    if (!ticket) {
      res.status(404).json({
        success: false,
        error: "Ticket not found",
      });
      return;
    }

    // Validate ticket has email source
    if (ticket.submissionSource !== "email" || !ticket.sourceEmail) {
      res.status(400).json({
        success: false,
        error:
          "Cannot send email reply: Ticket was not created via email or email address is missing",
      });
      return;
    }

    // Get agent info
    const agentName =
      user.fullName ||
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      "Support Agent";
    const agentEmail = user.email || "";

    // Task 7.3: Fetch all previous email communications to build References chain
    const previousEmails = await TicketEmailCommunication.find({ ticketId })
      .sort({ sentAt: 1, receivedAt: 1, createdAt: 1 })
      .select("messageId inReplyTo")
      .lean()
      .exec();

    // Build References chain: all previous Message-IDs in chronological order
    const referencesChain: string[] = [];
    previousEmails.forEach((email) => {
      if (email.messageId && !referencesChain.includes(email.messageId)) {
        referencesChain.push(email.messageId);
      }
    });

    // Get the most recent Message-ID for In-Reply-To
    // Priority: 1. Provided in request, 2. Original email Message-ID from metadata, 3. Last email in chain
    const lastMessageId =
      inReplyToMessageId ||
      (ticket.metadata as any)?.emailMessageId ||
      ticket.sourceEmailMessageId ||
      (previousEmails.length > 0
        ? previousEmails[previousEmails.length - 1].messageId
        : undefined);

    console.log("📧 Email threading info:", {
      lastMessageId,
      referencesCount: referencesChain.length,
      hasInReplyToParam: !!inReplyToMessageId,
      hasMetadataMessageId: !!(ticket.metadata as any)?.emailMessageId,
    });

    // Get the email config ID that received this ticket (for proper reply routing)
    const sourceEmailConfigId =
      ticket.sourceEmailConfigId?.toString() || undefined;
    if (sourceEmailConfigId) {
      console.log(`📧 Using source email config: ${sourceEmailConfigId}`);
    } else {
      console.log(
        `⚠️ No sourceEmailConfigId on ticket, will fallback to project email config`,
      );
    }

    // Send email with full References chain - use the same email config that received the original email
    const emailResult = await sendTicketReplyEmail({
      ticketId: ticket._id.toString(),
      ticketNumber: ticket.ticketNumber,
      ticketSubject: ticket.subject,
      recipientEmail: ticket.sourceEmail,
      recipientName: ticket.sourceEmailName || undefined,
      replyContent: replyContent.trim(),
      replyContentHtml: replyContentHtml || undefined,
      agentName,
      agentEmail,
      originalMessageId: lastMessageId,
      referencesChain: referencesChain.length > 0 ? referencesChain : undefined,
      projectId:
        (ticket.project as any)?._id?.toString() ||
        ticket.project?.toString() ||
        undefined,
      emailConfigId: sourceEmailConfigId, // Use the same email config that received the original email
    });

    if (!emailResult.success) {
      res.status(500).json({
        success: false,
        error: "Failed to send email",
        details: emailResult.error,
      });
      return;
    }

    console.log(
      `📧 Email service returned: fromEmail=${emailResult.fromEmail}, fromName=${emailResult.fromName}`,
    );
    console.log(
      `👤 Agent fallback: agentEmail=${agentEmail}, agentName=${agentName}`,
    );

    // Log outgoing email communication
    const emailCommunication = await logOutgoingEmail(ticket._id.toString(), {
      messageId:
        emailResult.messageId || `<temp-${Date.now()}@sac-helpdesk.com>`,
      subject: `Re: ${ticket.subject}`,
      from: {
        address: emailResult.fromEmail || agentEmail,
        name: emailResult.fromName || agentName,
      },
      to: [
        {
          address: ticket.sourceEmail,
          name: ticket.sourceEmailName || undefined,
        },
      ],
      body: replyContent.trim(),
      htmlBody: replyContentHtml || undefined,
      inReplyTo: lastMessageId,
      references: referencesChain.length > 0 ? referencesChain : undefined,
      date: new Date(),
    });

    // Task 7.3: Add reply to ticket timeline/comments
    const newComment = {
      text: `📧 Email reply sent to ${ticket.sourceEmail}:\n\n${replyContent.trim()}`,
      createdBy: user._id,
      createdAt: new Date(),
      isSystemComment: false,
    };

    await Ticket.findByIdAndUpdate(
      ticket._id,
      {
        $push: { comments: newComment },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    );

    console.log("✅ Email reply added to ticket timeline");

    res.status(200).json({
      success: true,
      message: "Email reply sent successfully",
      data: {
        emailCommunication,
        messageId: emailResult.messageId,
      },
    });
  } catch (error: any) {
    console.error("Error sending ticket reply:", error);

    // Task 8.1: Log error with full context
    await logApiError(error, req, {
      ticketId: req.params.id,
      operation: "send_email_reply",
      replyLength: req.body.replyContent?.length,
    });

    res.status(500).json({
      success: false,
      error: "Failed to send email reply",
      details: error.message,
    });
  }
};

/**
 * @desc    Get all incoming email communications (global view for Email Logs)
 * @route   GET /api/email-communications/incoming
 * @access  Private (EMAIL_LOGS_VIEW or TICKET_VIEW_ALL)
 */
export const getAllIncomingEmails = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100
    const skip = (page - 1) * limit;

    // Filters
    const filters: any = {
      direction: { $in: ["incoming", "inbound"] },
    };

    if (req.query.status) {
      filters.status = req.query.status;
    }

    if (req.query.fromEmail) {
      filters.fromEmail = { $regex: req.query.fromEmail, $options: "i" };
    }

    if (req.query.ticketNumber) {
      // Find ticket by number and filter by ticketId
      const ticket = await Ticket.findOne({
        ticketNumber: req.query.ticketNumber,
      });
      if (ticket) {
        filters.ticketId = ticket._id;
      }
    }

    // Date range filters
    if (req.query.startDate || req.query.endDate) {
      filters.receivedAt = {};
      if (req.query.startDate) {
        filters.receivedAt.$gte = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        filters.receivedAt.$lte = new Date(req.query.endDate as string);
      }
    }

    // Get communications with ticket details
    const communications = await TicketEmailCommunication.find(filters)
      .populate({
        path: "ticketId",
        select: "ticketNumber title status projectId",
        strictPopulate: false,
        populate: { path: "projectId", select: "name", strictPopulate: false },
      })
      .sort({ receivedAt: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean()
      .exec();

    // Build toEmail → project map from ProjectEmailConfig so that
    // even pending/failed emails (no ticket yet) show the correct project
    const uniqueToEmails = [
      ...new Set(communications.map((c: any) => c.toEmail).filter(Boolean)),
    ];
    const emailConfigs = await ProjectEmailConfig.find(
      { emailAddress: { $in: uniqueToEmails } },
      "emailAddress projectId",
    )
      .populate("projectId", "name")
      .lean();
    const emailToProject: Record<string, string> = {};
    for (const cfg of emailConfigs as any[]) {
      if (cfg.emailAddress && cfg.projectId?.name) {
        emailToProject[cfg.emailAddress.toLowerCase()] = cfg.projectId.name;
      }
    }

    // Attach projectName to every record
    const enriched = communications.map((c: any) => ({
      ...c,
      projectName:
        c.ticketId?.projectId?.name ||
        emailToProject[c.toEmail?.toLowerCase()] ||
        null,
    }));

    const total = await TicketEmailCommunication.countDocuments(filters);

    // Statistics
    const stats = await TicketEmailCommunication.aggregate([
      { $match: { direction: { $in: ["incoming", "inbound"] } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          processed: {
            $sum: { $cond: [{ $eq: ["$isProcessed", true] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $ne: ["$processingError", null] }, 1, 0] },
          },
        },
      },
    ]);

    const statistics =
      stats.length > 0
        ? {
            total: stats[0].total,
            processed: stats[0].processed,
            failed: stats[0].failed,
            pending: stats[0].total - stats[0].processed,
          }
        : {
            total: 0,
            processed: 0,
            failed: 0,
            pending: 0,
          };

    res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      statistics,
    });
  } catch (error: any) {
    console.error("Error fetching incoming emails:", error);

    await logApiError(error, req, {
      operation: "get_all_incoming_emails",
    });

    res.status(500).json({
      success: false,
      error: "Failed to fetch incoming emails",
      details: error.message,
    });
  }
};
