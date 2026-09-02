/**
 * Turn IVR (TATA SmartFlo) call intake on or off for a project.
 *
 * The webhook at POST /api/public/service-requests/ivr/ingest rejects every
 * payload with 403 unless all three of these are true:
 *
 *     configuration.sr.enabled
 *     configuration.sr.psr.enabled
 *     configuration.sr.psr.intake.ivr.enabled
 *
 * The SR settings screen exposes the IVR *parent lookup* but not that last
 * master flag, so this script is how it gets set until the toggle ships.
 *
 * Run (from backend/):
 *   npx tsx src/scripts/setIvrIntake.ts <projectUrlPath>            # show state
 *   npx tsx src/scripts/setIvrIntake.ts <projectUrlPath> --on
 *   npx tsx src/scripts/setIvrIntake.ts <projectUrlPath> --off
 *
 * --on also switches on sr.enabled and sr.psr.enabled, since IVR intake is
 * inert without them. Writes only the keys it needs, leaving the rest of the
 * SR config untouched.
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "../config/database";
import { Project } from "../models/Project";

const URL_PATH = process.argv[2];
const ON = process.argv.includes("--on");
const OFF = process.argv.includes("--off");

function show(label: string, project: any) {
  const sr = project.configuration?.sr || {};
  console.log(`\n${label} — ${project.name} (${project._id})`);
  console.log(`  sr.enabled                   = ${sr.enabled ?? false}`);
  console.log(`  sr.psr.enabled               = ${sr.psr?.enabled ?? false}`);
  console.log(
    `  sr.psr.intake.ivr.enabled    = ${sr.psr?.intake?.ivr?.enabled ?? false}`,
  );
}

async function run() {
  if (!URL_PATH) {
    console.error(
      "usage: npx tsx src/scripts/setIvrIntake.ts <projectUrlPath> [--on|--off]",
    );
    process.exit(1);
  }
  if (ON && OFF) {
    console.error("pass either --on or --off, not both");
    process.exit(1);
  }

  await connectDB();

  const project: any = await Project.findOne({
    "branding.customUrlPath": URL_PATH,
  })
    .select("name configuration")
    .lean();

  if (!project) {
    console.error(`no project with branding.customUrlPath = ${URL_PATH}`);
    process.exit(1);
  }

  show("current", project);

  if (!ON && !OFF) {
    console.log("\n(read-only — pass --on or --off to change)\n");
    await mongoose.disconnect();
    return;
  }

  // Dotted $set: assigning whole subdocuments would restamp every sibling key
  // in `configuration`, and the unset ones cast-fail on save.
  const set: Record<string, unknown> = {
    "configuration.sr.psr.intake.ivr.enabled": ON,
  };
  if (ON) {
    set["configuration.sr.enabled"] = true;
    set["configuration.sr.psr.enabled"] = true;
    // The ingest controller reads provider/mode from config defaults, but pin
    // them so the stored document says what it is doing.
    set["configuration.sr.psr.intake.ivr.provider"] = "smartflo";
  }

  await Project.updateOne({ _id: project._id }, { $set: set });

  const after: any = await Project.findById(project._id)
    .select("name configuration")
    .lean();
  show("updated", after);

  if (ON) {
    console.log(
      "\nWebhook will now accept payloads at POST /api/public/service-requests/ivr/ingest",
    );
    console.log(
      "Remaining setup: DID registry + agent numbers at /ivr-agents, and the SmartFlo webhook itself.\n",
    );
  } else {
    console.log("\nWebhook will now reject payloads with 403.\n");
  }

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
