const mongoose = require('mongoose');
require('dotenv').config();

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const roleSchema = new mongoose.Schema({}, { strict: false, collection: 'roles' });
const permissionSchema = new mongoose.Schema({}, { strict: false, collection: 'permissions' });
const roleProjectSchema = new mongoose.Schema({}, { strict: false, collection: 'roleprojects' });

const User = mongoose.model('User', userSchema);
const Role = mongoose.model('Role', roleSchema);
const Permission = mongoose.model('Permission', permissionSchema);
const RoleProject = mongoose.model('RoleProject', roleProjectSchema);

async function checkSubhangiAccess() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const userId = '691eab5b97b5ad11bf7f9907';
    
    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log('👤 USER DETAILS:');
    console.log('Name:', user.fullName);
    console.log('Email:', user.email);
    console.log('Role ID:', user.role);
    console.log('Projects:', user.projects);
    console.log('Active:', user.isActive);
    console.log('\n');

    // Get role details
    const role = await Role.findById(user.role);
    if (!role) {
      console.log('❌ Role not found!');
      return;
    }
    
    console.log('🎭 ROLE DETAILS:');
    console.log('Role Name:', role.name);
    console.log('Role Description:', role.description);
    console.log('Permission IDs:', role.permissionIds);
    console.log('\n');

    // Get permissions
    const permissions = await Permission.find({ _id: { $in: role.permissionIds } });
    console.log('🔐 PERMISSIONS (' + permissions.length + '):');
    permissions.forEach(p => {
      console.log(`  - ${p.code} (${p.name})`);
    });
    console.log('\n');

    // Check for user management permissions
    const userManagementPerms = permissions.filter(p => p.code && p.code.startsWith('USER_'));
    console.log('👥 USER MANAGEMENT PERMISSIONS (' + userManagementPerms.length + '):');
    if (userManagementPerms.length > 0) {
      userManagementPerms.forEach(p => {
        console.log(`  ✅ ${p.code} (${p.name})`);
      });
    } else {
      console.log('  ❌ No user management permissions found!');
    }
    console.log('\n');

    // Check role-project mapping
    const projectId = user.projects && user.projects.length > 0 ? user.projects[0] : null;
    console.log('🔗 ASSIGNED PROJECTS:');
    console.log('  Projects array:', user.projects);
    console.log('  First project:', projectId);
    
    if (projectId) {
      const roleProject = await RoleProject.findOne({ 
        roleId: user.role,
        projectId: projectId 
      });
      
      console.log('  Role-Project Mapping:', roleProject ? '✅ EXISTS' : '❌ MISSING');
      if (roleProject) {
        console.log('  Mapping ID:', roleProject._id);
      }
    } else {
      console.log('  ❌ No projects assigned to user!');
    }
    console.log('\n');

    // Check if USER_VIEW_ALL exists
    const userViewAll = await Permission.findOne({ code: 'USER_VIEW_ALL' });
    console.log('🔍 USER_VIEW_ALL PERMISSION:');
    if (userViewAll) {
      console.log('  ✅ Permission exists in database');
      console.log('  ID:', userViewAll._id);
      console.log('  Name:', userViewAll.name);
      const hasPermission = role.permissionIds.some(id => id.toString() === userViewAll._id.toString());
      console.log('  Assigned to role:', hasPermission ? '✅ YES' : '❌ NO');
    } else {
      console.log('  ❌ Permission does not exist in database!');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkSubhangiAccess();
