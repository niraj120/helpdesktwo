/**
 * Fix Counselor Role Permissions
 * 1. Remove TICKET_VIEW_ALL (keep only TICKET_VIEW_OWN)
 * 2. Add REPORT_VIEW_QUERY permission
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

async function fixCounselorPermissions() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.log('❌ MONGODB_URI not found in .env file');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
    
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false, collection: 'roles' }));
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false, collection: 'permissions' }));
    const RolePermission = mongoose.model('RolePermission', new mongoose.Schema({}, { strict: false, collection: 'rolepermissions' }));
    
    // Find Counselor role
    const counselorRole = await Role.findOne({ code: 'COUNSELOR_L1' });
    
    if (!counselorRole) {
      console.log('❌ Counselor role not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('✅ Found Counselor role:');
    console.log(`   ID: ${counselorRole._id}`);
    console.log(`   Name: ${counselorRole.name}`);
    console.log(`   Code: ${counselorRole.code}`);
    
    // Step 1: Remove TICKET_VIEW_ALL permission
    console.log('\n🔍 Step 1: Removing TICKET_VIEW_ALL permission...');
    const viewAllPerm = await Permission.findOne({ code: 'TICKET_VIEW_ALL' });
    
    if (viewAllPerm) {
      const deleteResult = await RolePermission.deleteOne({
        roleId: counselorRole._id,
        permissionId: viewAllPerm._id
      });
      
      if (deleteResult.deletedCount > 0) {
        console.log('   ✅ TICKET_VIEW_ALL removed');
      } else {
        console.log('   ⚠️  TICKET_VIEW_ALL was not assigned (already removed)');
      }
    } else {
      console.log('   ❌ TICKET_VIEW_ALL permission not found in system');
    }
    
    // Step 2: Add REPORT_VIEW_QUERY permission
    console.log('\n🔍 Step 2: Adding REPORT_VIEW_QUERY permission...');
    const reportViewPerm = await Permission.findOne({ code: 'REPORT_VIEW_QUERY' });
    
    if (reportViewPerm) {
      const existing = await RolePermission.findOne({
        roleId: counselorRole._id,
        permissionId: reportViewPerm._id
      });
      
      if (existing) {
        console.log('   ⏭️  REPORT_VIEW_QUERY already exists');
      } else {
        await RolePermission.create({
          roleId: counselorRole._id,
          permissionId: reportViewPerm._id
        });
        console.log('   ✅ REPORT_VIEW_QUERY added');
      }
    } else {
      console.log('   ❌ REPORT_VIEW_QUERY permission not found in system');
    }
    
    // Step 3: Verify final state
    console.log('\n📊 Final Permission Check:');
    const finalRolePerms = await RolePermission.find({ roleId: counselorRole._id });
    const permIds = finalRolePerms.map(rp => rp.permissionId);
    const finalPerms = await Permission.find({ _id: { $in: permIds } }, { code: 1 }).sort({ code: 1 });
    
    const hasViewAll = finalPerms.some(p => p.code === 'TICKET_VIEW_ALL');
    const hasViewOwn = finalPerms.some(p => p.code === 'TICKET_VIEW_OWN');
    const hasReportView = finalPerms.some(p => p.code === 'REPORT_VIEW_QUERY');
    
    console.log(`   TICKET_VIEW_ALL: ${hasViewAll ? '❌ YES (should be NO)' : '✅ NO (correct)'}`);
    console.log(`   TICKET_VIEW_OWN: ${hasViewOwn ? '✅ YES (correct)' : '❌ NO (should be YES)'}`);
    console.log(`   REPORT_VIEW_QUERY: ${hasReportView ? '✅ YES (correct)' : '❌ NO (should be YES)'}`);
    
    console.log('\n' + '='.repeat(70));
    console.log('📝 EXPECTED BEHAVIOR AFTER LOGIN:');
    console.log('='.repeat(70));
    console.log('   ✅ Rajesh can access Query Report page');
    console.log('   ✅ Rajesh can see ONLY tickets assigned to him');
    console.log('   ❌ Rajesh CANNOT see Employee Report');
    console.log('   ❌ Rajesh CANNOT see Asset Report');
    console.log('='.repeat(70));
    
    console.log('\n🚪 IMPORTANT: Rajesh must LOGOUT and LOGIN again!');
    console.log('   Permissions are cached in the JWT token and localStorage');
    console.log('='.repeat(70));
    
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixCounselorPermissions();
