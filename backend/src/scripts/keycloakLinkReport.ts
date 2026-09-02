/**
 * Keycloak account-linking REPORT (Phase 2) — DRY RUN, writes nothing to the DB.
 *
 * Produces the migration report the checklist requires: for every Helpdesk user,
 * the proposed Keycloak `sub`, the match reason, and — critically — every
 * ambiguous / missing / disabled / conflicting case that must NOT be auto-linked.
 *
 * Usage:
 *   # readiness mode (no Keycloak export yet) — shows which local users even
 *   # carry a usable key, and how many:
 *   npx ts-node src/scripts/keycloakLinkReport.ts
 *
 *   # full plan against a Keycloak users export (once B2/B3 are answered):
 *   KEYCLOAK_USERS_EXPORT=./kc-users.json npx ts-node src/scripts/keycloakLinkReport.ts
 *
 * The Keycloak export is a JSON array of users. Attribute-style fields are read
 * from either a top-level property or `attributes.<name>[0]` (Keycloak's shape).
 *
 * Output: ./reports/keycloak-link-report-<timestamp>.{json,csv} + a console summary.
 * This script NEVER writes keycloakSubject — linking is a separate, reviewed step.
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectDB } from "../config/database";
import { User } from "../models/User";
import {
  buildMatchPlan,
  planToCsv,
  DEFAULT_LINK_CONFIG,
  LocalUser,
  KeycloakUser,
  MatchKey,
} from "../services/keycloak/accountLinking";

/** Pull a Keycloak attribute that may be top-level or under attributes[name][0]. */
function attr(u: any, name: string): string | undefined {
  if (u?.[name] != null) return String(u[name]);
  const a = u?.attributes?.[name];
  if (Array.isArray(a) && a.length) return String(a[0]);
  if (a != null) return String(a);
  return undefined;
}

function loadKeycloakExport(file: string): KeycloakUser[] {
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  const list: any[] = Array.isArray(parsed) ? parsed : parsed.users || [];
  return list.map((u) => ({
    sub: String(u.id ?? u.sub ?? ""),
    email: u.email,
    username: u.username,
    employeeCode: attr(u, "employeeCode") ?? attr(u, "employeeId"),
    hrmsId: attr(u, "hrmsId"),
    mobile: attr(u, "mobile") ?? attr(u, "phoneNumber"),
  }));
}

async function main() {
  await connectDB();

  const locals = (await User.find({})
    .select("email mobile employeeCode hrmsId isActive keycloakSubject")
    .lean()) as any[];

  const localUsers: LocalUser[] = locals.map((u) => ({
    id: String(u._id),
    email: u.email,
    mobile: u.mobile,
    employeeCode: u.employeeCode,
    hrmsId: u.hrmsId,
    isActive: u.isActive !== false,
    keycloakSubject: u.keycloakSubject,
  }));

  const exportFile = process.env.KEYCLOAK_USERS_EXPORT;
  let keycloakUsers: KeycloakUser[] = [];
  if (exportFile) {
    keycloakUsers = loadKeycloakExport(path.resolve(exportFile));
    console.log(
      `Loaded ${keycloakUsers.length} Keycloak users from ${exportFile}`,
    );
  } else {
    console.log(
      "No KEYCLOAK_USERS_EXPORT set — running in READINESS mode (every user will be NO_KEYCLOAK; the report still shows which locals carry a usable key).",
    );
  }

  // TODO(B3): override keyPriority/strongKeys here once MDM confirms the key.
  const config = DEFAULT_LINK_CONFIG;
  // Realm issuer of THIS export — stamped on matches so links carry (issuer, sub).
  // Multi-tenant: run this report once per realm with the matching issuer.
  const issuer = process.env.KEYCLOAK_ISSUER;
  const plan = buildMatchPlan(localUsers, keycloakUsers, config, issuer);

  // Readiness stats: how many active, unlinked locals carry each key.
  const keyCoverage: Record<MatchKey, number> = {
    employeeCode: 0,
    hrmsId: 0,
    email: 0,
    mobile: 0,
  };
  for (const u of localUsers) {
    if (!u.isActive || u.keycloakSubject) continue;
    if (u.employeeCode) keyCoverage.employeeCode++;
    if (u.hrmsId != null) keyCoverage.hrmsId++;
    if (u.email) keyCoverage.email++;
    if (u.mobile) keyCoverage.mobile++;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(__dirname, "../../reports");
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `keycloak-link-report-${stamp}`);

  fs.writeFileSync(
    `${base}.json`,
    JSON.stringify(
      { generatedAt: stamp, config, summary: plan.summary, keyCoverage, rows: plan.rows },
      null,
      2,
    ),
  );
  fs.writeFileSync(`${base}.csv`, planToCsv(plan));

  console.log("\n===== Keycloak account-linking report (DRY RUN) =====");
  console.log(`Local users:            ${localUsers.length}`);
  console.log(`Keycloak users:         ${keycloakUsers.length}`);
  console.log("\nStatus breakdown:");
  for (const [k, v] of Object.entries(plan.summary)) {
    console.log(`  ${k.padEnd(18)} ${v}`);
  }
  console.log("\nKey coverage (active, unlinked locals):");
  for (const [k, v] of Object.entries(keyCoverage)) {
    console.log(`  ${k.padEnd(18)} ${v}`);
  }
  console.log(`\nSafe to auto-link:      ${plan.autoLinkable.length}`);
  console.log(`Needs human review:     ${plan.needsReview.length}`);
  console.log(`\nReport written to:\n  ${base}.json\n  ${base}.csv`);
  console.log("\nNOTE: nothing was written to the database. Linking is a");
  console.log("separate, reviewed step and never auto-links review/conflict rows.");

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("[keycloakLinkReport] failed:", e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
