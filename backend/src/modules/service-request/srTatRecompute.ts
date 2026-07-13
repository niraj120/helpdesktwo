/**
 * Service Request (PSR/ISR) — recompute open SR TAT/SLA deadlines.
 * Recomputes each open SR's resolution deadline from its category SLA
 * (source-aware) and the project's working calendar. Also serves as a first
 * initialisation for SR tickets, which are not given an SLA deadline at create.
 */
import mongoose from "mongoose";
import { Ticket } from "../../models/Ticket";
import WorkingCalendar from "../../models/WorkingCalendar";
import { resolveSrRouting } from "./srMasterData";
import { calculateDueDate, convertToHours } from "../../services/slaService";
import { SrError } from "./serviceRequestService";

// Live (non-terminal) SR statuses — Closed(5) / Cancelled(8) are excluded.
const OPEN_SR_STATUSES = [1, 2, 4, 6, 7];

export interface RecomputeTatResult {
  total: number;
  updated: number;
  skipped: number;
  workingCalendarId: string | null;
}

export async function recomputeSrTat(
  projectId: string,
): Promise<RecomputeTatResult> {
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    throw new SrError("A valid projectId is required.", 400);
  }
  const projectOid = new mongoose.Types.ObjectId(projectId);

  // Prefer the default active calendar; fall back to any active one.
  const calendar =
    (await WorkingCalendar.findOne({
      projectId: projectOid,
      isDefault: true,
      isActive: true,
    }).select("_id")) ||
    (await WorkingCalendar.findOne({
      projectId: projectOid,
      isActive: true,
    }).select("_id"));
  const calId = calendar?._id as mongoose.Types.ObjectId | undefined;

  const tickets = await Ticket.find({
    project: projectOid,
    interactionType: { $in: ["PSR", "ISR"] },
    status: { $in: OPEN_SR_STATUSES },
  }).select("category categoryHierarchy metadata createdAt submissionSource ticketLevelSLA");

  let updated = 0;
  let skipped = 0;
  for (const ticket of tickets) {
    try {
      const categoryId =
        (ticket.category as any) ||
        (ticket.categoryHierarchy as any)?.level1 ||
        null;
      if (!categoryId) {
        skipped++;
        continue;
      }
      const centerId = (ticket as any).metadata?.centerId
        ? String((ticket as any).metadata.centerId)
        : null;
      const routing = await resolveSrRouting(
        projectId,
        String(categoryId),
        centerId,
        (ticket as any).submissionSource,
      );
      if (!routing.tat?.resolution) {
        skipped++;
        continue;
      }
      const hours = convertToHours(
        routing.tat.resolution.value,
        routing.tat.resolution.unit as any,
      );
      const start = (ticket as any).createdAt || new Date();
      const dueAt = await calculateDueDate(start, hours, calId);

      (ticket as any).ticketLevelSLA = {
        ...((ticket as any).ticketLevelSLA || {}),
        dueAt,
      };
      (ticket as any).sla_due_at = dueAt;
      if (calId) (ticket as any).workingCalendarId = calId;
      (ticket as any).slaSource = "category";
      await ticket.save();
      updated++;
    } catch (e) {
      console.error("[sr] recompute TAT error for ticket:", ticket._id, e);
      skipped++;
    }
  }

  return {
    total: tickets.length,
    updated,
    skipped,
    workingCalendarId: calId ? String(calId) : null,
  };
}
