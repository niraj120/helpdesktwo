const mongoose = require('mongoose');
const { Project } = require('./dist/models/Project');
const { User } = require('./dist/models/User');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sac_helpdesk';

async function createProject() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Check if project already exists
    let project = await Project.findOne({ code: 'SAC' });

    if (project) {
      console.log('✅ Project already exists:', project.name);
      console.log('   ID:', project._id);
      console.log('   Custom URL Path:', project.branding?.customUrlPath);
      console.log('   Status:', project.status, '| Active:', project.isActive);
      
      // Update if needed
      if (project.branding?.customUrlPath !== 'studentassistcenters' || !project.isActive || project.status !== 'active') {
        project.branding = project.branding || {};
        project.branding.customUrlPath = 'studentassistcenters';
        project.branding.domainUrl = 'studentassistcenters.com';
        project.isActive = true;
        project.status = 'active';
        await project.save();
        console.log('✅ Updated project settings');
      }
    } else {
      // Create new project
      project = await Project.create({
        name: 'Student Assist Centers',
        code: 'SAC',
        description: 'Student assistance helpdesk system',
        isActive: true,
        status: 'active',
        branding: {
          customUrlPath: 'studentassistcenters',
          domainUrl: 'studentassistcenters.com',
          logo: null,
          headerText: 'Student Assist Centers',
          footerText: '© 2025 Student Assist Centers',
          colorTheme: {
            primary: '#7c3aed',
            secondary: '#1f2937',
            accent: '#3b82f6',
            background: '#ffffff'
          }
        },
        settings: {
          defaultLanguage: 'en',
          timezone: 'Asia/Kolkata',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: '12h'
        }
      });

      console.log('✅ Created new project:', project.name);
      console.log('   ID:', project._id);
      console.log('   Custom URL Path:', project.branding.customUrlPath);
    }

    // Find or create a test user
    let testUser = await User.findOne({ email: 'test@studentassistcenters.com' });

    if (!testUser) {
      // Find admin role
      const roleModule = require('./dist/models/Role');
      const Role = roleModule.default || roleModule.Role;
      const adminRole = await Role.findOne({ code: 'ADMIN' });

      if (!adminRole) {
        console.log('⚠️  Admin role not found. Please run seed roles first.');
        process.exit(1);
      }

      const hashedPassword = await bcrypt.hash('password123', 12);

      testUser = await User.create({
        email: 'test@studentassistcenters.com',
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        role: adminRole._id,
        projects: [project._id],
        isActive: true,
        status: 'active'
      });

      console.log('✅ Created test user:');
      console.log('   Email:', testUser.email);
      console.log('   Password: password123');
    } else {
      console.log('✅ Test user already exists:', testUser.email);
      
      // Ensure user is assigned to project
      if (!testUser.projects.some(p => p.toString() === project._id.toString())) {
        testUser.projects.push(project._id);
        await testUser.save();
        console.log('   ✅ Added project to user');
      }
    }

    console.log('\n📋 Login credentials:');
    console.log('   URL: http://localhost:3003/api/auth/project/studentassistcenters/login');
    console.log('   Email:', testUser.email);
    console.log('   Password: password123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createProject();
