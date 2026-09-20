/**
 * Backfill the student identity on existing PSRs.
 *
 * Parent-portal visibility is keyed on the student's enrolment number, so both
 * guardians of a student see the same requests. Requests raised before that
 * was captured carry only the student id (or nothing), and would stay visible
 * to their raiser alone until stamped.
 *
 * Read-only by default — pass --write to save.
 *   npx ts-node src/scripts/srPermissions/backfillStudentEnrolments.ts [--write] [--project <id>]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../../.env") });
import { Ticket } from "../../models/Ticket";
import { stampStudentIdentity } from "../../modules/service-request/srFamilyLookup";

const args = process.argv.slice(2);
const write = args.includes("--write");
const projectArg = args[args.indexOf("--project") + 1];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const query: any = {
    interactionType: "PSR",
    "metadata.studentEnrollments": { $exists: false },
  };
  if (args.includes("--project") && projectArg) {
    query.project = new mongoose.Types.ObjectId(projectArg);
  }
  const tickets = await Ticket.find(query)
    .select("ticketNumber project metadata")
    .lean();
  console.log(
    `${tickets.length} PSR(s) without a student enrolment${write ? "" : " (dry run — pass --write to save)"}`,
  );

  let stamped = 0;
  let skipped = 0;
  for (const t of tickets as any[]) {
    const projectId = String(t.project?._id || t.project || "");
    const children = Array.isArray(t.metadata?.children) ? t.metadata.children : [];
    if (!projectId || (!children.length && !t.metadata?.studentEnrollment)) {
      skipped++;
      continue;
    }
    if (!write) {
      console.log(`would stamp ${t.ticketNumber} (${children.length} child ref(s))`);
      stamped++;
      continue;
    }
    await stampStudentIdentity(String(t._id), projectId);
    const after: any = await Ticket.findById(t._id).select("metadata.studentEnrollments").lean();
    const list = after?.metadata?.studentEnrollments || [];
    console.log(`${t.ticketNumber}: ${list.length ? list.join(", ") : "no enrolment resolved"}`);
    if (list.length) stamped++;
    else skipped++;
  }
  console.log(`done — stamped ${stamped}, skipped ${skipped}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED", e.message);
  process.exit(1);
});
