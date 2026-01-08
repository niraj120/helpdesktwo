import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Role } from './src/models/Role';
import { Permission } from './src/models/Permission';

dotenv.config();

const checkSuperAdminPermissions = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find Super Admin role
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' })
      .populate('permissions');

    if (!superAdminRole) {
      console.log('❌ Super Admin role not found!');
      process.exit(1);
    }

    console.log('\n📋 Super Admin Role Details:');
    console.log('Name:', superAdminRole.name);
    console.log('Code:', superAdminRole.code);
    console.log('Description:', superAdminRole.description);
    console.log('Total Permissions:', superAdminRole.permissions?.length || 0);

    // Check if permissions are populated as objects or IDs
    if (superAdminRole.permissions && superAdminRole.permissions.length > 0) {
      const firstPerm = superAdminRole.permissions[0];
      const isPopulated = typeof firstPerm === 'object' && firstPerm !== null && 'code' in firstPerm;

      if (isPopulated) {
        console.log('\n✅ Permissions are populated (objects):');
        console.log('Sample permission codes:');
        superAdminRole.permissions.slice(0, 10).forEach((perm: any) => {
          console.log(`  - ${perm.code}: ${perm.name}`);
        });
      } else {
        console.log('\n⚠️  Permissions are stored as IDs (not populated)');
        console.log('Fetching permission details...');
        
        const permissionIds = superAdminRole.permissions.map((p: any) => p.toString());
        const permissions = await Permission.find({ _id: { $in: permissionIds } });
        
        console.log(`\nFound ${permissions.length} permissions:`);
        console.log('Sample permission codes:');
        permissions.slice(0, 10).forEach((perm: any) => {
          console.log(`  - ${perm.code}: ${perm.name}`);
        });
      }
    } else {
      console.log('\n❌ Super Admin has NO permissions assigned!');
    }

    // Check for critical permissions
    const criticalPermissions = [
      'DASHBOARD_VIEW',
      'TICKET_VIEW_ALL',
      'KB_VIEW',
      'USER_VIEW_ALL',
      'PROJECT_VIEW_ALL',
      'MASTER_DATA_VIEW',
      'RBAC_VIEW_ROLES',
      'PROJECT_MANAGE_SETTINGS'
    ];

    console.log('\n🔍 Checking Critical Permissions (required for menu visibility):');
    
    for (const code of criticalPermissions) {
      const perm = await Permission.findOne({ code });
      if (!perm) {
        console.log(`  ❌ ${code} - Permission doesn't exist in database`);
        continue;
      }

      const hasPermission = superAdminRole.permissions?.some((p: any) => {
        const permId = typeof p === 'object' ? p._id?.toString() : p.toString();
        return permId === perm._id.toString();
      });

      console.log(`  ${hasPermission ? '✅' : '❌'} ${code} ${hasPermission ? '(HAS)' : '(MISSING)'}`);
    }

    // Get all permissions in database
    const allPermissions = await Permission.find().sort({ module: 1, code: 1 });
    console.log(`\n📊 Total Permissions in Database: ${allPermissions.length}`);
    
    // Group by module
    const byModule: { [key: string]: number } = {};
    allPermissions.forEach(p => {
      byModule[p.module] = (byModule[p.module] || 0) + 1;
    });
    
    console.log('\nPermissions by Module:');
    Object.entries(byModule).forEach(([module, count]) => {
      console.log(`  ${module}: ${count}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkSuperAdminPermissions();
