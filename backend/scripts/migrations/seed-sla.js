const mongoose = require('mongoose');

// Define schemas directly
const SLARuleSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    priority: {
      type: String,
      enum: ['Critical', 'Urgent', 'High', 'Normal', 'Low'],
    },
    responseTime: {
      value: Number,
      unit: String,
    },
    resolutionTime: {
      value: Number,
      unit: String,
    },
    isActive: Boolean,
    projectIds: [mongoose.Schema.Types.ObjectId],
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: true }
);

const EscalationPolicySchema = new mongoose.Schema(
  {
    policyId: String,
    name: String,
    description: String,
    levels: [{
      level: Number,
      escalateAfter: {
        value: Number,
        unit: String,
      },
      escalateTo: {
        type: { type: String },
        targetId: String,
        targetName: String,
      },
      notifyMethod: [String],
      emailTemplate: String,
      actions: {
        changePriority: String,
        addWatchers: [String],
        changeStatus: String,
      },
    }],
    isActive: Boolean,
    projectId: mongoose.Schema.Types.ObjectId,
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: true }
);

const SLARule = mongoose.model('SLARule', SLARuleSchema);
const EscalationPolicy = mongoose.model('EscalationPolicy', EscalationPolicySchema);

async function seedSLAData() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('Connected to MongoDB');

    // Clear existing data
    await SLARule.deleteMany({});
    await EscalationPolicy.deleteMany({});
    console.log('Cleared existing SLA data');

    // Seed SLA Rules
    const slaRules = [
      {
        name: 'Critical Priority SLA',
        description: 'SLA rule for critical priority tickets requiring immediate attention',
        priority: 'Critical',
        responseTime: { value: 15, unit: 'minutes' },
        resolutionTime: { value: 2, unit: 'hours' },
        isActive: true,
      },
      {
        name: 'Urgent Priority SLA',
        description: 'SLA rule for urgent priority tickets',
        priority: 'Urgent',
        responseTime: { value: 30, unit: 'minutes' },
        resolutionTime: { value: 4, unit: 'hours' },
        isActive: true,
      },
      {
        name: 'High Priority SLA',
        description: 'SLA rule for high priority tickets',
        priority: 'High',
        responseTime: { value: 2, unit: 'hours' },
        resolutionTime: { value: 8, unit: 'hours' },
        isActive: true,
      },
      {
        name: 'Normal Priority SLA',
        description: 'SLA rule for normal priority tickets',
        priority: 'Normal',
        responseTime: { value: 4, unit: 'hours' },
        resolutionTime: { value: 1, unit: 'days' },
        isActive: true,
      },
      {
        name: 'Low Priority SLA',
        description: 'SLA rule for low priority tickets',
        priority: 'Low',
        responseTime: { value: 8, unit: 'hours' },
        resolutionTime: { value: 3, unit: 'days' },
        isActive: true,
      },
    ];

    const createdRules = await SLARule.insertMany(slaRules);
    console.log(`Created ${createdRules.length} SLA rules`);

    // Seed Escalation Policies
    const escalationPolicies = [
      {
        policyId: 'ESC0001',
        name: 'Standard Escalation Matrix',
        description: 'Default escalation policy for all tickets',
        levels: [
          {
            level: 1,
            escalateAfter: { value: 2, unit: 'hours' },
            escalateTo: {
              type: 'role',
              targetId: 'team-lead',
              targetName: 'Team Lead',
            },
            notifyMethod: ['email', 'push'],
            emailTemplate: 'escalation_level_1',
          },
          {
            level: 2,
            escalateAfter: { value: 4, unit: 'hours' },
            escalateTo: {
              type: 'role',
              targetId: 'manager',
              targetName: 'Manager',
            },
            notifyMethod: ['email', 'sms', 'push'],
            emailTemplate: 'escalation_level_2',
            actions: {
              changePriority: 'High',
            },
          },
          {
            level: 3,
            escalateAfter: { value: 8, unit: 'hours' },
            escalateTo: {
              type: 'role',
              targetId: 'director',
              targetName: 'Director',
            },
            notifyMethod: ['email', 'sms', 'push'],
            emailTemplate: 'escalation_level_3',
            actions: {
              changePriority: 'Urgent',
            },
          },
        ],
        isActive: true,
      },
      {
        policyId: 'ESC0002',
        name: 'Critical Issue Escalation',
        description: 'Fast-track escalation for critical issues',
        levels: [
          {
            level: 1,
            escalateAfter: { value: 30, unit: 'minutes' },
            escalateTo: {
              type: 'role',
              targetId: 'senior-engineer',
              targetName: 'Senior Engineer',
            },
            notifyMethod: ['email', 'sms', 'push'],
            emailTemplate: 'critical_escalation_1',
          },
          {
            level: 2,
            escalateAfter: { value: 1, unit: 'hours' },
            escalateTo: {
              type: 'role',
              targetId: 'technical-lead',
              targetName: 'Technical Lead',
            },
            notifyMethod: ['email', 'sms', 'push'],
            emailTemplate: 'critical_escalation_2',
            actions: {
              changePriority: 'Critical',
            },
          },
        ],
        isActive: true,
      },
      {
        policyId: 'ESC0003',
        name: 'VIP Customer Escalation',
        description: 'Specialized escalation for VIP customers',
        levels: [
          {
            level: 1,
            escalateAfter: { value: 1, unit: 'hours' },
            escalateTo: {
              type: 'role',
              targetId: 'account-manager',
              targetName: 'Account Manager',
            },
            notifyMethod: ['email', 'sms', 'push'],
            emailTemplate: 'vip_escalation_1',
          },
          {
            level: 2,
            escalateAfter: { value: 3, unit: 'hours' },
            escalateTo: {
              type: 'role',
              targetId: 'senior-account-manager',
              targetName: 'Senior Account Manager',
            },
            notifyMethod: ['email', 'sms', 'push'],
            emailTemplate: 'vip_escalation_2',
          },
        ],
        isActive: true,
      },
    ];

    const createdPolicies = await EscalationPolicy.insertMany(escalationPolicies);
    console.log(`Created ${createdPolicies.length} escalation policies`);

    console.log('\n✅ SLA data seeded successfully!');
    console.log('\nSummary:');
    console.log(`  - SLA Rules: ${createdRules.length}`);
    console.log(`  - Escalation Policies: ${createdPolicies.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding SLA data:', error);
    process.exit(1);
  }
}

seedSLAData();
