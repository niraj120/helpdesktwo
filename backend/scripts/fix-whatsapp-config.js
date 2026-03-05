const mongoose = require('mongoose');

// MongoDB connection string
const MONGO_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

// Correct WhatsApp API configuration
const CORRECT_API_BASE_URL = 'https://crmapi.wa0.in/api/meta/v19.0';
const DEFAULT_NUMBER_ID = '952415067947914';

async function fixWhatsAppConfig() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const WhatsAppConfig = mongoose.model(
      'WhatsAppConfig',
      new mongoose.Schema({}, { strict: false }),
      'whatsappconfigs'
    );
    const Project = mongoose.model(
      'Project',
      new mongoose.Schema({}, { strict: false }),
      'projects'
    );

    const projects = await Project.find({});
    console.log(`📋 Found ${projects.length} project(s)\n`);

    for (const project of projects) {
      console.log(`\n🔧 Project: ${project.name} (${project._id})`);

      let waConfig = await WhatsAppConfig.findOne({ projectId: project._id });

      if (!waConfig) {
        console.log('   ℹ️  No WhatsApp config found — skipping');
        continue;
      }

      const oldApiBaseUrl = waConfig.apiBaseUrl;
      console.log(`   Current apiBaseUrl: ${oldApiBaseUrl || '(empty)'}`);

      // Build update: fix apiBaseUrl + fill in empty numberIds on all triggers
      const triggers = waConfig.triggers || {};
      const triggerKeys = Object.keys(triggers);

      const updateObj = {
        apiBaseUrl: CORRECT_API_BASE_URL,
      };

      let updatedTriggerCount = 0;

      for (const key of triggerKeys) {
        const trigger = triggers[key];
        if (trigger && !trigger.numberId) {
          updateObj[`triggers.${key}.numberId`] = DEFAULT_NUMBER_ID;
          updatedTriggerCount++;
        }
      }

      await WhatsAppConfig.updateOne({ projectId: project._id }, { $set: updateObj });

      console.log(`   ✅ apiBaseUrl → ${CORRECT_API_BASE_URL}`);
      if (updatedTriggerCount > 0) {
        console.log(`   ✅ Set numberId="${DEFAULT_NUMBER_ID}" on ${updatedTriggerCount} trigger(s) that had empty numberId`);
      } else {
        console.log(`   ℹ️  All triggers already have numberId set — left as-is`);
      }

      // Show final state of first few triggers
      const updated = await WhatsAppConfig.findOne({ projectId: project._id });
      const updatedTriggers = updated.triggers || {};
      const sampleKeys = Object.keys(updatedTriggers).slice(0, 5);
      console.log('\n   Trigger snapshot (first 5):');
      for (const k of sampleKeys) {
        const t = updatedTriggers[k];
        console.log(`     ${k}: numberId=${t?.numberId || '(empty)'}, enabled=${t?.enabled}`);
      }
    }

    console.log('\n\n✅ Done. Restart the backend server to pick up changes.');
    console.log(`\n   Test URL that will be called:`);
    console.log(`   ${CORRECT_API_BASE_URL}/${DEFAULT_NUMBER_ID}/messages`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

fixWhatsAppConfig();
