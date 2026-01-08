require('dotenv').config();
const mongoose = require('mongoose');

async function checkPriyaProjects() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find Priya's user record
        const user = await mongoose.connection.db.collection('users').findOne({
            email: 'priya.sharma@sac.gov.in'
        });

        if (!user) {
            console.log('❌ User not found: priya.sharma@sac.gov.in');
            process.exit(1);
        }

        console.log('👤 User Details:');
        console.log(`   Name: ${user.firstName} ${user.lastName}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Active: ${user.isActive}`);
        console.log(`   Role ID: ${user.role}`);
        console.log(`   Projects: ${user.projects ? JSON.stringify(user.projects) : 'None'}`);
        console.log('');

        // Get role details
        if (user.role) {
            const role = await mongoose.connection.db.collection('roles').findOne({
                _id: user.role
            });
            if (role) {
                console.log('🎭 Role Details:');
                console.log(`   Name: ${role.name}`);
                console.log(`   Code: ${role.code}`);
                console.log('');
            }
        }

        // Get project details if any
        if (user.projects && user.projects.length > 0) {
            console.log('📁 Assigned Projects:');
            for (const projectId of user.projects) {
                const project = await mongoose.connection.db.collection('projects').findOne({
                    _id: projectId
                });
                if (project) {
                    console.log(`   - ${project.name} (${project.code})`);
                    if (project.branding && project.branding.customUrlPath) {
                        console.log(`     URL: /${project.branding.customUrlPath}`);
                    }
                }
            }
            console.log('');
        } else {
            console.log('⚠️  No projects assigned to this user');
            console.log('');

            // List available projects
            const projects = await mongoose.connection.db.collection('projects').find({
                isActive: true,
                status: 'active'
            }).toArray();
            
            console.log('📋 Available Projects:');
            for (const project of projects) {
                console.log(`   - ${project.name} (${project.code}) - ID: ${project._id}`);
                if (project.branding && project.branding.customUrlPath) {
                    console.log(`     URL: /${project.branding.customUrlPath}`);
                }
            }
        }

        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error checking user projects:', error);
        process.exit(1);
    }
}

checkPriyaProjects();