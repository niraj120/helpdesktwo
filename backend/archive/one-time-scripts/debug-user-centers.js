const mongoose = require('mongoose');

mongoose.connect('mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Connection error:', err));

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

const centerSchema = new mongoose.Schema({}, { strict: false });
const Center = mongoose.model('Center', centerSchema);

const assetMappingSchema = new mongoose.Schema({}, { strict: false });
const CenterAssetMapping = mongoose.model('CenterAssetMapping', assetMappingSchema, 'centerassetmappings');

async function debug() {
  try {
    // Find user
    const user = await User.findOne({ email: 'devesh.mishra@gmail.com' });
    console.log('\n=== USER ===');
    console.log('User ID:', user._id);
    console.log('Centers field:', user.centers);
    console.log('Centers type:', Array.isArray(user.centers) ? 'Array' : typeof user.centers);
    
    // Get center IDs
    let centerIds = [];
    if (Array.isArray(user.centers)) {
      centerIds = user.centers.map(c => c.toString());
    } else if (user.centers) {
      centerIds = [user.centers.toString()];
    }
    console.log('Center IDs:', centerIds);
    
    // Get centers
    const centers = await Center.find({ _id: { $in: centerIds } });
    console.log('\n=== CENTERS ===');
    centers.forEach(center => {
      console.log('Center ID:', center._id);
      console.log('Center Name:', center.centerName);
      console.log('Project ID:', center.projectId);
    });
    
    // Get project IDs
    const projectIds = [...new Set(centers.map(c => c.projectId.toString()))];
    console.log('\nProject IDs:', projectIds);
    
    // Query asset mappings
    console.log('\n=== ASSET MAPPINGS QUERY ===');
    const query = {
      $or: [
        { centerId: { $in: centerIds } },
        { projectId: { $in: centerIds } },
        { projectId: { $in: projectIds } }
      ]
    };
    console.log('Query:', JSON.stringify(query, null, 2));
    
    const mappings = await CenterAssetMapping.find(query);
    console.log('\n=== FOUND MAPPINGS ===');
    console.log('Count:', mappings.length);
    mappings.forEach(m => {
      console.log('\nMapping ID:', m._id);
      console.log('Asset ID:', m.assetId);
      console.log('Project ID:', m.projectId);
      console.log('Center ID:', m.centerId || 'NOT SET');
      console.log('Total Assigned:', m.totalAssigned);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debug();
