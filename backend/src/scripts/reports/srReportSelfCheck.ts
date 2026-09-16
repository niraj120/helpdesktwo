/**
 * Read-only check that every service-request and call data point actually
 * produces a column: builds the real report pipeline with all of them
 * selected and prints the first rows. Writes nothing.
 *
 *   npx tsx src/scripts/reports/srReportSelfCheck.ts [projectId]
 */
import "dotenv/config";
import mongoose from "mongoose";
import { SYSTEM_DATA_POINTS } from "../../models/reports/ReportDataPoint";
import { runReportQuery } from "../../services/reportQueryService";
// Register the models the pipeline resolves by name.
import "../../models/Ticket";
import "../../models/CallIntake";
import "../../models/User";
import "../../models/Project";
import "../../models/Status";
import "../../models/Category";
import "../../models/EmailIntake";

const keysFor = (category: string) =>
  (SYSTEM_DATA_POINTS as any[])
    .filter((d) => d.category === category)
    .map((d) => d.key);

async function run(label: string, keys: string[], projectId?: string, sortBy?: string) {
  const { rows, total } = await runReportQuery(keys, [], sortBy, "desc", projectId, 1, 100);
  console.log(`\n-- ${label}: ${keys.length} columns, ${total} row(s) --`);
  if (!rows.length) {
    console.log("   (no rows in this project - columns still resolved)");
    return;
  }
  const blank = keys.filter((k) => rows.every((r: any) => r[k] === null || r[k] === ""));
  const filled = Object.fromEntries(
    Object.entries(rows[0]).filter(([k, v]) => k !== "_id" && v !== null && v !== "" && v !== 0),
  );
  console.log(`   first row (columns carrying a value): ${JSON.stringify(filled).slice(0, 900)}`);
  console.log(`   always blank across ${rows.length} row(s): ${blank.join(", ") || "none"}`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const projectId = process.argv[2];
  await run("Service request columns", keysFor("service_request"), projectId);
  await run("Call inbox columns", keysFor("call"), projectId);
  await run("Email intake columns", keysFor("email_intake"), projectId);
  // Sorting by a column that is only set on some requests brings those to the
  // top, so the WIP / hand-over columns can be seen carrying real values.
  // Sorting by a column that is only set on some records is no longer needed
  // (every row is scanned), but the runs stay as a shape check on sorting.
  for (const [label, category, sortBy] of [
    ["Requests sorted by committed date", "service_request", "sr_wip_committed_date"],
    ["Requests sorted by centre", "service_request", "sr_center"],
    ["Requests sorted by escalation level", "service_request", "sr_escalation_level"],
    ["Calls sorted by last call-back duration", "call", "call_outbound_last_duration"],
    ["Calls sorted by ladder step", "call", "call_wip_level"],
    ["Emails sorted by closed at", "email_intake", "ei_closed_at"],
  ] as [string, string, string][]) {
    await run(label, keysFor(category), projectId, sortBy);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
