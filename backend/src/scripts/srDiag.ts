/** Temporary diagnostic — is the SR/ISR module usable for a given project?
 *  Prints the project's sr config switches and every role that carries ISR
 *  permissions. Read-only.
 *
 *  Run: npx tsx src/scripts/srDiag.ts bbp
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "../config/database";
import { Project } from "../models/Project";
import { Role } from "../models/Role";
import { Permission } from "../models/Permission";

const ISR_CODES = [
  "SR_ISR_CREATE",
  "SR_ISR_RECEIVE",
  "SR_VIEW_OWN",
  "SR_VIEW_ASSIGNED",
];

async function run() {
  await connectDB();
  const path = process.argv[2] || "bbp";

  const project: any = await Project.findOne({
    "branding.customUrlPath": path,
  }).lean();

  if (!project) {
    console.log(`no project with customUrlPath=${path}`);
  } else {
    const sr = project.configuration?.sr || {};
    console.log(`\nproject ${project.name} (${project._id})`);
    console.log(`  sr.enabled      = ${sr.enabled ?? "unset (default false)"}`);
    console.log(`  sr.isr.enabled  = ${sr.isr?.enabled ?? "unset (default false)"}`);
    console.log(`  sr.psr.enabled  = ${sr.psr?.enabled ?? "unset (default false)"}`);
  }

  const perms = await Permission.find({ code: { $in: ISR_CODES } })
    .select("_id code")
    .lean();
  const byId = new Map(perms.map((p: any) => [String(p._id), p.code]));
  console.log(`\nISR permissions present in DB: ${perms.map((p: any) => p.code).join(", ") || "NONE"}`);

  const roles = await Role.find({ permissions: { $in: perms.map((p: any) => p._id) } })
    .select("name code projectId permissions")
    .lean();

  console.log(`\nroles carrying any ISR permission: ${roles.length}`);
  for (const r of roles as any[]) {
    const have = (r.permissions || [])
      .map((p: any) => byId.get(String(p)))
      .filter(Boolean);
    console.log(
      `  ${r.code || "(no code)"} — ${r.name}  project=${r.projectId || "global"}  [${have.join(", ")}]`,
    );
  }

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
