/** Temporary diagnostic — lists projects + public API keys so a 401 on
 *  /v1/auth/login-url can be traced to the right database. Read-only. */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "../config/database";
import { Project } from "../models/Project";
import { PublicApiKey } from "../models/PublicApiKey";
import { User } from "../models/User";

async function run() {
  await connectDB();
  const conn = mongoose.connection;
  console.log(`\nDB: ${conn.host}:${conn.port}/${conn.name}\n`);

  const projects = await Project.find({
    "branding.customUrlPath": { $exists: true, $ne: null },
  })
    .select("name code branding.customUrlPath")
    .lean();
  console.log(`projects with a customUrlPath: ${projects.length}`);
  for (const p of projects) {
    console.log(
      `  ${String(p._id)}  path=${(p as any).branding?.customUrlPath}  ${(p as any).name}`,
    );
  }

  const keys = await PublicApiKey.find({})
    .select("projectId name keyPrefix isActive createdAt revokedAt")
    .sort({ createdAt: -1 })
    .lean();
  console.log(`\npublic api keys: ${keys.length}`);
  for (const k of keys.slice(0, 15)) {
    console.log(
      `  ${(k as any).isActive ? "ACTIVE  " : "revoked "} prefix=${(k as any).keyPrefix} ` +
        `project=${String((k as any).projectId)} name=${(k as any).name} ` +
        `created=${(k as any).createdAt?.toISOString?.() || "?"}`,
    );
  }

  const bbp = projects.find(
    (p: any) => p.branding?.customUrlPath === (process.argv[2] || "bbp"),
  );
  if (bbp) {
    const count = await User.countDocuments({ projects: (bbp as any)._id });
    console.log(`\nusers in ${(bbp as any).name}: ${count}`);
  }

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
