const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/sac_helpdesk';

async function debugAdminUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const rolesCollection = db.collection('roles');
    const permissionsCollection = db.collection('permissions');

    // Find admin user
    console.log('\n🔍 Finding admin user...');
    const user = await usersCollection.findOne({ email: 'admin@helpdesk.gov.in' });

    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('✅ User found:', user.email);
    console.log('Role ID:', user.role);
    
    // Find role
    const role = await rolesCollection.findOne({ _id: user.role });
    if (!role) {
      console.log('❌ Role not found');
      return;
    }
    
    console.log('✅ Role found:', role.name, role.code);
    console.log('Role permissions (IDs):', role.permissions?.length || 0);
    
    // Fetch permission details
    if (role.permissions && role.permissions.length > 0) {
      const permissions = await permissionsCollection.find({
        _id: { $in: role.permissions }
      }).toArray();
      
      console.log('\n✅ Found', permissions.length, 'permission documents');
      console.log('\nFirst 5 permissions:');
      permissions.slice(0, 5).forEach((p, i) => {
        console.log(`  ${i + 1}.`, p.code, '-', p.name);
      });
      
      user.role = {
        _id: role._id,
        name: role.name,
        code: role.code,
        permissions: permissions
      };
    }

    console.log('\n📋 User Details:');
    console.log('Email:', user.email);
    console.log('Role type:', typeof user.role);
    console.log('Role is object:', user.role && typeof user.role === 'object');
    
    if (user.role) {
      console.log('\n📋 Role Details:');
      console.log('Role ID:', user.role._id);
      console.log('Role name:', user.role.name);
      console.log('Role code:', user.role.code);
      console.log('Has permissions field:', 'permissions' in user.role);
      console.log('Permissions type:', typeof user.role.permissions);
      console.log('Permissions is array:', Array.isArray(user.role.permissions));
      console.log('Permissions length:', user.role.permissions?.length);
      
      if (user.role.permissions && user.role.permissions.length > 0) {
        console.log('\n📋 First 5 Permissions:');
        for (let i = 0; i < Math.min(5, user.role.permissions.length); i++) {
          const p = user.role.permissions[i];
          console.log(`  ${i + 1}.`, {
            type: typeof p,
            isObject: typeof p === 'object',
            hasCode: p && 'code' in p,
            code: p?.code || p,
            name: p?.name
          });
        }
        
        // Test permission extraction logic
        console.log('\n🧪 Testing permission extraction:');
        const extracted = user.role.permissions
          .map((p) => p.code || (typeof p === 'object' && 'code' in p ? p.code : null))
          .filter(Boolean);
        console.log('Extracted permissions count:', extracted.length);
        console.log('First 5 extracted:', extracted.slice(0, 5));
      } else {
        console.log('⚠️  No permissions found or empty array');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Connection closed');
  }
}

debugAdminUser();
