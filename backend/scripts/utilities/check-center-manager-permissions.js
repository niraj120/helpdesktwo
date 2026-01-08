const mongoose = require('mongoose');
require('dotenv').config();
const Role = require('./src/models/Role');
const User = require('./src/models/User');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

const checkCenterManagerPermissions = async () => {
  await connectDB();

  try {

    // Find Center Manager role
    const centerManagerRole = await Role.findOne({ 
      $or: [
        { code: 'CENTER_MANAGER' },
        { name: /center.*manager/i }
      ]
    }).populate('permissions');

    if (!centerManagerRole) {
      console.log('❌ Center Manager role not found');
      process.exit(1);
    }

    console.log('\n=== CENTER MANAGER ROLE ===');
    console.log('Role ID:', centerManagerRole._id);
    console.log('Role Code:', centerManagerRole.code);
    console.log('Role Name:', centerManagerRole.name);
    console.log('\nPermissions Count:', centerManagerRole.permissions?.length || 0);
    
    if (centerManagerRole.permissions && centerManagerRole.permissions.length > 0) {
      console.log('\n=== ASSIGNED PERMISSIONS ===');
      centerManagerRole.permissions.forEach((perm, index) => {
        console.log(`${index + 1}. ${perm.code} - ${perm.name}`);
      });
    } else {
      console.log('\n⚠️  NO PERMISSIONS ASSIGNED TO CENTER MANAGER ROLE');
    }

    // Find Shubhangi Mathur
    const user = await User.findOne({ 
      email: /shubhangi/i 
    }).populate({
      path: 'role',
      populate: { path: 'permissions' }
    });

    if (user) {
      console.log('\n=== USER: Shubhangi Mathur ===');
      console.log('User ID:', user._id);
      console.log('Email:', user.email);
      console.log('Role:', user.role?.name);
      console.log('Role Code:', user.role?.code);
      
      if (user.role?.permissions) {
        console.log('\nPermissions from User\'s Role:', user.role.permissions.length);
        user.role.permissions.forEach((perm, index) => {
          console.log(`${index + 1}. ${perm.code}`);
        });
      }
    }

    // Show what permissions are needed for each module
    console.log('\n=== REQUIRED PERMISSIONS FOR MODULES ===');
    console.log('Dashboard: DASHBOARD_VIEW');
    console.log('Tickets: TICKET_VIEW_ALL or TICKET_VIEW_OWN');
    console.log('Knowledge Base: KB_VIEW, KB_CREATE, or KB_EDIT');
    console.log('Users: USER_VIEW_ALL, USER_CREATE, or USER_EDIT');
    console.log('Projects: PROJECT_VIEW_ALL, PROJECT_CREATE, or PROJECT_EDIT');
    console.log('Master Data: MASTER_DATA_VIEW or MASTER_DATA_MANAGE_CATEGORIES');
    console.log('RBAC: RBAC_VIEW_ROLES, RBAC_CREATE_ROLE, or RBAC_EDIT_ROLE');
    console.log('Settings: PROJECT_MANAGE_SETTINGS or SYSTEM_SETTINGS_VIEW');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

checkCenterManagerPermissions();
