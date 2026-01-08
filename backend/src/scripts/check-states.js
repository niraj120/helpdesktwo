require('dotenv').config();
const mongoose = require('mongoose');

const stateSchema = new mongoose.Schema({
  key: String,
  value: String,
  country: String,
  isActive: Boolean,
  displayOrder: Number
});

const State = mongoose.model('State', stateSchema);

async function checkStates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://34.14.157.13:27017/sac_helpdesk');
    
    console.log('✅ Connected to MongoDB');
    
    // Get total count
    const total = await State.countDocuments();
    console.log(`\n📊 Total states in database: ${total}`);
    
    // Get distinct countries
    const countries = await State.distinct('country');
    console.log('\n🌍 Distinct countries found:', countries);
    
    // Get sample states
    const samples = await State.find().limit(5);
    console.log('\n📋 Sample states:');
    samples.forEach(state => {
      console.log(`  - ${state.value} (country: "${state.country}", key: "${state.key}")`);
    });
    
    // Check for India specifically
    const indiaStates = await State.find({ country: 'India' }).limit(5);
    console.log(`\n🇮🇳 States with country="India": ${indiaStates.length}`);
    
    // Try different variations
    const variations = ['india', 'INDIA', 'IN'];
    for (const variation of variations) {
      const count = await State.countDocuments({ country: variation });
      if (count > 0) {
        console.log(`\n✅ Found ${count} states with country="${variation}"`);
        const sample = await State.findOne({ country: variation });
        console.log(`   Sample: ${sample.value}`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkStates();
