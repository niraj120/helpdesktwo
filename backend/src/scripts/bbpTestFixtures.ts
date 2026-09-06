/**
 * Sets up everything the BBP handoff test needs, against whatever database
 * backend/.env points at:
 *
 *   - a project with branding.customUrlPath = <path>   (created if missing)
 *   - one test user inside that project                (created if missing)
 *   - a fresh public API key for that project          (always new)
 *
 * Prints the exact env line to paste in front of scripts/test-bbp-integration.sh.
 *
 * Run:  cd backend && npx tsx src/scripts/bbpTestFixtures.ts
 *       npx tsx src/scripts/bbpTestFixtures.ts bbp bbp.tester@example.com 9876543210
 *
 * Add --isr to also make the project usable for internal staff:
 *   - turns on configuration.sr.enabled and sr.isr.enabled
 *   - creates a <PROJECT>_EMPLOYEE role carrying the ISR permissions
 *   - points publicApiSettings.defaultUserRoleCode at that role, so users
 *     pushed via POST /v1/users become staff instead of falling back to STUDENT
 *   - gives the test user that role
 *
 * Creating a key DEACTIVATES any existing active key for that project — the
 * same behaviour as the admin endpoint. Do not run this against production
 * while a partner is using their key.
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { connectDB } from "../config/database";
import { Project } from "../models/Project";
import { User } from "../models/User";
import { Role } from "../models/Role";
import { PublicApiKey } from "../models/PublicApiKey";
import { Permission } from "../models/Permission";

const URL_PATH = process.argv[2] || "bbp";
const EMAIL = (process.argv[3] || "bbp.tester@example.com").toLowerCase();
const MOBILE = process.argv[4] || "9876543210";

async function run() {
  await connectDB();

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "⚠️  NODE_ENV=production — this issues a new API key and revokes the current one.",
    );
  }

  // ── Project ────────────────────────────────────────────────────────────────
  let project: any = await Project.findOne({
    "branding.customUrlPath": URL_PATH,
  });

  if (!project) {
    project = await Project.create({
      name: URL_PATH.toUpperCase(),
      code: URL_PATH.toUpperCase(),
      description: `Test project for the ${URL_PATH} partner handoff`,
      branding: { customUrlPath: URL_PATH },
      status: "active",
    });
    console.log(`✅ project created  ${project.name} (${project._id})`);
  } else {
    console.log(`• project found     ${project.name} (${project._id})`);
  }

  // ── ISR setup (opt-in) ─────────────────────────────────────────────────────
  const wantIsr = process.argv.includes("--isr");
  const staffRoleCode = `${URL_PATH.toUpperCase()}_EMPLOYEE`;
  let staffRole: any = null;

  if (wantIsr) {
    const ISR_PERMS = [
      "TICKET_CREATE",
      "TICKET_VIEW_OWN",
      "TICKET_ADD_COMMENT",
    ];
    const perms = await Permission.find({ code: { $in: ISR_PERMS } })
      .select("_id code")
      .lean();
    const missing = ISR_PERMS.filter(
      (c) => !perms.some((p: any) => p.code === c),
    );
    if (missing.length) {
      console.error(
        `❌ permissions missing from this database: ${missing.join(", ")}. Seed permissions first.`,
      );
      process.exit(1);
    }

    staffRole = await Role.findOne({ code: staffRoleCode, projectId: project._id });
    if (!staffRole) {
      staffRole = await Role.create({
        name: `${project.name} Employee`,
        code: staffRoleCode,
        description: `Internal ${project.name} staff — raises and receives ISRs`,
        type: "custom",
        projectId: project._id,
        projects: [project._id],
        permissions: perms.map((p: any) => p._id),
        isActive: true,
      });
      console.log(`✅ role created     ${staffRoleCode} (${staffRole._id})`);
    } else {
      const have = new Set((staffRole.permissions || []).map((p: any) => String(p)));
      const add = perms.filter((p: any) => !have.has(String(p._id)));
      if (add.length) {
        staffRole.permissions = [
          ...(staffRole.permissions || []),
          ...add.map((p: any) => p._id),
        ];
        await staffRole.save();
        console.log(
          `✅ role updated     ${staffRoleCode} +${add.map((p: any) => p.code).join(", ")}`,
        );
      } else {
        console.log(`• role found        ${staffRoleCode} (${staffRole._id})`);
      }
    }

    // Merge rather than replace — the SR blob carries far more than these flags.
    // Written as a targeted $set on dotted paths: assigning whole subdocuments
    // on the document would restamp every sibling key in `configuration`, and
    // the unset ones cast-fail on save.
    const existingSr = (project.get("configuration.sr") || {}) as any;
    const sr = {
      ...(typeof existingSr.toObject === "function"
        ? existingSr.toObject()
        : existingSr),
      enabled: true,
      isr: { ...(existingSr.isr || {}), enabled: true },
    };

    await Project.updateOne(
      { _id: project._id },
      {
        $set: {
          "configuration.sr": sr,
          "publicApiSettings.defaultUserRoleCode": staffRoleCode,
        },
      },
    );
    console.log(
      `✅ project updated  sr.enabled=true sr.isr.enabled=true defaultUserRoleCode=${staffRoleCode}`,
    );
  }

  // ── User ───────────────────────────────────────────────────────────────────
  const role =
    staffRole || (await Role.findOne({ code: "STUDENT" }).select("_id").lean());
  if (!role) {
    console.error(
      "❌ No role with code STUDENT in this database. Seed roles first — a user without a role cannot be created.",
    );
    process.exit(1);
  }

  let user: any = await User.findOne({ email: EMAIL });
  if (!user) {
    user = await User.create({
      email: EMAIL,
      firstName: "BBP",
      lastName: "Tester",
      mobile: MOBILE,
      role: (role as any)._id,
      projects: [project._id],
      isActive: true,
      requirePasswordSetup: true,
      registrationSource: "online",
    });
    console.log(`✅ user created     ${user.email} (${user._id})`);
  } else {
    const inProject = (user.projects || []).some(
      (p: any) => String(p) === String(project._id),
    );
    if (!inProject) {
      user.projects = [...(user.projects || []), project._id];
      await user.save();
      console.log(`✅ user added to project ${project.name}`);
    }
    if (staffRole && String(user.role) !== String(staffRole._id)) {
      user.role = staffRole._id;
      await user.save();
      console.log(`✅ user role set    ${staffRoleCode}`);
    }
    console.log(`• user found        ${user.email} (${user._id})`);
  }

  // ── API key ────────────────────────────────────────────────────────────────
  await PublicApiKey.updateMany(
    { projectId: project._id, isActive: true },
    { isActive: false, revokedAt: new Date() },
  );

  const rawKey = "pub_" + crypto.randomBytes(32).toString("hex");
  await PublicApiKey.create({
    projectId: project._id,
    name: `${URL_PATH} handoff test key`,
    keyHash: await bcrypt.hash(rawKey, 12),
    keyPrefix: rawKey.slice(0, 12),
    isActive: true,
    createdBy: user._id,
  });
  console.log("✅ api key issued   (shown once, below)");

  console.log("\n── run the harness with ───────────────────────────────────");
  if (wantIsr) {
    console.log(
      `
ISR is on for ${project.name}. The handoff default returnPath ` +
        `(/portal/service-requests?tab=new) lands this user in the project portal's Service Request hub.
` +
        `Categories, forms and routing for ISR are still configured in /sr-settings.`,
    );
  }

  console.log(
    `KEY=${rawKey} EMAIL=${EMAIL} MOBILE=${MOBILE} ` +
      `BASE=http://localhost:${process.env.PORT || 3003} ` +
      `FRONTEND=http://localhost:3001 ` +
      `bash scripts/test-bbp-integration.sh`,
  );
  console.log("───────────────────────────────────────────────────────────\n");

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error("❌ fixture setup failed:", e);
  await mongoose.disconnect();
  process.exit(1);
});
