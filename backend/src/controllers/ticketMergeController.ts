import { Request, Response } from "express";
import mongoose from "mongoose";
import { Ticket } from "../models/Ticket";
import { createNotification } from "./notificationController";

// Priority weight map for escalation (higher = more severe)
// Loaded dynamically from Priority master; fallback order used if not found
const PRIORITY_WEIGHT_FALLBACK: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Pick the highest-severity priority from a list of priority codes.
 * Queries Priority master for sortOrder; falls back to static map.
 */
async function getHighestPriority(priorityCodes: string[]): Promise<string> {
  if (priorityCodes.length === 0) return "LOW";
  if (priorityCodes.length === 1) return priorityCodes[0];

  try {
    const Priority = require("../models/master-data/Priority").Priority;
    const priorities = await Priority.find({
      code: { $in: priorityCodes.map((c) => c.toUpperCase()) },
    }).lean();

    if (priorities.length > 0) {
      // Higher sortOrder = higher severity
      const sorted = priorities.sort(
        (a: any, b: any) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0),
      );
      return (sorted[0] as any).code;
    }
  } catch {
    // fall through to static map
  }

  // Static fallback
  return priorityCodes.reduce((best, current) => {
    const bestWeight = PRIORITY_WEIGHT_FALLBACK[best.toUpperCase()] ?? 0;
    const currentWeight = PRIORITY_WEIGHT_FALLBACK[current.toUpperCase()] ?? 0;
    return currentWeight > bestWeight ? current : best;
  });
}

/**
 * @route   POST /api/tickets/:id/merge
 * @desc    Merge one or more secondary tickets into a primary (master) ticket.
 *          The primary ticket's identity, status, and category are preserved.
 *          Priority is escalated to the highest among all merged tickets.
 *          Secondary tickets are closed (status=5), flagged isMerged=true, and
 *          excluded from all listing / dashboard queries automatically.
 * @access  Private (TICKET_MERGE permission required)
 */
