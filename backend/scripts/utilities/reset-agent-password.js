const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function resetAgentPassword() {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const result = await mongoose.connection.db.collection('users').updateOne(
        { email: 'priya.sharma@sac.gov.in' },
        { 
            $set: { 
                password: hashedPassword,
                tokenVersion: 0  // Reset token version to force new login
            } 
        }
    );
    
    console.log('✅ Password reset for priya.sharma@sac.gov.in');
    console.log('📝 New password: password123');
    console.log('🔄 Token version reset to force fresh login');
    
    mongoose.disconnect();
}

resetAgentPassword().catch(console.error);