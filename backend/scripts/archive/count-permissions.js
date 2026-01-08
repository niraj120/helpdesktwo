require('dotenv').config();
const mongoose = require('mongoose');

async function countPermissions() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Count permissions directly from database
        const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
        const count = await Permission.countDocuments();
        
        console.log(`🔢 Total Permissions in RBAC System: ${count}`);
        
        // Get all permissions to see them
        const permissions = await Permission.find({}).sort({ module: 1, name: 1 });
        
        // Group by module
        const byModule = {};
        permissions.forEach(p => {
            if (!byModule[p.module]) {
                byModule[p.module] = [];
            }
            byModule[p.module].push(p);
        });
        
        console.log('\n📋 Permissions by Module:');
        Object.keys(byModule).forEach(module => {
            console.log(`   ${module}: ${byModule[module].length} permissions`);
        });
        
        console.log('\n🎯 Permission Categories:');
        const categories = [...new Set(permissions.map(p => p.category))];
        categories.forEach(cat => {
            const count = permissions.filter(p => p.category === cat).length;
            console.log(`   ${cat}: ${count} permissions`);
        });
        
        await mongoose.disconnect();
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

countPermissions();