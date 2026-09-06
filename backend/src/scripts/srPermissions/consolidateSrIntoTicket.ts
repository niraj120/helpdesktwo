/**
 * SR -> Ticket permission consolidation.
 *
 * PSR and ISR are Ticket documents (`interactionType`), so every record-level
 * action on them is governed by the TICKET_* permissions. The SR_* codes that
 * duplicated a ticket action are retired here: each role holding one gains the
 * TICKET_* equivalent, plus SR_ACCESS so it keeps reaching the Service Requests
 * area. Codes that were never referenced by any route or screen are dropped.
 *
 * Idempotent. Dry-run by default:
 *   npx tsx src/scripts/srPermissions/consolidateSrIntoTicket.ts
 *   npx tsx src/scripts/srPermissions/consolidateSrIntoTicket.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

/** Retired SR code -> the TICKET_* code(s) that now govern the same action. */
const REMAP: Record<string, string[]> = {
  SR_VIEW_ALL: ["TICKET_VIEW_ALL"],
  SR_SR_VIEW_ALL: ["TICKET_VIEW_ALL"],
  SR_VIEW_OWN: ["TICKET_VIEW_OWN"],
  SR_VIEW_ASSIGNED: ["TICKET_VIEW_OWN"],
  SR_ISR_VIEW: ["TICKET_VIEW_OWN"],
  SR_PSR_VIEW: ["TICKET_VIEW_OWN"],
  SR_PSR_RECEIVE: ["TICKET_VIEW_OWN"],
  SR_ISR_RECEIVE: ["TICKET_VIEW_OWN"],
  SR_PSR_CREATE: ["TICKET_CREATE"],
  SR_ISR_CREATE: ["TICKET_CREATE"],
  SR_CREATE_PSR: ["TICKET_CREATE"],
  SR_CREATE_ISR: ["TICKET_CREATE"],
  SR_PSR_UPDATE: ["TICKET_ADD_COMMENT", "TICKET_EDIT"],
  SR_ISR_UPDATE: ["TICKET_ADD_COMMENT", "TICKET_EDIT"],
  SR_CLOSE: ["TICKET_CLOSE"],
  SR_BULK_CLOSE: ["TICKET_CLOSE", "TICKET_BULK_UPDATE"],
  SR_REOPEN: ["TICKET_REOPEN"],
  SR_CANCEL: ["TICKET_CANCEL"],
  SR_DELEGATE: ["TICKET_DELEGATE"],
  SR_REASSIGN: ["TICKET_REASSIGN"],
  SR_MERGE: ["TICKET_MERGE"],
  SR_DELETE: ["TICKET_DELETE"],
  SR_ISR_LINK: ["TICKET_LINK"],
  SR_PRIORITY_OVERRIDE: ["TICKET_CHANGE_PRIORITY"],
};

/**
 * Codes referenced by no route and no screen. They were created outside the
 * seed and have never gated anything, so they are removed rather than remapped.
 */
const DROP = [
  "SR_SETTINGS_MANAGE",
  "SR_MATRIX_MANAGE",
  "SR_WORKFLOW_MANAGE",
  "SR_DROPDOWNS_MANAGE",
  "SR_HOLIDAY_MANAGE",
  "SR_GROUPS_MANAGE",
  "SR_MASTERS_MANAGE",
  "SR_BACKUP_MANAGE",
  "SR_INGESTION_MANAGE",
  "SR_IVR_ADMIN",
  "SR_IVR_AGENT",
  "SR_MAILBOX_ADMIN",
  "SR_MAILBOX_AGENT",
  "SR_USER_TRANSFER_EXECUTE",
  "SR_REPORTS_VIEW",
  "SR_FEEDBACK_VIEW",
  "CALL_CONVERT",
  "CALL_LOG_MANAGE",
  "CALL_QUEUE_VIEW",
  "CALL_TYPE_CONFIG",
];

