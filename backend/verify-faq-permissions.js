/**
 * Verify FAQ permissions are active and check API response
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

mongoose.connect(MONGODB_URI);

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
  console.log('✅ Connected to MongoDB\n');

  try {
    const Permission = mongoose.connection.collection('permissions');

    // Check FAQ permissions
    console.log('🔍 Checking FAQ permissions...\n');
    const faqPerms = await Permission.find({ module: 'FAQ' }).toArray();
    
    console.log(`Found ${faqPerms.length} FAQ permissions:\n`);
    faqPerms.forEach(p => {
      console.log(`  ${p.code}`);
      console.log(`    - name: ${p.name}`);
      console.log(`    - module: ${p.module}`);
      console.log(`    - category: ${p.category}`);
      console.log(`    - isActive: ${p.isActive}`);
      console.log('');
    });

    // Check all categories
    const allPerms = await Permission.find({ isActive: true }).toArray();
    const categories = [...new Set(allPerms.map(p => p.category))].sort();
    console.log(`\n📊 All categories (${categories.length}):`);
    categories.forEach(cat => console.log(`  - ${cat}`));

    // Check if FAQ category exists
    const faqInCategories = categories.includes('faq');
    console.log(`\n✓ FAQ category exists: ${faqInCategories}`);

    // Simulate grouped API response
    console.log('\n📋 Simulating grouped API response...\n');
    const grouped = {};
    allPerms.forEach(permission => {
      const category = permission.category;
      const module = permission.module;
      
      if (!grouped[category]) {
        grouped[category] = {};
      }
      
      if (!grouped[category][module]) {
        grouped[category][module] = [];
      }
      
      grouped[category][module].push({
        _id: permission._id,
        name: permission.name,
        code: permission.code,
        description: permission.description,
      });
    });

    if (grouped['faq']) {
      console.log('✅ FAQ found in grouped response:');
      console.log(JSON.stringify(grouped['faq'], null, 2));
    } else {
      console.log('❌ FAQ NOT found in grouped response');
      console.log('Available categories:', Object.keys(grouped).sort());
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
});
