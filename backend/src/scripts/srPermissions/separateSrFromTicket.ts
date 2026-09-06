/**
 * Give service requests their own permission set again.
 *
 * consolidateSrIntoTicket.ts folded SR actions into TICKET_*. That made a
 * query-desk grant imply the same power over PSRs and ISRs, which is not what
 * the two products want: they have different audiences and different rules.
 * This restores the separation — SR_* for service requests, TICKET_* for
 * queries — with the shared /api/tickets endpoints resolving which set applies
 * per record (middleware/ticketActionPermission.ts).
 *
 * Two moves per role, both derived from the snapshot taken immediately before
 * the consolidation ran, so nothing is guessed:
 *
 *   1. Every SR code the role held then is re-granted as its modern twin
 *      (SR_PSR_UPDATE, say, becomes SR_EDIT + SR_ADD_COMMENT + SR_REPLY +
 *      SR_CHANGE_STATUS).
 *   2. TICKET_* codes the consolidation ADDED are withdrawn — a role that only
 *      ever worked service requests should not come out of this holding the
 *      run of the query desk. TICKET_* codes the role held BEFORE the
 *      consolidation are left alone.
 *
 * Idempotent. Dry-run by default:
 *   npx tsx src/scripts/srPermissions/separateSrFromTicket.ts [--snapshot=<file>]
 *   npx tsx src/scripts/srPermissions/separateSrFromTicket.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

/** Pre-consolidation SR code -> the SR codes that carry its meaning today. */
const SR_REVIVAL: Record<string, string[]> = {
  SR_VIEW_ALL: ["SR_VIEW_ALL"],
  SR_SR_VIEW_ALL: ["SR_VIEW_ALL"],
  SR_VIEW_OWN: ["SR_VIEW_OWN"],
  SR_VIEW_ASSIGNED: ["SR_VIEW_OWN"],
  SR_ISR_VIEW: ["SR_VIEW_OWN"],
  SR_PSR_VIEW: ["SR_VIEW_OWN"],
  SR_PSR_RECEIVE: ["SR_VIEW_OWN"],
  SR_ISR_RECEIVE: ["SR_VIEW_OWN"],
  SR_PSR_CREATE: ["SR_PSR_CREATE"],
  SR_CREATE_PSR: ["SR_PSR_CREATE"],
  SR_ISR_CREATE: ["SR_ISR_CREATE"],
  SR_CREATE_ISR: ["SR_ISR_CREATE"],
  // "Update an SR" covered the whole working surface before the split.
  SR_PSR_UPDATE: ["SR_EDIT", "SR_ADD_COMMENT", "SR_REPLY", "SR_CHANGE_STATUS", "SR_ADD_ATTACHMENT"],
  SR_ISR_UPDATE: ["SR_EDIT", "SR_ADD_COMMENT", "SR_REPLY", "SR_CHANGE_STATUS", "SR_ADD_ATTACHMENT"],
  SR_CLOSE: ["SR_CLOSE"],
  SR_BULK_CLOSE: ["SR_CLOSE", "SR_BULK_UPDATE"],
  SR_REOPEN: ["SR_REOPEN"],
  SR_CANCEL: ["SR_CANCEL"],
  SR_DELEGATE: ["SR_DELEGATE"],
  SR_REASSIGN: ["SR_REASSIGN"],
  SR_MERGE: ["SR_MERGE"],
  SR_DELETE: ["SR_DELETE"],
  SR_ISR_LINK: ["SR_ISR_LINK"],
  SR_PRIORITY_OVERRIDE: ["SR_CHANGE_PRIORITY"],
};

const APPLY = process.argv.includes("--apply");
const snapArg = process.argv.find((a) => a.startsWith("--snapshot="));

function latestSnapshot(): string {
  const dir = path.resolve(__dirname, "../../../backups");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("rbac-snapshot-") && f.endsWith(".json"))
    .sort();
  if (!files.length) throw new Error("No RBAC snapshot found in backend/backups");
  return path.join(dir, files[files.length - 1]);
}

