/**
 * Script to fix Devesh's dashboard access
 * 1. Add DASHBOARD_VIEW permission to District Nodal Officer role
 * 2. Create hierarchy mapping: Rajesh → Devesh
 * 
 * Run: node backend/fix-devesh-dashboard.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk-v2';

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' }
}, { collection: 'users' });

const roleSchema = new mongoose.Schema({
  name: String,
  code: String,
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
}, { collection: 'roles' });

const permissionSchema = new mongoose.Schema({
  code: String,
  name: String,
  description: String
}, { collection: 'permissions' });

const hierarchySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: Date
}, { collection: 'user_reporting_hierarchy' });

const User = mongoose.model('User', userSchema);
const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);
const UserReportingHierarchy = mongoose.model('UserReportingHierarchy', hierarchySchema);

async function fixDeveshDashboard() {
  try {
    console.log('🔗 Connecting to MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // ===== STEP 1: Add DASHBOARD_VIEW permission to District Nodal Officer role =====
    console.log('📋 STEP 1: Adding DASHBOARD_VIEW permission to District Nodal Officer role...\n');
    
    const dnoRole = await Role.findOne({ code: 'CENTER_MANAGER' });
    if (!dnoRole) {
      console.log('❌ District Nodal Officer role not found');
      return;
    }
    
    const dashboardViewPerm = await Permission.findOne({ code: 'DASHBOARD_VIEW' });
    if (!dashboardViewPerm) {
      console.log('❌ DASHBOARD_VIEW permission not found');
      return;
    }
    
    const hasPermission = dnoRole.permissions.some(p => p.toString() === dashboardViewPerm._id.toString());
    
    if (hasPermission) {
      console.log('✅ District Nodal Officer already has DASHBOARD_VIEW permission\n');
    } else {
      dnoRole.permissions.push(dashboardViewPerm._id);
      await dnoRole.save();
      console.log('✅ Successfully added DASHBOARD_VIEW permission to District Nodal Officer role\n');
    }
    
    // ===== STEP 2: Create hierarchy mapping: Rajesh → Devesh =====
    console.log('🌳 STEP 2: Creating hierarchy mapping...\n');
    
    // Find Rajesh (counselor)
    const rajesh = await User.findOne({ 
      $or: [
        { email: /rajesh/i },
        { firstName: /rajesh/i },
        { lastName: /rajesh/i }
      ]
    });
    
    if (!rajesh) {
      console.log('❌ User "rajesh" not found');
      console.log('   Please provide the correct email or name\n');
    } else {
      console.log(`✅ Found Rajesh: ${rajesh.firstName} ${rajesh.lastName} (${rajesh.email})`);
      
      // Find Devesh
      const devesh = await User.findOne({ 
        $or: [
          { email: /devesh/i },
          { firstName: /devesh/i },
          { lastName: /devesh/i }
        ]
      });
      
      if (!devesh) {
        console.log('❌ User "devesh" not found\n');
      } else {
        console.log(`✅ Found Devesh: ${devesh.firstName} ${devesh.lastName} (${devesh.email})\n`);
        
        // Check if mapping already exists
        const existingMapping = await UserReportingHierarchy.findOne({ userId: rajesh._id });
        
        if (existingMapping) {
          if (existingMapping.reportingManager.toString() === devesh._id.toString()) {
            console.log('✅ Hierarchy mapping already exists: Rajesh → Devesh\n');
          } else {
            // Update existing mapping
            const oldManager = await User.findById(existingMapping.reportingManager);
            console.log(`📝 Updating mapping from ${oldManager?.firstName} to ${devesh.firstName}...`);
            existingMapping.reportingManager = devesh._id;
            await existingMapping.save();
            console.log('✅ Successfully updated hierarchy mapping\n');
          }
        } else {
          // Create new mapping
          const newMapping = new UserReportingHierarchy({
            userId: rajesh._id,
            reportingManager: devesh._id,
            createdAt: new Date()
          });
          await newMapping.save();
          console.log('✅ Successfully created hierarchy mapping: Rajesh → Devesh\n');
        }
        
        // Verify mapping
        const verifyMapping = await UserReportingHierarchy.findOne({ userId: rajesh._id })
          .populate('userId', 'firstName lastName email')
          .populate('reportingManager', 'firstName lastName email');
        
        console.log('📊 HIERARCHY VERIFICATION:');
        console.log(`   Employee: ${verifyMapping.userId.firstName} ${verifyMapping.userId.lastName}`);
        console.log(`   Reports To: ${verifyMapping.reportingManager.firstName} ${verifyMapping.reportingManager.lastName}`);
        console.log(`   Manager Email: ${verifyMapping.reportingManager.email}\n`);
      }
    }
    
    // ===== STEP 3: Verify final state =====
    console.log('🔍 STEP 3: Verifying final state...\n');
    
    const deveshFinal = await User.findOne({ 
      $or: [{ email: /devesh/i }, { firstName: /devesh/i }]
    }).populate({
      path: 'role',
      populate: { path: 'permissions' }
    });
    
    if (deveshFinal && deveshFinal.role) {
      const perms = deveshFinal.role.permissions || [];
      const hasDashboardView = perms.some(p => p.code === 'DASHBOARD_VIEW');
      const hasDashboardHierarchy = perms.some(p => p.code === 'DASHBOARD_VIEW_HIERARCHY');
      
      console.log('✅ Devesh\'s Dashboard Permissions:');
      console.log(`   ${hasDashboardView ? '✅' : '❌'} DASHBOARD_VIEW (required for Dashboard tab)`);
      console.log(`   ${hasDashboardHierarchy ? '✅' : '❌'} DASHBOARD_VIEW_HIERARCHY (for team view)`);
    }
    
    const deveshReports = await UserReportingHierarchy.find({ reportingManager: deveshFinal._id })
      .populate('userId', 'firstName lastName email');
    
    console.log(`\n✅ Devesh's Direct Reports: ${deveshReports.length}`);
    deveshReports.forEach(report => {
      console.log(`   - ${report.userId.firstName} ${report.userId.lastName} (${report.userId.email})`);
    });
    
    console.log('\n🎉 SETUP COMPLETE!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Ask Devesh to LOGOUT and LOGIN again (to refresh permissions)');
    console.log('   2. Dashboard tab should now appear in navigation');
    console.log('   3. He should see Rajesh\'s tickets in the hierarchy view');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

fixDeveshDashboard();
