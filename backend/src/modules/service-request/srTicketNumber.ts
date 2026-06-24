/**
 * Service Request (PSR/ISR) — ticket-number generator. Phase 3.
 * Mirrors the project's ticketNumberSettings format used elsewhere
 * (prefix/format/resetPeriod), with a uniqueness retry loop.
 */
import mongoose from "mongoose";
import { Ticket } from "../../models/Ticket";
import { Project } from "../../models/Project";

export async function generateSrTicketNumber(
  projectId: mongoose.Types.ObjectId | string,
): Promise<string> {
  const project = await Project.findById(projectId).select(
    "configuration.ticketNumberSettings",
  );
  const cfg = project?.configuration?.ticketNumberSettings;
  const prefix = cfg?.prefix || "PSR";
  const format = cfg?.format || "{PREFIX}-{YYYY}{MM}{DD}-{NNNN}";
  const startingNumber = cfg?.startingNumber || 1;

  const today = new Date();
  const fill = (s: string, n: string) =>
    s
      .replace("{PREFIX}", prefix)
      .replace("{YYYY}", String(today.getFullYear()))
      .replace("{MM}", String(today.getMonth() + 1).padStart(2, "0"))
      .replace("{DD}", String(today.getDate()).padStart(2, "0"))
      .replace("{NNNN}", n);

  const searchPattern = fill(format, "");
  const regexPattern = searchPattern.replace(/[-]/g, "\\-");

  const latest = await Ticket.findOne({
    project: projectId,
    ticketNumber: new RegExp(`^${regexPattern}`),
  })
    .sort({ ticketNumber: -1 })
    .select("ticketNumber");

  let next = startingNumber;
  if (latest?.ticketNumber) {
    next = parseInt(latest.ticketNumber.split("-").pop() || "0", 10) + 1;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = fill(format, String(next).padStart(4, "0"));
    const exists = await Ticket.findOne({ ticketNumber: candidate }).select(
      "_id",
    );
    if (!exists) return candidate;
    next++;
  }

  // Fallback: timestamp suffix
  return `${prefix}-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-${Date.now().toString().slice(-4)}`;
}
