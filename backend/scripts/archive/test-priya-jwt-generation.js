require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

async function testPriyaJWTGeneration() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Simulate the exact same query as authController.ts
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, strictPopulate: false }));
        
        const user = await User.findOne({ 
            email: 'priya.sharma@sac.gov.in', 
            isActive: true 
        }).populate({
            path: 'role',
            populate: {
                path: 'permissions'
            }
        });

        if (!user) {
            console.log('❌ User not found: priya.sharma@sac.gov.in');
            process.exit(1);
        }

        console.log('👤 User Found:');
        console.log(`   Name: ${user.firstName} ${user.lastName}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Active: ${user.isActive}`);
        console.log(`   Role Populated: ${!!user.role}`);
        console.log('');

        if (user.role) {
            console.log('🎭 Role Details:');
            console.log(`   ID: ${user.role._id}`);
            console.log(`   Name: ${user.role.name}`);
            console.log(`   Code: ${user.role.code}`);
            console.log(`   Permissions Array: ${!!user.role.permissions}`);
            console.log(`   Permissions Count: ${user.role.permissions ? user.role.permissions.length : 0}`);
            console.log('');

            if (user.role.permissions && user.role.permissions.length > 0) {
                console.log('🔐 First 5 Permissions:');
                user.role.permissions.slice(0, 5).forEach((perm, index) => {
                    console.log(`   ${index + 1}. ${perm.code} - ${perm.name}`);
                });
                console.log('');

                // Test JWT generation (same as authController.ts)
                const permissions = user.role.permissions || [];
                const permissionCodes = permissions.map(p => p.code || p);
                
                console.log('🔑 Permission Codes for JWT:');
                console.log(`   Total: ${permissionCodes.length}`);
                console.log(`   Sample: ${permissionCodes.slice(0, 5).join(', ')}`);
                console.log('');

                // Generate JWT token (same payload as authController.ts)
                const payload = { 
                    userId: user._id, 
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    tokenVersion: user.tokenVersion || 0,
                    role: {
                        _id: user.role._id,
                        code: user.role.code,
                        name: user.role.name,
                        permissions: permissionCodes
                    }
                };

                const secret = process.env.JWT_SECRET || 'fallback-secret-key-for-development';
                const token = jwt.sign(payload, secret, { expiresIn: '7d' });

                console.log('🎫 JWT Token Generated:');
                console.log(`   Size: ${token.length} characters`);
                console.log(`   First 50 chars: ${token.substring(0, 50)}...`);
                console.log('');

                // Verify and decode the token
                try {
                    const decoded = jwt.verify(token, secret);
                    console.log('✅ JWT Token Verification:');
                    console.log(`   Valid: YES`);
                    console.log(`   User ID: ${decoded.userId}`);
                    console.log(`   Email: ${decoded.email}`);
                    console.log(`   Role Code: ${decoded.role.code}`);
                    console.log(`   Permissions in Token: ${decoded.role.permissions.length}`);
                    console.log(`   Sample Permissions: ${decoded.role.permissions.slice(0, 3).join(', ')}`);
                    console.log('');

                    // Test specific permission checks
                    const hasTicketView = decoded.role.permissions.includes('TICKET_VIEW_OWN');
                    const hasOfflineAccess = decoded.role.permissions.includes('OFFLINE_MODULE_ACCESS');
                    const hasTicketCreate = decoded.role.permissions.includes('TICKET_CREATE');
                    
                    console.log('🧪 Permission Tests:');
                    console.log(`   TICKET_VIEW_OWN: ${hasTicketView ? '✅' : '❌'}`);
                    console.log(`   OFFLINE_MODULE_ACCESS: ${hasOfflineAccess ? '✅' : '❌'}`);
                    console.log(`   TICKET_CREATE: ${hasTicketCreate ? '✅' : '❌'}`);
                    console.log('');

                    if (hasTicketView || hasOfflineAccess || hasTicketCreate) {
                        console.log('🎉 SUCCESS: Priya has working permissions in JWT token!');
                        console.log('   The JWT system is working correctly.');
                        console.log('   If frontend is not showing permissions, the issue is frontend-side.');
                    } else {
                        console.log('⚠️  WARNING: No expected permissions found in JWT token.');
                    }

                } catch (verifyError) {
                    console.log('❌ JWT Token Verification Failed:', verifyError.message);
                }

            } else {
                console.log('❌ No permissions found in role!');
                console.log('   Issue: Role has no permissions assigned.');
            }
        } else {
            console.log('❌ No role found for user!');
        }

        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error testing JWT generation:', error);
        process.exit(1);
    }
}

testPriyaJWTGeneration();