/** Holding any of these means the role works in the Service Requests area. */
const IMPLIES_SR_ACCESS = new Set([
  ...Object.keys(REMAP),
  "SR_CONFIG_MANAGE",
  "SR_ASSIGN_EMAILS",
  "SR_OFFLINE_ENTRY",
  "SR_DISPLAY_TO_PARENT",
]);

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const permsCol = db.collection("permissions");
  const rolesCol = db.collection("roles");
  const rolePermsCol = db.collection("rolepermissions");
  const usersCol = db.collection("users");

  const allPerms = await permsCol.find({}).toArray();
  const byCode = new Map(allPerms.map((p: any) => [p.code, p]));
  const byId = new Map(allPerms.map((p: any) => [p._id.toString(), p.code]));

  // Every TICKET_* target must exist before roles can be pointed at it.
  const targets = new Set<string>(["SR_ACCESS"]);
  for (const codes of Object.values(REMAP)) codes.forEach((c) => targets.add(c));
  const missing = [...targets].filter((c) => !byCode.has(c));
  if (missing.length) {
    console.error(
      `Missing permissions: ${missing.join(", ")}\n` +
        "Restart the backend once so the seed creates them, then re-run.",
    );
    process.exit(1);
  }

  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (pass --apply to write)\n");

  const roles = await rolesCol.find({}).toArray();
  let changedRoles = 0;
  let affectedUsers = 0;

  for (const role of roles as any[]) {
    const currentIds: any[] = role.permissions || [];
    const currentCodes = currentIds
      .map((id) => byId.get(id.toString()))
      .filter(Boolean) as string[];

    const retired = currentCodes.filter((c) => c in REMAP);
    const dropped = currentCodes.filter((c) => DROP.includes(c));
    if (!retired.length && !dropped.length) continue;

    const keep = new Set(
      currentCodes.filter((c) => !(c in REMAP) && !DROP.includes(c)),
    );
    const added: string[] = [];
    for (const code of retired) {
      for (const target of REMAP[code]) {
        if (!keep.has(target)) {
          keep.add(target);
          added.push(target);
        }
      }
    }
    if (currentCodes.some((c) => IMPLIES_SR_ACCESS.has(c)) && !keep.has("SR_ACCESS")) {
      keep.add("SR_ACCESS");
      added.push("SR_ACCESS");
    }

    const userCount = await usersCol.countDocuments({ role: role._id });
    changedRoles += 1;
    affectedUsers += userCount;

    console.log(`${role.code} — ${role.name}  (${userCount} user(s))`);
    console.log(`   retired: ${retired.join(", ") || "none"}`);
    if (dropped.length) console.log(`   dropped (unused): ${dropped.join(", ")}`);
    console.log(`   gained:  ${[...new Set(added)].join(", ") || "none (already held)"}`);
    console.log(`   ${currentCodes.length} -> ${keep.size} permissions`);

    if (!APPLY) continue;

    const newIds = [...keep].map((c) => byCode.get(c)!._id);
    await rolesCol.updateOne(
      { _id: role._id },
      { $set: { permissions: newIds, updatedAt: new Date() } },
    );

    // Keep the RolePermission junction table in step with Role.permissions.
    await rolePermsCol.deleteMany({ roleId: role._id });
    if (newIds.length) {
      await rolePermsCol.insertMany(
        newIds.map((permissionId: any) => ({
          roleId: role._id,
          permissionId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }

    // Force re-login so the next request rebuilds the cached permission set.
    await usersCol.updateMany({ role: role._id }, { $inc: { tokenVersion: 1 } });
  }

  // Retire the permission documents themselves once no role points at them.
  const retiredCodes = [...Object.keys(REMAP), ...DROP];
  if (APPLY) {
    const res = await permsCol.updateMany(
      { code: { $in: retiredCodes } },
      { $set: { isActive: false, updatedAt: new Date() } },
    );
    console.log(`\nDeactivated ${res.modifiedCount} permission document(s).`);
  } else {
    const count = await permsCol.countDocuments({
      code: { $in: retiredCodes },
      isActive: { $ne: false },
    });
    console.log(`\nWould deactivate ${count} permission document(s).`);
  }

  console.log(
    `${APPLY ? "Updated" : "Would update"} ${changedRoles} role(s), forcing re-login for ${affectedUsers} user(s).`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