export const mergeTickets = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // Primary ticket ID
    const { ticketIds } = req.body as { ticketIds?: string[] };
    const userId = (req as any).user?.id || (req as any).user?.userId;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No secondary ticket IDs provided" });
    }

    if (ticketIds.includes(id)) {
      return res.status(400).json({
        success: false,
        message: "Primary ticket ID must not appear in secondary ticket list",
      });
    }

    // ── Fetch primary & secondaries ─────────────────────────────────────────
    const [primaryTicket, secondaryTickets] = await Promise.all([
      Ticket.findById(id),
      Ticket.find({ _id: { $in: ticketIds } }),
    ]);

    if (!primaryTicket) {
      return res
        .status(404)
        .json({ success: false, message: "Primary ticket not found" });
    }

    if (secondaryTickets.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No valid secondary tickets found" });
    }

    // Guard: don't merge an already-merged ticket
    const alreadyMerged = secondaryTickets.filter((t) => (t as any).isMerged);
    if (alreadyMerged.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following tickets are already merged and cannot be used as secondaries: ${alreadyMerged.map((t) => t.ticketNumber).join(", ")}`,
      });
    }

    // Guard: all tickets must belong to the same requester
    const primaryEmail = (primaryTicket as any).metadata?.studentEmail;
    const primaryCreatedBy = primaryTicket.createdBy?.toString();
    const mismatchedTickets = secondaryTickets.filter((t) => {
      const secEmail = (t as any).metadata?.studentEmail;
      if (primaryEmail || secEmail) {
        return secEmail !== primaryEmail;
      }
      return t.createdBy?.toString() !== primaryCreatedBy;
    });
    if (mismatchedTickets.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot merge tickets from different requestors. Mismatched ticket(s): ${mismatchedTickets.map((t) => t.ticketNumber).join(", ")}`,
      });
    }

    const now = new Date();
    const secondaryNumbers = secondaryTickets.map((t) => t.ticketNumber);

    // ── Determine highest priority ──────────────────────────────────────────
    const allPriorities = [
      primaryTicket.priority,
      ...secondaryTickets.map((t) => t.priority),
    ].filter(Boolean);
    const highestPriority = await getHighestPriority(allPriorities);

    // ── Absorb content into primary ─────────────────────────────────────────
    primaryTicket.comments = primaryTicket.comments ?? [];
    primaryTicket.attachments = primaryTicket.attachments ?? [];
    primaryTicket.threads = primaryTicket.threads ?? [];

    // System comment summarising the merge
    primaryTicket.comments.push({
      text: `Merged ${secondaryTickets.length} ticket(s) into this ticket: ${secondaryNumbers.join(", ")}`,
      createdBy: new mongoose.Types.ObjectId(userId),
      createdAt: now,
      isSystemComment: true,
    } as any);

    for (const secondary of secondaryTickets) {
      // Comments
      for (const comment of secondary.comments ?? []) {
        primaryTicket.comments.push({
          text: `[From ${secondary.ticketNumber}] ${(comment as any).text}`,
          createdBy: (comment as any).createdBy,
          createdAt: (comment as any).createdAt ?? now,
          isSystemComment: false,
          mergedFrom: secondary.ticketNumber,
        } as any);
      }

      // Attachments
      for (const att of secondary.attachments ?? []) {
        primaryTicket.attachments.push({
          ...(att.toObject?.() ?? att),
          mergedFrom: secondary.ticketNumber,
        } as any);
      }

      // Email threads
      for (const thread of secondary.threads ?? []) {
        primaryTicket.threads.push({
          ...((thread as any).toObject?.() ?? thread),
          mergedFrom: secondary.ticketNumber,
        } as any);
      }

      // Append secondary's description
      if (secondary.description) {
        primaryTicket.description =
          (primaryTicket.description ?? "") +
          `\n\n--- Merged from ${secondary.ticketNumber} ---\n${secondary.description}`;
      }
    }

    // Escalate priority if any secondary has higher severity
    primaryTicket.priority = highestPriority;

    // Record in mergedTickets array
    (primaryTicket as any).mergedTickets = [
      ...((primaryTicket as any).mergedTickets ?? []),
      ...secondaryTickets.map((t) => t._id),
    ];

    // Change history entry
    (primaryTicket.changeHistory ?? (primaryTicket.changeHistory = [])).push({
      field: "merge",
      oldValue: primaryTicket.ticketNumber,
      newValue: secondaryNumbers.join(", "),
      changedBy: new mongoose.Types.ObjectId(userId),
      changedAt: now,
      changeType: "update",
    } as any);

    await primaryTicket.save();

    // ── Close & flag secondary tickets ──────────────────────────────────────
    const studentUserIds: mongoose.Types.ObjectId[] = [];

    for (const secondary of secondaryTickets) {
      secondary.status = 5; // Closed
      (secondary as any).isMerged = true;
      (secondary as any).mergedInto = primaryTicket._id;
      (secondary as any).mergedAt = now;
      secondary.closedAt = now;

      secondary.comments = secondary.comments ?? [];
      secondary.comments.push({
        text: `This ticket has been merged into ${primaryTicket.ticketNumber}. Please follow up on ${primaryTicket.ticketNumber}.`,
        createdBy: new mongoose.Types.ObjectId(userId),
        createdAt: now,
        isSystemComment: true,
      } as any);

      await secondary.save();

      // Collect student user IDs for notification
      if (secondary.createdBy) {
        studentUserIds.push(secondary.createdBy as mongoose.Types.ObjectId);
      }
    }

    // ── Notify affected students ────────────────────────────────────────────
    const projectId =
      (primaryTicket as any).metadata?.projectId ?? primaryTicket.project;

    if (projectId) {
      const uniqueStudentIds = [
        ...new Map(studentUserIds.map((sid) => [sid.toString(), sid])).values(),
      ];

      for (const studentId of uniqueStudentIds) {
        try {
          await createNotification({
            userId: studentId,
            projectId: new mongoose.Types.ObjectId(projectId.toString()),
            type: "info",
            title: "Your ticket has been merged",
            message: `One of your tickets has been merged into ${primaryTicket.ticketNumber}. All updates will be tracked there.`,
            ticketId: primaryTicket._id as mongoose.Types.ObjectId,
            link: `/tickets/${primaryTicket._id}`,
          });
        } catch (notifErr) {
          // Non-fatal — log but don't fail the merge
          console.error(
            `⚠️ [MERGE] Failed to notify student ${studentId}:`,
            notifErr,
          );
        }
      }
    }

    console.log(
      `✅ [MERGE] Merged ${secondaryNumbers.join(", ")} → ${primaryTicket.ticketNumber} (priority: ${highestPriority})`,
    );

    return res.json({
      success: true,
      message: `Successfully merged ${secondaryTickets.length} ticket(s) into ${primaryTicket.ticketNumber}`,
      primaryTicketNumber: primaryTicket.ticketNumber,
      mergedTicketNumbers: secondaryNumbers,
      priority: highestPriority,
    });
  } catch (error: any) {
    console.error("Merge tickets error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * @route   GET /api/tickets/:id/merge-candidates
 * @desc    Returns tickets by the same student that can be merged into this ticket.
 *          Excludes: the ticket itself, already-merged tickets, and resolved/closed tickets.
 * @access  Private (TICKET_MERGE permission required)
 */
export const getMergeCandidates = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { search } = req.query;
    const user = (req as any).user;
    const userId = user?.id || user?.userId;
    const roleCode: string = user?.role?.code ?? "";

    const adminRoleCodes = ["SUPER_ADMIN", "CENTER_MANAGER", "ADMIN"];
    const isAdmin =
      adminRoleCodes.includes(roleCode) || user?.role?.isAdmin === true;

    const primaryTicket = await Ticket.findById(id).lean();
    if (!primaryTicket) {
      return res
        .status(404)
        .json({ success: false, message: "Ticket not found" });
    }

    // Base filter: same student, not merged, not closed/resolved, not self
    const baseFilter: any = {
      _id: { $ne: primaryTicket._id },
      isMerged: { $ne: true },
      status: { $nin: [4, 5] },
    };

    // Match same student via createdBy or metadata.studentEmail
    const studentEmail = (primaryTicket as any).metadata?.studentEmail;
    if (studentEmail) {
      baseFilter["metadata.studentEmail"] = studentEmail;
    } else {
      baseFilter.createdBy = primaryTicket.createdBy;
    }

    // Non-admin users (counselors, agents) must only see candidates assigned to them
    if (!isAdmin && userId) {
      baseFilter.assignedTo = new mongoose.Types.ObjectId(userId);
    }

    // Optional text search
    if (search) {
      const sanitized = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      baseFilter.$or = [
        { ticketNumber: { $regex: sanitized, $options: "i" } },
        { subject: { $regex: sanitized, $options: "i" } },
      ];
    }

    const candidates = await Ticket.find(baseFilter)
      .select("ticketNumber subject status priority createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({ success: true, data: candidates });
  } catch (error: any) {
    console.error("Get merge candidates error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};
