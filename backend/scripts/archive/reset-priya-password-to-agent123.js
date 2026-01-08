require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function resetPriyaPassword() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find the user first
        const user = await mongoose.connection.db.collection('users').findOne({
            email: 'priya.sharma@sac.gov.in'
        });

        if (!user) {
            console.log('❌ User not found: priya.sharma@sac.gov.in');
            process.exit(1);
        }

        console.log('👤 Found User:');
        console.log(`   Name: ${user.firstName} ${user.lastName}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Current Password Set: ${user.password ? 'YES' : 'NO'}`);
        console.log('');

        // Hash the new password
        const newPassword = 'agent@123';
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Update password and reset token version
        const result = await mongoose.connection.db.collection('users').updateOne(
            { email: 'priya.sharma@sac.gov.in' },
            { 
                $set: { 
                    password: hashedPassword,
                    tokenVersion: (user.tokenVersion || 0) + 1,  // Increment to invalidate existing tokens
                    requirePasswordSetup: false  // Make sure this is false
                } 
            }
        );

        if (result.modifiedCount === 1) {
            console.log('✅ Password updated successfully!');
            console.log('📧 Email: priya.sharma@sac.gov.in');
            console.log('🔑 New Password: agent@123');
            console.log('🔄 Token version incremented to invalidate old sessions');
            console.log('');
            console.log('🎯 You can now login with these credentials');
        } else {
            console.log('❌ Failed to update password');
        }

        await mongoose.disconnect();
        console.log('✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error resetting password:', error);
        process.exit(1);
    }
}

resetPriyaPassword();