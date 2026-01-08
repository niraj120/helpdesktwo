require('dotenv').config();
const mongoose = require('mongoose');

async function checkPriyaPermissions() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find Priya's user record with populated role and permissions
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
        let role = null;
        if (user.role) {
            role = await mongoose.connection.db.collection('roles').findOne({
                _id: user.role
            });
        }

        if (!role) {
            console.log('❌ Role not found for this user');
            process.exit(1);
        }

        console.log('🎭 Role Details:');
        console.log(`   Name: ${role.name}`);
        console.log(`   Code: ${role.code}`);
        console.log(`   Permission Count: ${role.permissions ? role.permissions.length : 0}`);
        console.log('');

        // Get permissions if role has any
        if (role.permissions && role.permissions.length > 0) {
            const permissions = await mongoose.connection.db.collection('permissions').find({
                _id: { $in: role.permissions }
            }).toArray();

            console.log('🔐 PERMISSIONS (' + permissions.length + '):');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            // Group permissions by category
            const grouped = {};
            permissions.forEach(p => {
                const category = p.category || 'uncategorized';
                if (!grouped[category]) {
                    grouped[category] = [];
                }
                grouped[category].push(p);
            });

            for (const [category, perms] of Object.entries(grouped)) {
                console.log(`\n📋 ${category.toUpperCase()}:`);
                perms.forEach(p => {
                    console.log(`   ✅ ${p.code.padEnd(30)} - ${p.name}`);
                });
            }

            console.log('\n📝 Permission Codes for Frontend:');
            console.log('[' + permissions.map(p => `"${p.code}"`).join(', ') + ']');
            console.log('');

            // Check which modules should be visible
            console.log('🔍 Frontend Module Access Analysis:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            const moduleChecks = {
                'Dashboard': permissions.some(p => p.code.startsWith('DASHBOARD_')),
                'Users': permissions.some(p => p.code.startsWith('USER_')),
                'Projects': permissions.some(p => p.code.startsWith('PROJECT_')),
                'Tickets': permissions.some(p => p.code.startsWith('TICKET_')),
                'Knowledge Base': permissions.some(p => p.code.startsWith('KB_') || p.code.startsWith('KNOWLEDGE_')),
                'Reports': permissions.some(p => p.code.startsWith('REPORT_')),
                'RBAC': permissions.some(p => p.code.startsWith('RBAC_')),
                'Settings': permissions.some(p => p.code.includes('SETTINGS')),
                'Master Data': permissions.some(p => p.code.startsWith('MASTER_'))
            };

            for (const [module, hasAccess] of Object.entries(moduleChecks)) {
                console.log(`   ${hasAccess ? '✅' : '❌'} ${module.padEnd(15)} - ${hasAccess ? 'ACCESSIBLE' : 'NO ACCESS'}`);
            }

        } else {
            console.log('❌ NO PERMISSIONS FOUND');
            console.log('   This user has no permissions assigned through their role.');
        }

        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error checking permissions:', error);
        process.exit(1);
    }
}

checkPriyaPermissions();