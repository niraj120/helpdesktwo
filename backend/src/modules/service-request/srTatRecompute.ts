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

/** The project's default active working calendar, else any active one. */
async function srCalendarId(
  projectOid: mongoose.Types.ObjectId,
): Promise<mongoose.Types.ObjectId | undefined> {
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
  return calendar?._id as mongoose.Types.ObjectId | undefined;
}

/**
 * The resolution deadline an SR gets from its category TAT (source-aware),
 * counted from creation over the working calendar. null when the SR has no
 * category or the category carries no resolution TAT.
 */
async function srSlaDueAt(
  ticket: any,
  projectId: string,
  calId?: mongoose.Types.ObjectId,
): Promise<Date | null> {
  const categoryId = ticket.category || ticket.categoryHierarchy?.level1 || null;
  if (!categoryId) return null;
  const centerId = ticket.metadata?.centerId
    ? String(ticket.metadata.centerId)
    : null;
  const routing = await resolveSrRouting(
    projectId,
    String(categoryId),
    centerId,
    ticket.submissionSource,
  );
  if (!routing.tat?.resolution) return null;
  const hours = convertToHours(
    routing.tat.resolution.value,
    routing.tat.resolution.unit as any,
  );
  return calculateDueDate(ticket.createdAt || new Date(), hours, calId);
}

/**
 * Starts the SLA clock on a newly created SR. SRs are not given a deadline by
 * the generic ticket path, so without this the Overdue / Due today buckets
 * would stay empty until someone ran Recompute TAT. Non-fatal: an SR with no
 * category TAT simply has no SLA.
 */
export async function initSrSla(ticketId: string, projectId: string) {
  try {
    const projectOid = new mongoose.Types.ObjectId(projectId);
    const [ticket, calId] = await Promise.all([
      Ticket.findById(ticketId)
        .select("category categoryHierarchy metadata createdAt submissionSource")
        .lean(),
      srCalendarId(projectOid),
    ]);
    if (!ticket) return;
    const dueAt = await srSlaDueAt(ticket, projectId, calId);
    if (!dueAt) return;
    // Dotted $set so the escalation matrix's own SLA fields are left alone.
    await Ticket.updateOne(
      { _id: ticket._id },
      {
        $set: {
          "ticketLevelSLA.dueAt": dueAt,
          sla_due_at: dueAt,
          slaSource: "category",
          ...(calId ? { workingCalendarId: calId } : {}),
        },
      },
    );
  } catch (e) {
    console.warn("[sr] SLA init failed for ticket:", ticketId, (e as any)?.message);
  }
}

export async function recomputeSrTat(
  projectId: string,
): Promise<RecomputeTatResult> {
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    throw new SrError("A valid projectId is required.", 400);
  }
  const projectOid = new mongoose.Types.ObjectId(projectId);
  const calId = await srCalendarId(projectOid);

  const tickets = await Ticket.find({
    project: projectOid,
    interactionType: { $in: ["PSR", "ISR"] },
    status: { $in: OPEN_SR_STATUSES },
  }).select("category categoryHierarchy metadata createdAt submissionSource ticketLevelSLA");

  let updated = 0;
  let skipped = 0;
  for (const ticket of tickets) {
    try {
      const dueAt = await srSlaDueAt(ticket, projectId, calId);
      if (!dueAt) {
        skipped++;
        continue;
      }

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
