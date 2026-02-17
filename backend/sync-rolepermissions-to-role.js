/**
 * SYNC SCRIPT: Consolidate permissions to Role.permissions array
 * 
 * This script syncs any permissions that exist in the rolepermissions junction table
 * but are missing from the Role.permissions array (the canonical source).
 * 
 * WHY THIS IS NEEDED:
 * - The system had TWO places storing permissions:
 *   1. Role.permissions[] array (THE SINGLE SOURCE OF TRUTH - used by JWT generation)
 *   2. rolepermissions junction table (DEPRECATED - some scripts added permissions here only)
 * 
 * - This caused bugs where permissions appeared "assigned" but didn't work
 *   because JWT generation reads from Role.permissions[], not the junction table.
 * 
 * Run with: node sync-rolepermissions-to-role.js
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function syncPermissions() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Get all roles
    const roles = await db.collection('roles').find({}).toArray();
    console.log(`Found ${roles.length} roles to check\n`);
    console.log('=' .repeat(70));
    
    let totalAdded = 0;
    
    for (const role of roles) {
      console.log(`\n📋 Processing: ${role.name} (${role.code})`);
      
      // Get permissions from junction table for this role
      const junctionPerms = await db.collection('rolepermissions')
        .find({ roleId: role._id })
        .toArray();
      
      // Get current permissions in Role.permissions array
      const rolePermIds = (role.permissions || []).map(id => id.toString());
      
      console.log(`   Junction table: ${junctionPerms.length} permissions`);
      console.log(`   Role.permissions[]: ${rolePermIds.length} permissions`);
      
      // Find permissions in junction but NOT in role.permissions
      const missingInRole = [];
      for (const jp of junctionPerms) {
        const permIdStr = jp.permissionId.toString();
        if (!rolePermIds.includes(permIdStr)) {
          // Get permission details
          const perm = await db.collection('permissions').findOne({ _id: jp.permissionId });
          if (perm) {
            missingInRole.push({
              id: jp.permissionId,
              code: perm.code
            });
          }
        }
      }
      
      if (missingInRole.length > 0) {
        console.log(`   ⚠️  Found ${missingInRole.length} permissions in junction but NOT in role.permissions:`);
        missingInRole.forEach(p => console.log(`      - ${p.code}`));
        
        // Add missing permissions to role.permissions
        const newPermIds = missingInRole.map(p => p.id);
        await db.collection('roles').updateOne(
          { _id: role._id },
          { $push: { permissions: { $each: newPermIds } } }
        );
        
        console.log(`   ✅ Added ${missingInRole.length} permissions to Role.permissions[]`);
        totalAdded += missingInRole.length;
      } else {
        console.log(`   ✅ All permissions are in sync`);
      }
    }
    
    console.log('\n' + '=' .repeat(70));
    console.log('\n📊 SYNC SUMMARY:');
    console.log(`   Total roles processed: ${roles.length}`);
    console.log(`   Total permissions added to Role.permissions[]: ${totalAdded}`);
    
    if (totalAdded > 0) {
      console.log('\n✅ Sync complete! All permissions are now in Role.permissions[] (single source of truth)');
      console.log('⚠️  The rolepermissions junction table is now DEPRECATED.');
      console.log('   Future permission assignments should only use Role.permissions[]');
    } else {
      console.log('\n✅ All permissions were already in sync!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

syncPermissions();
