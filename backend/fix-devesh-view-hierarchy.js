const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

async function fixDeveshPermissions() {
  try {
    await mongoose.connect(MONGO_URI, {});
    console.log('Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Get Devesh
    const devesh = await db.collection('users').findOne({ 
      email: 'devesh.mishra@gmail.com' 
    });
    
    // Get his role
    const role = await db.collection('roles').findOne({ _id: devesh.role });
    
    console.log(`Role: ${role.name} (${role.code})\n`);
    
    // Get current permissions
    const currentPermissions = await db.collection('permissions').find({
      _id: { $in: role.permissions }
    }).toArray();
    
    const dashboardPerms = currentPermissions.filter(p => p.code.includes('DASHBOARD'));
    
    console.log('Current Dashboard permissions:');
    dashboardPerms.forEach(p => console.log(`  - ${p.code}`));
    
    // Check if DASHBOARD_VIEW_HIERARCHY exists
    const hasViewHierarchy = dashboardPerms.some(p => p.code === 'DASHBOARD_VIEW_HIERARCHY');
    
    if (!hasViewHierarchy) {
      console.log('\n❌ Missing DASHBOARD_VIEW_HIERARCHY permission!');
      console.log('   Adding it now...\n');
      
      // Get the permission
      const hierarchyPerm = await db.collection('permissions').findOne({
        code: 'DASHBOARD_VIEW_HIERARCHY'
      });
      
      if (hierarchyPerm) {
        // Add to role
        await db.collection('roles').updateOne(
          { _id: role._id },
          { $addToSet: { permissions: hierarchyPerm._id } }
        );
        
        console.log('✅ Added DASHBOARD_VIEW_HIERARCHY to District Nodal Officer role');
      } else {
        console.log('❌ DASHBOARD_VIEW_HIERARCHY permission not found in database!');
      }
    } else {
      console.log('\n✅ DASHBOARD_VIEW_HIERARCHY already exists');
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Done! Devesh needs to logout and login again to see the view mode selector.');
    
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
  }
}

fixDeveshPermissions();
