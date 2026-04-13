require('dotenv').config();
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const now = new Date();

  // ── 1. Ensure the 4 permission documents exist ──────────────────────────────
  const codes = ['ATTENDANCE_VIEW', 'ATTENDANCE_SYNC', 'ATTENDANCE_CONFIG', 'ATTENDANCE_EXPORT'];
  const existing = await db.collection('permissions').find({ code: { $in: codes } }).toArray();
  console.log('Existing ATTENDANCE permissions:', existing.length);

  const permsDefs = [
    { module: 'Attendance', name: 'View Attendance', code: 'ATTENDANCE_VIEW', description: 'Can view attendance records', category: 'attendance', isActive: true },
    { module: 'Attendance', name: 'Sync Biometric', code: 'ATTENDANCE_SYNC', description: 'Can sync employees to AFT biometric system', category: 'attendance', isActive: true },
    { module: 'Attendance', name: 'Configure Attendance', code: 'ATTENDANCE_CONFIG', description: 'Can configure AFT integration settings', category: 'attendance', isActive: true },
    { module: 'Attendance', name: 'Export Attendance', code: 'ATTENDANCE_EXPORT', description: 'Can export attendance records', category: 'attendance', isActive: true },
  ];

  const permIds = {};
  for (const pd of permsDefs) {
    const ex = existing.find(e => e.code === pd.code);
    if (ex) {
      permIds[pd.code] = ex._id;
      console.log('  Already exists:', pd.code, '->', ex._id);
    } else {
      const res = await db.collection('permissions').insertOne({ ...pd, createdAt: now, updatedAt: now });
      permIds[pd.code] = res.insertedId;
      console.log('  Inserted:', pd.code, '->', res.insertedId);
    }
  }

  // ── 2. Role → allowed permission codes ──────────────────────────────────────
  const roleAssignments = {
    '69133e04cdf807d363168a8c': { code: 'SUPER_ADMIN', perms: ['ATTENDANCE_VIEW', 'ATTENDANCE_SYNC', 'ATTENDANCE_CONFIG', 'ATTENDANCE_EXPORT'] },
    '6996ad846242b379ee1304cd': { code: 'ADMIN',       perms: ['ATTENDANCE_VIEW', 'ATTENDANCE_SYNC', 'ATTENDANCE_CONFIG', 'ATTENDANCE_EXPORT'] },
    '696f6e12254966069115cc9a': { code: 'SUBADMIN',    perms: ['ATTENDANCE_VIEW', 'ATTENDANCE_SYNC', 'ATTENDANCE_CONFIG', 'ATTENDANCE_EXPORT'] },
    '693bdfef085514511d87f709': { code: 'CENTER_MANAGER', perms: ['ATTENDANCE_VIEW', 'ATTENDANCE_EXPORT'] },
    '696f9e56254966069115d1dc': { code: 'AGENT',       perms: ['ATTENDANCE_VIEW'] },
  };

  // ── 3. Update each role's embedded permissions[] array (used by JWT / login) ─
  console.log('\n--- Updating Role.permissions arrays ---');
  for (const [roleIdStr, { code, perms }] of Object.entries(roleAssignments)) {
    const roleId = new ObjectId(roleIdStr);
    const role = await db.collection('roles').findOne({ _id: roleId });
    if (!role) {
      console.log(`  WARN: role ${code} (${roleIdStr}) not found in roles collection`);
      continue;
    }

    const currentPermIds = (role.permissions || []).map(p => p.toString());
    const toAdd = perms
      .map(code => permIds[code])
      .filter(pid => !currentPermIds.includes(pid.toString()));

    if (toAdd.length > 0) {
      await db.collection('roles').updateOne(
        { _id: roleId },
        { $addToSet: { permissions: { $each: toAdd } } }
      );
      console.log(`  ${code}: added ${toAdd.length} permission(s) to Role.permissions array`);
    } else {
      console.log(`  ${code}: already up to date`);
    }
  }

  // ── 4. Also sync rolepermissions junction table ──────────────────────────────
  console.log('\n--- Syncing rolepermissions junction table ---');
  let rpInserted = 0;
  for (const [roleIdStr, { code, perms }] of Object.entries(roleAssignments)) {
    const roleId = new ObjectId(roleIdStr);
    for (const permCode of perms) {
      const permId = permIds[permCode];
      const ex = await db.collection('rolepermissions').findOne({ roleId, permissionId: permId });
      if (!ex) {
        await db.collection('rolepermissions').insertOne({ roleId, permissionId: permId, createdAt: now, updatedAt: now, __v: 0 });
        rpInserted++;
        console.log(`  ${code} <- ${permCode}`);
      }
    }
  }
  console.log(`  ${rpInserted} new junction links inserted`);

  // ── 5. Verification ──────────────────────────────────────────────────────────
  console.log('\n--- Verification ---');
  for (const [roleIdStr, { code }] of Object.entries(roleAssignments)) {
    const role = await db.collection('roles').findOne({ _id: new ObjectId(roleIdStr) });
    const permCount = (role?.permissions || []).length;
    const hasAttendance = (role?.permissions || []).some(p => {
      const str = p.toString();
      return Object.values(permIds).some(pid => pid.toString() === str);
    });
    console.log(`  ${code}: ${permCount} total permissions, attendance included: ${hasAttendance}`);
  }

  console.log('\n✅ Done');
  await mongoose.disconnect();
}
run().catch(console.error);

