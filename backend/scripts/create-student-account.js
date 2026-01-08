const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect('mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin')
  .then(async () => {
    console.log('Connected to MongoDB\n');
    
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }), 'roles');
    
    const email = 'niraj10101996@gmail.com';
    
    // Check if user already exists
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      console.log('❌ User already exists with this email');
      process.exit(0);
    }
    
    // Find STUDENT role
    const studentRole = await Role.findOne({ code: 'STUDENT' }).lean();
    if (!studentRole) {
      console.log('❌ STUDENT role not found in database');
      process.exit(1);
    }
    
    console.log('✅ Found STUDENT role:', studentRole.name);
    
    // Get project ID (using mhtcet project)
    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    const project = await Project.findOne({ customUrlPath: 'mhtcet' }).lean();
    
    if (!project) {
      console.log('❌ Project not found');
      process.exit(1);
    }
    
    console.log('✅ Found project:', project.name);
    
    // Create student user
    const hashedPassword = await bcrypt.hash('Student@123', 10);
    
    const newUser = await User.create({
      firstName: 'Rajneesh',
      lastName: 'Kanotra',
      email: email,
      password: hashedPassword,
      roleId: studentRole._id,
      projectId: project._id,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('\n✅ Student account created successfully!');
    console.log('Email:', email);
    console.log('Password: Student@123');
    console.log('Role:', studentRole.name);
    console.log('Project:', project.name);
    console.log('\nYou can now login with these credentials.');
    
    // Update the existing ticket with projectId
    const Ticket = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false }), 'tickets');
    const result = await Ticket.updateOne(
      { 'metadata.studentEmail': email },
      { $set: { projectId: project._id } }
    );
    
    if (result.modifiedCount > 0) {
      console.log('\n✅ Updated existing ticket with projectId');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
