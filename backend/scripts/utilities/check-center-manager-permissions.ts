import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Role } from './src/models/Role';
import { User } from './src/models/User';
import { Permission } from './src/models/Permission';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected\n');
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
        { name: /center.*manager/i },
        { code: 'HELPDESK' }
      ]
    }).lean();

    if (!centerManagerRole) {
      console.log('❌ Center Manager/Helpdesk role not found');
      process.exit(1);
    }

    console.log('=== ROLE INFORMATION ===');
    console.log('Role ID:', centerManagerRole._id);
    console.log('Role Code:', centerManagerRole.code);
    console.log('Role Name:', centerManagerRole.name);
    console.log('\nPermissions (IDs):', centerManagerRole.permissions?.length || 0);
    
    // Get permission details
    const permissionIds = centerManagerRole.permissions || [];
    if (permissionIds.length > 0) {
      const permissions = await Permission.find({
        _id: { $in: permissionIds }
      }).lean();
      
      console.log('\n=== ASSIGNED PERMISSIONS ===');
      permissions.forEach((perm: any, index: number) => {
        console.log(`${index + 1}. ${perm.code} - ${perm.name}`);
      });
    } else {
      console.log('\n⚠️  NO PERMISSIONS ASSIGNED TO THIS ROLE');
      console.log('\n🔧 SOLUTION: You need to assign permissions to this role in the RBAC Setup module');
    }

    // Find Shubhangi Mathur
    const user = await User.findOne({ 
      $or: [
        { email: /shubhangi/i },
        { name: /shubhangi/i }
      ]
    }).lean();

    if (user) {
      console.log('\n=== USER INFORMATION ===');
      console.log('User ID:', user._id);
      console.log('Name:', `${user.firstName} ${user.lastName}`);
      console.log('Email:', user.email);
      
      // Get role details
      const userRole = await Role.findById(user.role).lean();
      if (userRole) {
        console.log('Role:', userRole.name);
        console.log('Role Code:', userRole.code);
        
        const rolePermIds = userRole.permissions || [];
        console.log('\nPermissions Count:', rolePermIds.length);
        
        if (rolePermIds.length > 0) {
          const rolePerms = await Permission.find({
            _id: { $in: rolePermIds }
          }).lean();
          
          console.log('\nPermissions:');
          rolePerms.forEach((perm: any, index: number) => {
            console.log(`${index + 1}. ${perm.code}`);
          });
        }
      }
    } else {
      console.log('\n⚠️  User "Shubhangi" not found');
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

    console.log('\n=== RECOMMENDATION ===');
    console.log('For a Center Manager, you should assign:');
    console.log('- DASHBOARD_VIEW');
    console.log('- TICKET_VIEW_ALL, TICKET_CREATE, TICKET_EDIT, TICKET_ASSIGN');
    console.log('- KB_VIEW, KB_CREATE');
    console.log('- USER_VIEW_ALL');
    console.log('- PROJECT_VIEW_ALL');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

checkCenterManagerPermissions();