async function main() {
  const snapFile = snapArg ? snapArg.split("=")[1] : latestSnapshot();
  console.log(`Snapshot: ${snapFile}`);
  const snap = JSON.parse(fs.readFileSync(snapFile, "utf8"));

  const snapPermById = new Map<string, string>(
    snap.permissions.map((p: any) => [String(p._id.$oid || p._id), p.code]),
  );
  const snapRoleCodes = new Map<string, Set<string>>();
  for (const r of snap.roles) {
    const id = String(r._id.$oid || r._id);
    const codes = new Set<string>(
      (r.permissions || [])
        .map((p: any) => snapPermById.get(String(p.$oid || p)))
        .filter(Boolean) as string[],
    );
    snapRoleCodes.set(id, codes);
  }

  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const permsCol = db.collection("permissions");
  const rolesCol = db.collection("roles");
  const rolePermsCol = db.collection("rolepermissions");
  const usersCol = db.collection("users");

  const allPerms = await permsCol.find({}).toArray();
  const byCode = new Map(allPerms.map((p: any) => [p.code, p]));
  const byId = new Map(allPerms.map((p: any) => [p._id.toString(), p.code]));

  const targets = new Set<string>(["SR_ACCESS"]);
  for (const codes of Object.values(SR_REVIVAL)) codes.forEach((c) => targets.add(c));
  const missing = [...targets].filter((c) => !byCode.has(c) || byCode.get(c)!.isActive === false);
  if (missing.length) {
    console.error(
      `Missing or inactive permissions: ${missing.join(", ")}\n` +
        "Restart the backend once so the seed creates them, then re-run.",
    );
    process.exit(1);
  }

  console.log(APPLY ? "\nMODE: APPLY\n" : "\nMODE: DRY RUN (pass --apply to write)\n");

  const roles = await rolesCol.find({}).toArray();
  let changed = 0;
  let affectedUsers = 0;

  for (const role of roles as any[]) {
    const currentCodes = new Set<string>(
      (role.permissions || []).map((p: any) => byId.get(p.toString())).filter(Boolean) as string[],
    );
    const before = snapRoleCodes.get(role._id.toString()) || new Set<string>();

    // 1. SR twins for whatever SR rights the role held pre-consolidation.
    const srGrants = new Set<string>();
    for (const old of before) {
      for (const twin of SR_REVIVAL[old] || []) srGrants.add(twin);
    }
    if (srGrants.size) srGrants.add("SR_ACCESS");

    // 2. TICKET_* the consolidation handed this role (absent before, present now).
    const ticketAdded = [...currentCodes].filter(
      (c) => c.startsWith("TICKET_") && !before.has(c),
    );

    const next = new Set(currentCodes);
    const added: string[] = [];
    for (const c of srGrants) if (!next.has(c)) { next.add(c); added.push(c); }
    const removed: string[] = [];
    for (const c of ticketAdded) if (next.delete(c)) removed.push(c);

    if (!added.length && !removed.length) continue;

    const userCount = await usersCol.countDocuments({ role: role._id });
    changed += 1;
    affectedUsers += userCount;

    console.log(`${role.code} — ${role.name}  (${userCount} user(s))`);
    if (added.length) console.log(`   +SR: ${added.sort().join(", ")}`);
    if (removed.length) console.log(`   -TICKET (added by consolidation): ${removed.sort().join(", ")}`);
    console.log(`   ${currentCodes.size} -> ${next.size} permissions`);

    if (!APPLY) continue;

    const ids = [...next].map((c) => byCode.get(c)!._id);
    await rolesCol.updateOne(
      { _id: role._id },
      { $set: { permissions: ids, updatedAt: new Date() } },
    );
    await rolePermsCol.deleteMany({ roleId: role._id });
    if (ids.length) {
      await rolePermsCol.insertMany(
        ids.map((permissionId: any) => ({
          roleId: role._id,
          permissionId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }
    await usersCol.updateMany({ role: role._id }, { $inc: { tokenVersion: 1 } });
  }

  console.log(
    `\n${APPLY ? "Updated" : "Would update"} ${changed} role(s), forcing re-login for ${affectedUsers} user(s).`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
