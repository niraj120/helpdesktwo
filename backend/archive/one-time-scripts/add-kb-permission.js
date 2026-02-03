/**
 * Add KB_MANAGE permission to the system
 * Run: node add-kb-permission.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk';

async function addKBPermission() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Permission = mongoose.model('Permission', new mongoose.Schema({
      name: String,
      code: String,
      description: String,
      module: String,
      createdAt: Date,
      updatedAt: Date,
    }));

    const Role = mongoose.model('Role', new mongoose.Schema({
      name: String,
      permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
    }));

    // Check if permission already exists
    let kbPermission = await Permission.findOne({ code: 'KB_MANAGE' });
    
    if (kbPermission) {
      console.log('✅ KB_MANAGE permission already exists');
    } else {
      // Create new permission
      kbPermission = await Permission.create({
        name: 'Manage Knowledge Base',
        code: 'KB_MANAGE',
        description: 'Manage Knowledge Base (Levels and Articles)',
        module: 'Knowledge Base',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('✅ Created KB_MANAGE permission');
    }

    // Add to Super Admin role
    let superAdminRole = await Role.findOne({ name: 'Super Admin' });
    
    if (!superAdminRole) {
      console.log('⚠️  Super Admin role not found, trying alternatives...');
      // Try different names
      superAdminRole = await Role.findOne({ name: /super.*admin/i });
      
      if (!superAdminRole) {
        console.log('Available roles:');
        const allRoles = await Role.find({}).select('name');
        allRoles.forEach(r => console.log(`  - ${r.name}`));
        return;
      } else {
        console.log(`✅ Found role: ${superAdminRole.name}`);
      }
    }

    if (superAdminRole.permissions.includes(kbPermission._id)) {
      console.log('✅ Super Admin already has KB_MANAGE permission');
    } else {
      superAdminRole.permissions.push(kbPermission._id);
      await superAdminRole.save();
      console.log('✅ Added KB_MANAGE permission to Super Admin role');
    }

    console.log('\n🎉 KB Permission setup complete!');
    console.log(`Permission ID: ${kbPermission._id}`);
    console.log(`Super Admin Role: ${superAdminRole.name}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

addKBPermission();
