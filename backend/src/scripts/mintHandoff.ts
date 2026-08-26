/** Mints a handoff ticket straight into the DB and prints the login URL —
 *  same thing POST /v1/auth/login-url does, minus the API key. Test aid.
 *
 *  Run: npx tsx src/scripts/mintHandoff.ts bbp.tester@example.com "/portal/service-requests?tab=new"
 */
import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import mongoose from "mongoose";
import { connectDB } from "../config/database";
import { config } from "../config";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { HandoffTicket } from "../models/HandoffTicket";
// Registered so populate("role" -> "permissions") can resolve the refs.
import "../models/Role";
import "../models/Permission";

const EMAIL = (process.argv[2] || "bbp.tester@example.com").toLowerCase();
const RETURN_PATH_INPUT = process.argv[3] || "/portal/service-requests?tab=new";
const URL_PATH = process.argv[4] || "bbp";

async function run() {
  await connectDB();

  const project: any = await Project.findOne({
    "branding.customUrlPath": URL_PATH,
  })
    .select("_id name branding.customUrlPath")
    .lean();
  if (!project) throw new Error(`no project with customUrlPath=${URL_PATH}`);

  const user: any = await User.findOne({ email: EMAIL })
    .populate({ path: "role", populate: { path: "permissions" } })
    .lean();
  if (!user) throw new Error(`no user ${EMAIL}`);

  const perms = (user.role?.permissions || []).map((p: any) =>
    typeof p === "string" ? p : p.code,
  );
  console.log(`\nuser  ${user.email}`);
  console.log(`role  ${user.role?.code || "(none)"}`);
  console.log(`perms ${perms.join(", ") || "(none)"}`);
  console.log(
    `in project ${project.name}: ${(user.projects || []).some(
      (p: any) => String(p) === String(project._id),
    )}`,
  );

  const ticket = crypto.randomBytes(32).toString("base64url");
  await HandoffTicket.create({
    tokenHash: crypto.createHash("sha256").update(ticket).digest("hex"),
    userId: user._id,
    projectId: project._id,
    // Stored resolved, exactly as the mint endpoint stores it.
    returnPath: RETURN_PATH_INPUT.startsWith("/portal/")
      || RETURN_PATH_INPUT.startsWith("/student/")
      ? `/${project.branding.customUrlPath}${RETURN_PATH_INPUT}`
      : RETURN_PATH_INPUT,
    usedAt: null,
    expiresAt: new Date(Date.now() + 120 * 1000),
  });

  console.log(
    `\n${config.urls.frontend}/${project.branding.customUrlPath}/partner-login?token=${ticket}\n`,
  );
  console.log("valid 120s, single use\n");

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
