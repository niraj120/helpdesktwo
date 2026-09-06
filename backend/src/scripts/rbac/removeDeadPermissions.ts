/**
 * Remove permissions that gate nothing.
 *
 * `auditPermissionUsage.ts` scans every route, middleware, controller and
 * screen for each permission code. The codes below came back with no reader at
 * all AND no corresponding feature in the codebase — granting or revoking them
 * changes no behaviour, so they are noise in RBAC Setup and give admins a false
 * sense of having restricted something.
 *
 * Two removal modes, because the catalogue has two sources:
 *   - DELETE:     codes absent from seedRolesPermissions.ts. Nothing recreates
 *                 them, so the documents go.
 *   - DEACTIVATE: codes the seed still declares (already flagged there with
 *                 isActive:false). Deleting them would only invite the next
 *                 boot to recreate them, so they are deactivated instead.
 *
 * Both modes strip the code from every role and the rolepermissions junction,
 * and bump tokenVersion for affected users.
 *
 * Idempotent. Dry-run by default:
 *   npx tsx src/scripts/rbac/removeDeadPermissions.ts
 *   npx tsx src/scripts/rbac/removeDeadPermissions.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

/** No routes, no pages, no feature — and not declared by the seed. */
const DELETE_CODES = [
  // Token Management / queue desks: no backend route and no frontend page.
  "TOKEN_VIEW",
  "TOKEN_CREATE",
  "TOKEN_DELETE",
  "TOKEN_SKIP",
  "TOKEN_CONFIG_VIEW",
  "TOKEN_CONFIG_CREATE",
  "TOKEN_CONFIG_EDIT",
  "TOKEN_CONFIG_RESET",
  "TOKEN_ANALYTICS_VIEW",
  "TOKEN_ANALYTICS_EXPORT",
  "DESK_VIEW",
  "DESK_CREATE",
  "DESK_EDIT",
  "DESK_DELETE",
  "DESK_OPERATE",
  // Integrations: no CRM integration surface exists.
  "CRM_INTEGRATION_MANAGE",
];

/** No feature either, but the seed declares them (now as isActive:false). */
const DEACTIVATE_CODES = [
  "AUTOMATION_VIEW",
  "AUTOMATION_TOGGLE",
  "AUTOMATION_MANAGE_AUTO_ASSIGN",
  "AUTOMATION_MANAGE_CREATE_TRIGGERS",
  "AUTOMATION_MANAGE_UPDATE_TRIGGERS",
  "AUTOMATION_MANAGE_TIME_TRIGGERS",
  "FIELDS_VIEW_TICKET_FIELDS",
  "FIELDS_MANAGE_TICKET_FIELDS",
  "FIELDS_MANAGE_TICKET_FORMS",
  "FIELDS_MANAGE_ACTIVITY_FIELDS",
  "FIELDS_MANAGE_USER_FIELDS",
  "FIELDS_MANAGE_CONTACT_FIELDS",
  "FIELDS_MANAGE_DEPENDENCIES",
  // Approval module ships workflow CRUD only — no approval inbox, no history
  // view, so these two gate nothing. The four APPROVAL_WORKFLOWS_* codes are
  // genuinely enforced in routes/approvals.ts and stay.
  "APPROVAL_TICKETS_APPROVE_REJECT",
  "APPROVAL_HISTORY_VIEW",
];

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const permsCol = db.collection("permissions");
  const rolesCol = db.collection("roles");
  const rolePermsCol = db.collection("rolepermissions");
  const usersCol = db.collection("users");

  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (pass --apply to write)\n");

  const all = [...DELETE_CODES, ...DEACTIVATE_CODES];
  const docs = await permsCol.find({ code: { $in: all } }).toArray();
  const ids = docs.map((d: any) => d._id);
  const idSet = new Set(ids.map((i: any) => i.toString()));

  const found = new Set(docs.map((d: any) => d.code));
  const absent = all.filter((c) => !found.has(c));
  if (absent.length) console.log(`Already gone: ${absent.join(", ")}\n`);

  // Documents with no code at all cannot be granted or checked.
  const malformed = await permsCol.find({ code: { $in: [null, ""] } }).toArray();
  const malformedIds = malformed.map((d: any) => d._id);
  malformedIds.forEach((i: any) => idSet.add(i.toString()));
  if (malformed.length) console.log(`Malformed permission documents (no code): ${malformed.length}\n`);

  // Strip from every role that grants one of them.
  const roles = await rolesCol.find({ permissions: { $in: [...ids, ...malformedIds] } }).toArray();
  let touchedUsers = 0;

  for (const role of roles as any[]) {
    const before: any[] = role.permissions || [];
    const after = before.filter((p: any) => !idSet.has(p.toString()));
    const removed = before.length - after.length;
    const userCount = await usersCol.countDocuments({ role: role._id });
    touchedUsers += userCount;
    console.log(`${role.code} — ${role.name}: -${removed} permission(s), ${userCount} user(s)`);

    if (!APPLY) continue;
    await rolesCol.updateOne(
      { _id: role._id },
      { $set: { permissions: after, updatedAt: new Date() } },
    );
    await rolePermsCol.deleteMany({
      roleId: role._id,
      permissionId: { $in: [...ids, ...malformedIds] },
    });
    await usersCol.updateMany({ role: role._id }, { $inc: { tokenVersion: 1 } });
  }

  if (APPLY) {
    const deleted = await permsCol.deleteMany({ code: { $in: DELETE_CODES } });
    const deactivated = await permsCol.updateMany(
      { code: { $in: DEACTIVATE_CODES } },
      { $set: { isActive: false, updatedAt: new Date() } },
    );
    const malformedDeleted = await permsCol.deleteMany({ code: { $in: [null, ""] } });
    console.log(
      `\nDeleted ${deleted.deletedCount} permission(s), deactivated ${deactivated.modifiedCount}, ` +
        `removed ${malformedDeleted.deletedCount} malformed document(s).`,
    );
  } else {
    console.log(
      `\nWould delete ${docs.filter((d: any) => DELETE_CODES.includes(d.code)).length} permission(s), ` +
        `deactivate ${docs.filter((d: any) => DEACTIVATE_CODES.includes(d.code)).length}, ` +
        `remove ${malformed.length} malformed document(s).`,
    );
  }

  console.log(
    `${APPLY ? "Updated" : "Would update"} ${roles.length} role(s), forcing re-login for ${touchedUsers} user(s).`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
