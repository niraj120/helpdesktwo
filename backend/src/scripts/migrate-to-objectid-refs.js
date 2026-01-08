require('dotenv').config();
const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema({
  key: String,
  value: String,
  code: String,
  isActive: Boolean
});

const stateSchema = new mongoose.Schema({
  key: String,
  value: String,
  country: String,
  countryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Country' },
  isActive: Boolean
});

const citySchema = new mongoose.Schema({
  key: String,
  value: String,
  state: String,
  country: String,
  stateId: { type: mongoose.Schema.Types.ObjectId, ref: 'State' },
  countryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Country' },
  isActive: Boolean
});

const Country = mongoose.model('Country', countrySchema);
const State = mongoose.model('State', stateSchema);
const City = mongoose.model('City', citySchema);

async function migrateToObjectIds() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://34.14.157.13:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Migrate States - add countryId based on country name
    console.log('📍 Step 1: Migrating States...');
    const states = await State.find({ countryId: { $exists: false } });
    console.log(`   Found ${states.length} states without countryId`);
    
    let statesUpdated = 0;
    for (const state of states) {
      const country = await Country.findOne({ 
        $or: [
          { key: state.country?.toLowerCase() },
          { value: { $regex: new RegExp(`^${state.country}$`, 'i') } }
        ]
      });
      
      if (country) {
        await State.updateOne(
          { _id: state._id },
          { $set: { countryId: country._id } }
        );
        statesUpdated++;
        console.log(`   ✓ ${state.value} → country: ${country.value} (${country._id})`);
      } else {
        console.log(`   ✗ ${state.value} → country "${state.country}" not found`);
      }
    }
    console.log(`   ✅ Updated ${statesUpdated}/${states.length} states\n`);

    // Step 2: Migrate Cities - add stateId and countryId
    console.log('📍 Step 2: Migrating Cities...');
    const cities = await City.find({ 
      $or: [
        { stateId: { $exists: false } },
        { countryId: { $exists: false } }
      ]
    });
    console.log(`   Found ${cities.length} cities without stateId/countryId`);
    
    let citiesUpdated = 0;
    for (const city of cities) {
      const state = await State.findOne({ 
        $or: [
          { key: city.state?.toLowerCase() },
          { value: { $regex: new RegExp(`^${city.state}$`, 'i') } }
        ]
      });
      
      const country = await Country.findOne({ 
        $or: [
          { key: city.country?.toLowerCase() },
          { value: { $regex: new RegExp(`^${city.country}$`, 'i') } }
        ]
      });
      
      if (state && country) {
        await City.updateOne(
          { _id: city._id },
          { 
            $set: { 
              stateId: state._id,
              countryId: country._id 
            } 
          }
        );
        citiesUpdated++;
        console.log(`   ✓ ${city.value} → state: ${state.value}, country: ${country.value}`);
      } else {
        if (!state) console.log(`   ✗ ${city.value} → state "${city.state}" not found`);
        if (!country) console.log(`   ✗ ${city.value} → country "${city.country}" not found`);
      }
    }
    console.log(`   ✅ Updated ${citiesUpdated}/${cities.length} cities\n`);

    // Step 3: Verify migration
    console.log('📊 Verification:');
    const totalStates = await State.countDocuments();
    const statesWithId = await State.countDocuments({ countryId: { $exists: true } });
    console.log(`   States: ${statesWithId}/${totalStates} have countryId`);
    
    const totalCities = await City.countDocuments();
    const citiesWithStateId = await City.countDocuments({ stateId: { $exists: true } });
    const citiesWithCountryId = await City.countDocuments({ countryId: { $exists: true } });
    console.log(`   Cities: ${citiesWithStateId}/${totalCities} have stateId`);
    console.log(`   Cities: ${citiesWithCountryId}/${totalCities} have countryId`);
    
    if (statesWithId === totalStates && citiesWithStateId === totalCities && citiesWithCountryId === totalCities) {
      console.log('\n✅ Migration completed successfully!');
      console.log('   All records now use ObjectId references');
      console.log('   ⚠️  You can now make countryId/stateId required in models');
    } else {
      console.log('\n⚠️  Migration partially completed - some records missing IDs');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateToObjectIds();
