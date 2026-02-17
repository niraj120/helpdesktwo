const mongoose = require('mongoose');
require('dotenv').config();

async function fixTicketDeadline() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    const ticket = await db.collection('tickets').findOne({ticketNumber: 'HSTR-2026-02-0005'});
    if (!ticket) {
      console.log('❌ Ticket not found');
      return;
    }

    const sla = await db.collection('slatrackings').findOne({ticketId: ticket._id});
    if (!sla) {
      console.log('❌ SLA tracking not found');
      return;
    }

    console.log('\n🔍 Debugging - Ticket keys:', Object.keys(ticket));
    console.log('🔍 Debugging - SLA keys:', Object.keys(sla));
    console.log('🔍 Debugging - SLA escalationHistory:', sla.escalationHistory?.length || 0);
    
    const policy = await db.collection('escalationpolicies').findOne({_id: sla.escalationPolicyId});
    if (!policy) {
      console.log('❌ Escalation policy not found');
      return;
    }

    console.log('\n🎫 Ticket:', ticket.ticketNumber);
    console.log('📊 Current SLA Level:', sla.currentEscalationLevel);
    console.log('📅 Current Resolution Deadline:', new Date(sla.resolutionDeadline).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}));
    console.log('📜 SLA Escalation History Length:', sla.escalationHistory?.length || 0);

    if (sla.escalationHistory && sla.escalationHistory.length > 0) {
      const lastEscalation = sla.escalationHistory[sla.escalationHistory.length - 1];
      const escalatedAt = new Date(lastEscalation.escalatedAt);
      // When currentEscalationLevel is 1 (L2), we need Level 2 config (next escalation)
      const levelConfig = policy.levels.find(l => l.level === sla.currentEscalationLevel + 1);
      
      console.log('\n🔍 Policy Levels:', policy.levels.map(l => ({ level: l.level, time: `${l.escalateAfter.value} ${l.escalateAfter.unit}` })));
      console.log('🔍 Current Level:', sla.currentEscalationLevel, '(L' + (sla.currentEscalationLevel + 1) + ')');
      console.log('🔍 Looking for level config:', sla.currentEscalationLevel + 1);
      console.log('🔍 Found level config:', levelConfig);
      
      if (!levelConfig) {
        console.log('❌ Level config not found');
        return;
      }

      console.log('\n🔧 Recalculating based on:');
      console.log('   Last escalation at:', escalatedAt.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}));
      console.log('   Level', sla.currentEscalationLevel, 'SLA:', levelConfig.escalateAfter.value, levelConfig.escalateAfter.unit);

      let minutes = 0;
      switch (levelConfig.escalateAfter.unit) {
        case 'minutes':
          minutes = levelConfig.escalateAfter.value;
          break;
        case 'hours':
          minutes = levelConfig.escalateAfter.value * 60;
          break;
        case 'days':
          minutes = levelConfig.escalateAfter.value * 24 * 60;
          break;
      }

      const correctDeadline = new Date(escalatedAt.getTime() + minutes * 60 * 1000);
      console.log('\n✅ Correct deadline should be:', correctDeadline.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}));

      const oldDeadline = new Date(sla.resolutionDeadline);
      const diff = Math.abs(correctDeadline.getTime() - oldDeadline.getTime());
      const diffHours = Math.floor(diff / (1000 * 60 * 60));
      const diffMins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (diff > 60000) { // More than 1 minute difference
        console.log(`\n⚠️  Difference: ${diffHours}h ${diffMins}m - UPDATING...`);
        
        await db.collection('slatrackings').updateOne(
          { _id: sla._id },
          { 
            $set: { 
              resolutionDeadline: correctDeadline,
              nextEscalationDue: correctDeadline
            } 
          }
        );
        
        console.log('✅ SLA tracking updated successfully!');
      } else {
        console.log('\n✅ Deadline is already correct (within 1 minute tolerance)');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

fixTicketDeadline();
