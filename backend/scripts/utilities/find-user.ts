import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/User';
import { Role } from './src/models/Role';
import { Permission } from './src/models/Permission';

dotenv.config();

const findUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected\n');

    // List all users with "mathur" or similar
    const users = await User.find({
      $or: [
        { email: /mathur/i },
        { name: /mathur/i },
        { firstName: /shubhangi/i },
        { lastName: /mathur/i }
      ]
    }).lean();

    console.log('=== FOUND USERS ===');
    console.log(`Total users matching search: ${users.length}\n`);

    for (const user of users) {
      console.log(`User ID: ${user._id}`);
      console.log(`Name: ${(user as any).name || `${(user as any).firstName} ${(user as any).lastName}`}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role ID: ${user.role}`);
      
      // Get role details
      const role = await Role.findById(user.role).lean();
      if (role) {
        console.log(`Role Name: ${role.name}`);
        console.log(`Role Code: ${role.code}`);
        console.log(`Permissions Count: ${role.permissions?.length || 0}`);
        
        if (role.permissions && role.permissions.length > 0) {
          const perms = await Permission.find({
            _id: { $in: role.permissions }
          }).select('code').lean();
          console.log(`Permission Codes: ${perms.map(p => p.code).join(', ')}`);
        }
      }
      console.log('---\n');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

findUser();
