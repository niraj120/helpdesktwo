const mongoose = require('mongoose');
require('dotenv').config();

// Define Role schema directly
const roleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['system', 'custom'], required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  agentCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

const Role = mongoose.model('Role', roleSchema);

const seedStudentRole = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk');
    console.log('📊 Connected to MongoDB');

    // Check if STUDENT role already exists
    const existingRole = await Role.findOne({ code: 'STUDENT' });
    
    if (existingRole) {
      console.log('✅ STUDENT role already exists');
      console.log(existingRole);
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create STUDENT role
    const studentRole = await Role.create({
      name: 'Student',
      code: 'STUDENT',
      description: 'Student user who can view and manage their own tickets',
      type: 'system',
      permissions: [],
      agentCount: 0,
      isActive: true
    });

    console.log('✅ STUDENT role created successfully:');
    console.log(studentRole);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding STUDENT role:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedStudentRole();
