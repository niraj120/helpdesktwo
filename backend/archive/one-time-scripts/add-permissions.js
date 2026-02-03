const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

const permissionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  description: { type: String },
  category: { type: String, required: true },
  subCategory: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Permission = mongoose.model('Permission', permissionSchema);

const newPermissions = [
  {
    name: 'MY_ASSETS_VIEW',
    displayName: 'View My Assets',
    description: 'View assets assigned to the user',
    category: 'Asset Management',
    subCategory: 'My Assets'
  },
  {
    name: 'REPORT_VIEW_QUERY',
    displayName: 'View Query Report',
    description: 'View query/ticket list reports',
    category: 'Reports',
    subCategory: 'Report Viewing'
  },
  {
    name: 'REPORT_VIEW_ASSET',
    displayName: 'View Asset Report',
    description: 'View asset reports',
    category: 'Reports',
    subCategory: 'Report Viewing'
  },
  {
    name: 'REPORT_VIEW_EMPLOYEE',
    displayName: 'View Employee Report',
    description: 'View employee reports',
    category: 'Reports',
    subCategory: 'Report Viewing'
  }
];

async function addPermissions() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    for (const perm of newPermissions) {
      const existing = await Permission.findOne({ name: perm.name });
      if (existing) {
        console.log(`⚠️  Permission ${perm.name} already exists`);
      } else {
        await Permission.create(perm);
        console.log(`✅ Added permission: ${perm.name}`);
      }
    }

    // Get Super Admin role and add permissions
    const Role = mongoose.model('Role', new mongoose.Schema({
      name: String,
      permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }]
    }));

    const superAdmin = await Role.findOne({ name: 'Super Admin' });
    if (superAdmin) {
      const permissionIds = await Permission.find({ 
        name: { $in: newPermissions.map(p => p.name) } 
      }).select('_id');
      
      for (const permId of permissionIds) {
        if (!superAdmin.permissions.includes(permId._id)) {
          superAdmin.permissions.push(permId._id);
        }
      }
      
      await superAdmin.save();
      console.log('✅ Added permissions to Super Admin role');
    }

    console.log('\n📊 Final permission count:', await Permission.countDocuments());
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addPermissions();
