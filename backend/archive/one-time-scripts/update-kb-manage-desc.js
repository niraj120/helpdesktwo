require('dotenv').config();
const mongoose = require('mongoose');

async function updateKBManage() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, {strict: false, collection: 'permissions'}));
    
    console.log('📝 Updating KB_MANAGE permission...\n');
    
    const result = await Permission.updateOne(
      { code: 'KB_MANAGE' },
      { 
        $set: {
          name: 'Manage KB System',
          description: 'Full access to manage KB levels, articles, and tables in the new modular system'
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log('✅ Updated KB_MANAGE permission');
      
      const updated = await Permission.findOne({ code: 'KB_MANAGE' });
      console.log('\n📋 Updated Details:');
      console.log('   Code:', updated.code);
      console.log('   Name:', updated.name);
      console.log('   Description:', updated.description);
    } else {
      console.log('ℹ️  No changes made to KB_MANAGE');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateKBManage();
