// Script to link SLA rules to escalation policies and check escalation policy details
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

const SLARuleSchema = new mongoose.Schema({
  name: String,
  priority: String,
  projectIds: [{ type: mongoose.Schema.Types.ObjectId }],
  escalationPolicyId: { type: mongoose.Schema.Types.ObjectId },
  isActive: Boolean
}, { timestamps: true });

const EscalationPolicySchema = new mongoose.Schema({
  name: String,
  levels: [{
    level: Number,
    escalationMode: String,
    escalateAfter: {
      value: Number,
      unit: String
    },
    escalateTo: {
      type: String,
      targetId: mongoose.Schema.Types.ObjectId,
      targetName: String
    }
  }]
}, { timestamps: true });

const RoleSchema = new mongoose.Schema({
  name: String,
  code: String
}, { timestamps: true });

const SLARule = mongoose.model('SLARule', SLARuleSchema, 'slarules');
const EscalationPolicy = mongoose.model('EscalationPolicy', EscalationPolicySchema, 'escalationpolicies');
const Role = mongoose.model('Role', RoleSchema, 'roles');

async function linkAndCheck() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get the hubblestar escalation policy
    const hubblestarPolicy = await EscalationPolicy.findOne({ name: 'hubblestar' });
    
    if (!hubblestarPolicy) {
      console.log('❌ hubblestar escalation policy not found');
      return;
    }

    console.log(`📋 Escalation Policy: ${hubblestarPolicy.name}\n`);
    console.log('Levels:');
    if (hubblestarPolicy.levels) {
      for (const level of hubblestarPolicy.levels) {
        console.log(`  L${level.level}: ${level.escalateAfter.value} ${level.escalateAfter.unit} → ${level.escalateTo?.targetName || 'Unknown'} (Mode: ${level.escalationMode})`);
        
        // Check if target is a role
        if (level.escalateTo?.type === 'role' && level.escalateTo?.targetId) {
          const role = await Role.findById(level.escalateTo.targetId);
          if (role) {
            console.log(`       Role: ${role.name} (${role.code})`);
          }
        }
      }
    }
    console.log('');

    // Link this policy to all active SLA rules
    const slaRules = await SLARule.find({ isActive: true, escalationPolicyId: null });
    
    console.log(`\n📝 Linking escalation policy to ${slaRules.length} SLA rules...\n`);
    
    for (const rule of slaRules) {
      rule.escalationPolicyId = hubblestarPolicy._id;
      await rule.save();
      console.log(`  ✅ Linked to: ${rule.name}`);
    }

    console.log('\n✅ All SLA rules now have escalation policy linked!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

linkAndCheck();
