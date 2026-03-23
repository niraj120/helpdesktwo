/**
 * Migration: Add conditionAction, requiredMode, and id fields to existing
 * onlineFormFields in all projects.
 *
 * This is a NON-DESTRUCTIVE, idempotent migration:
 * - Fields that already have the new properties are left untouched.
 * - `required: true` fields get `requiredMode: 'always'`.
 * - All fields get `conditionAction: 'show'` (default — show unless a rule hides).
 * - Fields missing an `id` get one generated from their fieldName + index.
 *
 * Usage:
 *   node backend/scripts/migrate-form-fields.js
 *
 * Or from the backend/ directory:
 *   node scripts/migrate-form-fields.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌  MONGODB_URI or MONGO_URI environment variable is not set.');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅  Connected to MongoDB');

  const db = mongoose.connection.db;
  const collection = db.collection('projects');

  const projects = await collection
    .find({ 'configuration.ticketSubmissionSettings.onlineFormFields': { $exists: true, $not: { $size: 0 } } })
    .toArray();

  console.log(`🔍  Found ${projects.length} project(s) with onlineFormFields`);

  let totalUpdated = 0;
  let totalFieldsPatched = 0;

  for (const project of projects) {
    const fields = project?.configuration?.ticketSubmissionSettings?.onlineFormFields;
    if (!Array.isArray(fields) || fields.length === 0) continue;

    let changed = false;
    const patched = fields.map((field, idx) => {
      const updates = {};

      // Ensure every field has a stable id
      if (!field.id) {
        updates.id = `${field.fieldName}-${idx}`;
      }

      // Set conditionAction default if missing
      if (field.conditionAction === undefined) {
        updates.conditionAction = 'show';
      }

      // Migrate required → requiredMode
      if (field.requiredMode === undefined) {
        updates.requiredMode = field.required === true ? 'always' : 'optional';
      }

      if (Object.keys(updates).length > 0) {
        changed = true;
        totalFieldsPatched++;
        return { ...field, ...updates };
      }
      return field;
    });

    if (changed) {
      await collection.updateOne(
        { _id: project._id },
        { $set: { 'configuration.ticketSubmissionSettings.onlineFormFields': patched } },
      );
      totalUpdated++;
      console.log(`  ✔  Patched project: ${project.name || project._id} (${fields.length} field(s))`);
    }
  }

  console.log(`\n📊  Migration complete:`);
  console.log(`    Projects updated : ${totalUpdated}`);
  console.log(`    Fields patched   : ${totalFieldsPatched}`);

  await mongoose.disconnect();
  console.log('🔌  Disconnected');
}

run().catch((err) => {
  console.error('❌  Migration failed:', err);
  process.exit(1);
});
