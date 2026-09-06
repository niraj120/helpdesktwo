/**
 * Give the Leads queue its own permissions.
 *
 * Leads used to open for anyone holding SR_PSR_CREATE, on the reasoning that
 * converting an enquiry ends in a PSR. That conflated two jobs: raising service
 * requests and working the admission-enquiry queue. SR_LEADS_ACCESS /
 * SR_LEADS_MANAGE / SR_LEADS_DELETE now gate it like the other intake channels.
 *
 * This grants them to the roles that genuinely work leads — the ones holding an
 * email-triage capability (enquiries arrive by email) or SR_CONFIG_MANAGE.
 * Roles that reached Leads only through SR_PSR_CREATE get nothing and lose the
 * tab, which is the point.
 *
 * Idempotent. Dry-run by default:
 *   npx tsx src/scripts/srPermissions/grantLeadPermissions.ts
 *   npx tsx src/scripts/srPermissions/grantLeadPermissions.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

/** Holding any of these means the role actually works admission enquiries. */
const QUALIFIES = ["EMAIL_TRIAGE_CONVERT", "SR_CONFIG_MANAGE"];

/** What such a role receives. Deletion stays with SR admins only. */
const GRANT = ["SR_LEADS_ACCESS", "SR_LEADS_MANAGE"];
const GRANT_ADMIN = ["SR_LEADS_ACCESS", "SR_LEADS_MANAGE", "SR_LEADS_DELETE"];

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const permsCol = db.collection("permissions");
  const rolesCol = db.collection("roles");
  const rolePermsCol = db.collection("rolepermissions");
  const usersCol = db.collection("users");

  const all = await permsCol.find({}).toArray();
  const byCode = new Map(all.map((p: any) => [p.code, p]));
  const byId = new Map(all.map((p: any) => [p._id.toString(), p.code]));

  const missing = [...GRANT_ADMIN, ...QUALIFIES].filter((c) => !byCode.has(c));
  if (missing.length) {
    console.error(`Missing permissions: ${missing.join(", ")} — restart the backend so the seed creates them.`);
    process.exit(1);
  }

  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (pass --apply to write)\n");

  const roles = await rolesCol.find({}).toArray();
  let changed = 0;
  let users = 0;

  for (const role of roles as any[]) {
    const codes = new Set(
      (role.permissions || []).map((p: any) => byId.get(p.toString())).filter(Boolean) as string[],
    );
    if (!QUALIFIES.some((c) => codes.has(c))) continue;

    const grant = codes.has("SR_CONFIG_MANAGE") ? GRANT_ADMIN : GRANT;
    const added = grant.filter((c) => !codes.has(c));
    if (!added.length) continue;

    const userCount = await usersCol.countDocuments({ role: role._id });
    changed += 1;
    users += userCount;
    console.log(`${role.code} — ${role.name} (${userCount} user(s)): +${added.join(", ")}`);

    if (!APPLY) continue;

    const ids = [...codes, ...added].map((c) => byCode.get(c)!._id);
    await rolesCol.updateOne(
      { _id: role._id },
      { $set: { permissions: ids, updatedAt: new Date() } },
    );
    await rolePermsCol.deleteMany({ roleId: role._id });
    await rolePermsCol.insertMany(
      ids.map((permissionId: any) => ({
        roleId: role._id,
        permissionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    await usersCol.updateMany({ role: role._id }, { $inc: { tokenVersion: 1 } });
  }

  console.log(
    `\n${APPLY ? "Granted to" : "Would grant to"} ${changed} role(s), forcing re-login for ${users} user(s).`,
  );
  console.log(
    "Roles that reached Leads only via SR_PSR_CREATE receive nothing and lose the tab.",
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
