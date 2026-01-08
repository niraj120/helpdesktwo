import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/User';
import { Role } from './src/models/Role';

dotenv.config();

const listAllSuperAdmins = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find Super Admin role
    const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });

    if (!superAdminRole) {
      console.log('❌ Super Admin role not found!');
      process.exit(1);
    }

    console.log('\n📋 Super Admin Role ID:', superAdminRole._id);

    // Find all users with Super Admin role
    const superAdmins = await User.find({ role: superAdminRole._id })
      .select('firstName lastName email isActive createdAt')
      .lean();

    console.log(`\n👥 Found ${superAdmins.length} Super Admin user(s):\n`);

    if (superAdmins.length === 0) {
      console.log('❌ No Super Admin users found!');
    } else {
      superAdmins.forEach((admin: any, index) => {
        console.log(`${index + 1}. ${admin.firstName} ${admin.lastName}`);
        console.log(`   📧 Email: ${admin.email}`);
        console.log(`   ✅ Active: ${admin.isActive ? 'Yes' : 'No'}`);
        console.log(`   📅 Created: ${admin.createdAt}`);
        console.log('');
      });
    }

    // Also check all users to see who has admin-like emails
    const allUsers = await User.find()
      .populate('role', 'name code')
      .select('firstName lastName email role isActive')
      .lean();

    console.log(`\n📊 All Users (${allUsers.length} total):\n`);
    
    allUsers.forEach((user, index) => {
      const role = user.role as any;
      console.log(`${index + 1}. ${user.firstName} ${user.lastName}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   👤 Role: ${role?.name || 'Unknown'} (${role?.code || 'N/A'})`);
      console.log(`   ✅ Active: ${user.isActive ? 'Yes' : 'No'}`);
      console.log('');
    });

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

listAllSuperAdmins();
