import { User } from '../models/User';
import { Role } from '../models/Role';
import bcrypt from 'bcryptjs';

export const initializeDatabase = async () => {
  try {
    console.log('🔧 Checking database initialization...');

    // Check if admin user exists
    const adminExists = await User.findOne({ email: 'admin@sac.com' });
    
    if (!adminExists) {
      console.log('👤 Creating default admin user...');
      
      // Get SuperAdmin role
      const superAdminRole = await Role.findOne({ code: 'SUPER_ADMIN' });
      
      if (!superAdminRole) {
        console.error('❌ SuperAdmin role not found. Please run seedRolesAndPermissions first.');
        return;
      }

      const hashedPassword = await bcrypt.hash('Admin@123', 10);
      
      await User.create({
        firstName: 'Super',
        lastName: 'Admin',
        email: 'admin@sac.com',
        password: hashedPassword,
        role: superAdminRole._id,
        isActive: true,
        isEmailVerified: true,
      });

      console.log('✅ Default admin user created');
      console.log('📧 Email: admin@sac.com');
      console.log('🔑 Default admin password created (not logged for security).');
    } else {
      console.log('✅ Admin user already exists');
    }

    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};
