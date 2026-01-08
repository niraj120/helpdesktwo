const mongoose = require('mongoose');
require('dotenv').config();

// Since this is a TypeScript project, we need to use the compiled models
// or query directly
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    try {
      // Query directly using mongoose
      const db = mongoose.connection.db;
      
      // Get the Student assist center project
      const project = await db.collection('projects').findOne({ code: 'studentassistcenters' });
      
      if (!project) {
        console.log('❌ Project "Student assist center" not found');
        process.exit(1);
      }

      console.log('\n📋 Project Details:');
      console.log('- Name:', project.name);
      console.log('- Code:', project.code);
      console.log('- ID:', project._id.toString());

      // Get all active users
      const users = await db.collection('users').find({ isActive: true }).toArray();
      console.log('\n👥 All Active Users:', users.length);

      // Get all roles
      const roles = await db.collection('roles').find({}).toArray();
      const roleMap = {};
      roles.forEach(r => {
        roleMap[r._id.toString()] = r;
      });

      console.log('\n🎯 Users with isAgent=true roles:');
      
      const agents = [];
      for (const user of users) {
        const role = roleMap[user.role?.toString()];
        if (role && role.isAgent === true) {
          agents.push({ user, role });
          
          const projectNames = user.projects ? 
            user.projects.map(pid => {
              const p = project._id.toString() === pid.toString() ? project : null;
              return p ? p.name : pid.toString();
            }).join(', ') : 'None';
          
          const isInProject = user.projects && user.projects.some(p => p.toString() === project._id.toString());
          
          console.log(`\n  - ${user.firstName} ${user.lastName}`);
          console.log(`    Email: ${user.email}`);
          console.log(`    Role: ${role.name} (${role.code})`);
          console.log(`    isAgent: ${role.isAgent}`);
          console.log(`    Projects: ${projectNames}`);
          console.log(`    Project IDs: ${user.projects ? user.projects.map(p => p.toString()).join(', ') : 'None'}`);
          console.log(`    In "Student assist center": ${isInProject ? '✅' : '❌'}`);
        }
      }

      const agentsInProject = agents.filter(a => 
        a.user.projects && a.user.projects.some(p => p.toString() === project._id.toString())
      );

      console.log('\n📊 Summary:');
      console.log('- Total active users:', users.length);
      console.log('- Users with isAgent roles:', agents.length);
      console.log('- Agents assigned to "Student assist center":', agentsInProject.length);

      if (agentsInProject.length === 0) {
        console.log('\n⚠️  WARNING: No agents are assigned to the "Student assist center" project!');
        console.log('   You need to:');
        console.log('   1. Create a role with isAgent=true (e.g., "Counselor")');
        console.log('   2. Assign users to that role');
        console.log('   3. Assign those users to the "Student assist center" project in User Management');
      } else {
        console.log('\n✅ Agents available for assignment:');
        agentsInProject.forEach(a => {
          console.log(`   - ${a.user.firstName} ${a.user.lastName} (${a.role.name})`);
        });
      }

    } catch (error) {
      console.error('❌ Error:', error);
    } finally {
      await mongoose.connection.close();
      console.log('\n✅ Connection closed');
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
