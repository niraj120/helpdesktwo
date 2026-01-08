require('dotenv').config();
const mongoose = require('mongoose');

async function debugPriyaRoleIssue() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Direct collection access to see what's really in the database
        const db = mongoose.connection.db;
        
        // Get user
        const user = await db.collection('users').findOne({
            email: 'priya.sharma@sac.gov.in'
        });

        if (!user) {
            console.log('❌ User not found');
            process.exit(1);
        }

        console.log('👤 User Data:');
        console.log(`   Name: ${user.firstName} ${user.lastName}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role ID: ${user.role}`);
        console.log('');

        // Get role directly from database
        const role = await db.collection('roles').findOne({
            _id: user.role
        });

        if (!role) {
            console.log('❌ Role not found in database!');
            process.exit(1);
        }

        console.log('🎭 Role Data:');
        console.log(`   ID: ${role._id}`);
        console.log(`   Name: ${role.name}`);
        console.log(`   Code: ${role.code}`);
        console.log(`   Permissions Array: ${!!role.permissions}`);
        console.log(`   Permissions Count: ${role.permissions ? role.permissions.length : 0}`);
        console.log('');

        if (role.permissions && role.permissions.length > 0) {
            console.log('🔐 Permission IDs in Role:');
            role.permissions.forEach((permId, index) => {
                console.log(`   ${index + 1}. ${permId}`);
            });
            console.log('');

            // Get actual permission documents
            const permissions = await db.collection('permissions').find({
                _id: { $in: role.permissions }
            }).toArray();

            console.log('📋 Permission Details:');
            console.log(`   Found: ${permissions.length} permissions`);
            permissions.forEach((perm, index) => {
                console.log(`   ${index + 1}. ${perm.code} - ${perm.name}`);
            });
            console.log('');

            // Test JWT generation with correct data
            const permissionCodes = permissions.map(p => p.code);
            
            console.log('🔑 JWT Payload Test:');
            const payload = { 
                userId: user._id, 
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                tokenVersion: user.tokenVersion || 0,
                role: {
                    _id: role._id,
                    code: role.code,
                    name: role.name,
                    permissions: permissionCodes
                }
            };

            console.log(`   User ID: ${payload.userId}`);
            console.log(`   Email: ${payload.email}`);
            console.log(`   Role Code: ${payload.role.code}`);
            console.log(`   Role Name: ${payload.role.name}`);
            console.log(`   Permissions Count: ${payload.role.permissions.length}`);
            console.log(`   Sample Permissions: ${payload.role.permissions.slice(0, 5).join(', ')}`);
            console.log('');

            console.log('✅ SUCCESS: Priya has permissions!');
            console.log('   Issue is likely in the Mongoose population.');
            console.log('   The backend JWT generation should work fine.');

        } else {
            console.log('❌ Role has no permissions assigned!');
        }

        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugPriyaRoleIssue();