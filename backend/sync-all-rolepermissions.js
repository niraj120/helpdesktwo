const mongoose = require('mongoose');
const MONGO_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function syncAllRolePermissions() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  
  // Get all roles with permissions
  const roles = await db.collection('roles').find({ permissions: { $exists: true, $ne: [] } }).toArray();
  
  console.log(`Found ${roles.length} roles with embedded permissions`);
  
  for (const role of roles) {
    if (!role.permissions || role.permissions.length === 0) continue;
    
    console.log(`\n--- Processing: ${role.name} (${role.permissions.length} permissions) ---`);
    
    // Get current rolepermissions for this role
    const existing = await db.collection('rolepermissions').find({ role: role._id }).toArray();
    const existingPermIds = existing.map(rp => rp.permission.toString());
    
    console.log(`  Currently in junction table: ${existing.length}`);
    
    let added = 0;
    for (const permId of role.permissions) {
      const permIdStr = permId.toString();
      if (!existingPermIds.includes(permIdStr)) {
        // Add to rolepermissions
        await db.collection('rolepermissions').insertOne({
          role: role._id,
          permission: new mongoose.Types.ObjectId(permId),
          createdAt: new Date(),
          updatedAt: new Date()
        });
        added++;
      }
    }
    
    if (added > 0) {
      console.log(`  Added ${added} new permissions to junction table`);
    } else {
      console.log(`  All permissions already synced`);
    }
    
    // Verify
    const final = await db.collection('rolepermissions').countDocuments({ role: role._id });
    console.log(`  Final count in junction table: ${final}`);
  }
  
  console.log('\n=== Done ===');
  await mongoose.disconnect();
}

syncAllRolePermissions().catch(e => console.error(e));
