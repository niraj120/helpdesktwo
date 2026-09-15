/**
 * Repair ticket sub-documents that fail the Ticket schema.
 *
 * The status-change endpoints push history and notes with findByIdAndUpdate,
 * which skips validation. Until they were fixed they wrote:
 *   - changeHistory entries with an empty oldValue (the field is required);
 *   - internal notes under `content` instead of `note` — Mongoose dropped the
 *     unknown key, leaving notes with no text at all.
 * A single such entry makes every later `ticket.save()` fail, so adding a tag
 * or an internal note on that ticket errors out ("Failed to add tag",
 * "Failed to add internal note").
 *
 * What this does, per affected ticket:
 *   - empty/missing changeHistory oldValue/newValue → "None" (as trackChange);
 *   - a changeType outside the schema's list → "update";
 *   - a note with no text → rebuilt from the status remark logged at the same
 *     moment (that is where the text still lives), else a placeholder saying
 *     the text was not recorded.
 * Every repaired ticket is then validated against the real schema, and any
 * that still fail are listed — nothing is written for those.
 *
 * Idempotent. Dry-run by default:
 *   npx tsx src/scripts/tickets/repairTicketSubdocs.ts
 *   npx tsx src/scripts/tickets/repairTicketSubdocs.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Ticket } from "../../models/Ticket";

const APPLY = process.argv.includes("--apply");
const CHANGE_TYPES = ["update", "add", "remove", "reassigned", "remark"];
const REMARK_FIELDS = ["statusRemark", "closingRemark"];
const empty = (v: any) => v === undefined || v === null || String(v) === "";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const col = mongoose.connection.db!.collection("tickets");
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (pass --apply to write)\n");

  const cursor = col.find({
    $or: [
      { changeHistory: { $elemMatch: { $or: [{ oldValue: { $in: [null, ""] } }, { oldValue: { $exists: false } }] } } },
      { changeHistory: { $elemMatch: { $or: [{ newValue: { $in: [null, ""] } }, { newValue: { $exists: false } }] } } },
      { changeHistory: { $elemMatch: { changeType: { $exists: true, $nin: CHANGE_TYPES } } } },
      { internalNotes: { $elemMatch: { $or: [{ note: { $in: [null, ""] } }, { note: { $exists: false } }] } } },
    ],
  });

  let seen = 0;
  let fixed = 0;
  let stillInvalid = 0;
  const counts = { oldValue: 0, newValue: 0, changeType: 0, notesRebuilt: 0, notesPlaceholder: 0 };

  for await (const doc of cursor) {
    seen++;
    const history: any[] = doc.changeHistory || [];
    const notes: any[] = doc.internalNotes || [];

    for (const h of history) {
      if (empty(h.oldValue)) { h.oldValue = "None"; counts.oldValue++; }
      if (empty(h.newValue)) { h.newValue = "None"; counts.newValue++; }
      if (h.changeType !== undefined && !CHANGE_TYPES.includes(h.changeType)) {
        h.changeType = "update";
        counts.changeType++;
      }
    }

    for (const n of notes) {
      if (!empty(n.note)) continue;
      // The status endpoint logged the remark and the note in one update, so
      // they share a timestamp to the millisecond; allow a little slack.
      const at = new Date(n.createdAt || 0).getTime();
      const remark = history.find(
        (h) =>
          REMARK_FIELDS.includes(h.field) &&
          !empty(h.newValue) &&
          h.newValue !== "None" &&
          Math.abs(new Date(h.changedAt || 0).getTime() - at) <= 2000,
      );
      if (remark) {
        const label = remark.field === "closingRemark" ? "Closing Remark" : "Status Remark";
        n.note = `[${label}] ${remark.newValue}`;
        counts.notesRebuilt++;
      } else {
        n.note = "(note text was not recorded)";
        counts.notesPlaceholder++;
      }
    }

    // Prove it against the real schema before writing anything.
    const probe: any = Ticket.hydrate({ ...doc, changeHistory: history, internalNotes: notes });
    const err = probe.validateSync([
      "changeHistory",
      "internalNotes",
    ]);
    const subErrors = err
      ? Object.keys((err as any).errors || {}).filter(
          (k) => k.startsWith("changeHistory") || k.startsWith("internalNotes"),
        )
      : [];
    if (subErrors.length) {
      stillInvalid++;
      console.log(`  ! ${doc.ticketNumber || doc._id} still invalid: ${subErrors.slice(0, 4).join(", ")}`);
      continue;
    }

    fixed++;
    console.log(`  ✓ ${doc.ticketNumber || doc._id}${doc.interactionType ? ` (${doc.interactionType})` : ""}`);
    if (APPLY) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { changeHistory: history, internalNotes: notes } },
      );
    }
  }

  console.log(`
${seen} ticket(s) with invalid sub-documents
  history oldValue filled: ${counts.oldValue}, newValue filled: ${counts.newValue}, changeType corrected: ${counts.changeType}
  notes rebuilt from their remark: ${counts.notesRebuilt}, placeholder: ${counts.notesPlaceholder}
${fixed} ${APPLY ? "repaired" : "would be repaired"}; ${stillInvalid} still invalid (left untouched — see above).`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
