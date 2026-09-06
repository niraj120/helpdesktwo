/**
 * Phase 0 of the SR -> Ticket permission consolidation.
 *
 * Snapshots the `permissions`, `roles` and `rolepermissions` collections to a
 * timestamped JSON file under backend/backups/ so the migration can be reversed
 * by hand if a role comes out wrong. Read-only against the database.
 *
 * Run:  npx tsx src/scripts/srPermissions/backupRbac.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  const snapshot = {
    takenAt: new Date().toISOString(),
    database: db.databaseName,
    permissions: await db.collection("permissions").find({}).toArray(),
    roles: await db.collection("roles").find({}).toArray(),
    rolepermissions: await db.collection("rolepermissions").find({}).toArray(),
  };

  const dir = path.resolve(__dirname, "../../../backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = snapshot.takenAt.replace(/[:.]/g, "-");
  const file = path.join(dir, `rbac-snapshot-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));

  console.log(`Permissions:     ${snapshot.permissions.length}`);
  console.log(`Roles:           ${snapshot.roles.length}`);
  console.log(`RolePermissions: ${snapshot.rolepermissions.length}`);
  console.log(`Written to:      ${file}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
