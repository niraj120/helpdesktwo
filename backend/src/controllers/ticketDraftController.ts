import { Request, Response } from "express";
import mongoose from "mongoose";
import TicketDraft from "../models/TicketDraft";

/**
 * GET /api/tickets/:id/draft?type=reply|email
 * Returns the current user's draft for this ticket.
 */
export const getDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: ticketId } = req.params;
    const type = (req.query.type as string) || "reply";
    const userId = (req as any).user?.userId;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      res.status(400).json({ success: false, message: "Invalid ticket id" });
      return;
    }

    const draft = await TicketDraft.findOne({ ticketId, userId, type }).lean();
    res.json({ success: true, data: draft ?? null });
  } catch (err: any) {
    res
      .status(500)
      .json({ success: false, message: err.message ?? "Server error" });
  }
};

/**
 * PUT /api/tickets/:id/draft
 * Upsert the current user's draft. Body: { content, type }
 */
export const saveDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: ticketId } = req.params;
    const { content = "", type = "reply" } = req.body;
    const userId = (req as any).user?.userId;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      res.status(400).json({ success: false, message: "Invalid ticket id" });
      return;
    }

    const draft = await TicketDraft.findOneAndUpdate(
      { ticketId, userId, type },
      {
        ticketId: new mongoose.Types.ObjectId(ticketId),
        userId: new mongoose.Types.ObjectId(userId),
        type,
        content,
        savedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true },
    );

    res.json({ success: true, data: draft });
  } catch (err: any) {
    res
      .status(500)
      .json({ success: false, message: err.message ?? "Server error" });
  }
};

/**
 * DELETE /api/tickets/:id/draft?type=reply|email
 * Clears the current user's draft (called after successful send).
 */
export const deleteDraft = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id: ticketId } = req.params;
    const type = (req.query.type as string) || "reply";
    const userId = (req as any).user?.userId;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      res.status(400).json({ success: false, message: "Invalid ticket id" });
      return;
    }

    await TicketDraft.deleteOne({ ticketId, userId, type });
    res.json({ success: true });
  } catch (err: any) {
    res
      .status(500)
      .json({ success: false, message: err.message ?? "Server error" });
  }
};
