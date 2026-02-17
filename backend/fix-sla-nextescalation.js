/**
 * Fix nextEscalationDue for existing escalated tickets
 * 
 * Issue: nextEscalationDue was calculated using wrong level's escalateAfter time
 * Fix: Set nextEscalationDue = resolutionDeadline (when current level expires)
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function fixSlaTracking() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk');
    console.log('✅ Connected to MongoDB');

    const SLATracking = mongoose.connection.collection('slatrackings');

    // Find all SLA tracking records with escalation level > 0 and nextEscalationDue set
    const trackers = await SLATracking.find({
      currentEscalationLevel: { $gt: 0 },
      nextEscalationDue: { $exists: true, $ne: null },
      resolutionDeadline: { $exists: true }
    }).toArray();

    console.log(`📊 Found ${trackers.length} escalated tickets with nextEscalationDue set`);

    let updated = 0;
    let skipped = 0;

    for (const tracker of trackers) {
      const resolutionTime = new Date(tracker.resolutionDeadline).getTime();
      const nextEscTime = new Date(tracker.nextEscalationDue).getTime();
      
      // If they're different by more than 1 second, update
      if (Math.abs(resolutionTime - nextEscTime) > 1000) {
        console.log(`\n🔧 Updating ticket ${tracker.ticketId}:`);
        console.log(`   Old nextEscalationDue: ${tracker.nextEscalationDue}`);
        console.log(`   New nextEscalationDue: ${tracker.resolutionDeadline}`);
        console.log(`   Difference: ${Math.round((nextEscTime - resolutionTime) / (1000 * 60))} minutes`);

        await SLATracking.updateOne(
          { _id: tracker._id },
          { $set: { nextEscalationDue: tracker.resolutionDeadline } }
        );
        updated++;
      } else {
        skipped++;
      }
    }

    console.log(`\n✅ Update complete:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped (already correct): ${skipped}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

fixSlaTracking();
