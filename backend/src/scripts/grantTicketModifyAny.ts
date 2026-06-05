/**
 * One-time migration: grant the TICKET_MODIFY_ANY permission to the built-in
 * supervisor/admin roles (so they can act on ANY ticket regardless of assignee).
 *
 * The startup seed creates the permission but only auto-assigns NEW permissions
 * to SUPER_ADMIN — existing manager/admin roles must be back-filled once.
 * Custom roles can be granted the permission from the RBAC permissions UI.
 *
 * Updates BOTH Role.permissions (read by JWT generation) and the RolePermission
 * junction table. Safe to re-run.
 *
 * Run:  npx tsx src/scripts/grantTicketModifyAny.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TARGET_ROLE_CODES = [
  "SUPER_ADMIN",
  "ACCOUNT_OWNER",
  "SUPPORT_ADMIN",
  "SUPPORT_MANAGER",
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const perms = db.collection("permissions");
  const roles = db.collection("roles");
  const rolePerms = db.collection("rolepermissions");

  const perm = await perms.findOne({ code: "TICKET_MODIFY_ANY" });
  if (!perm) {
    console.error(
      "TICKET_MODIFY_ANY permission not found. Start the backend once so the seed creates it, then re-run.",
    );
    process.exit(1);
  }
  console.log("Permission:", perm._id.toString());

  for (const code of TARGET_ROLE_CODES) {
    const role = await roles.findOne({ code });
    if (!role) {
      console.log(`- ${code}: role not found, skipping`);
      continue;
    }

    // 1) Role.permissions array (used by JWT)
    const has = (role.permissions || []).some(
      (p: any) => p.toString() === perm._id.toString(),
    );
    if (!has) {
      await roles.updateOne(
        { _id: role._id },
        { $addToSet: { permissions: perm._id }, $set: { updatedAt: new Date() } },
      );
    }

    // 2) RolePermission junction table
    const junctionExists = await rolePerms.findOne({
      roleId: role._id,
      permissionId: perm._id,
    });
    if (!junctionExists) {
      await rolePerms.insertOne({
        roleId: role._id,
        permissionId: perm._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(
      `- ${code}: ${has ? "already had array" : "added to array"}; ${
        junctionExists ? "already had junction" : "added junction"
      }`,
    );
  }

  await mongoose.disconnect();
  console.log("Done. Affected users must log out/in to refresh their token.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
