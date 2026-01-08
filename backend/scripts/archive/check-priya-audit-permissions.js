const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const dbName = 'sachemsdb';

async function checkPriyaAuditPermissions() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db(dbName);
    
    // Find Priya's user record
    const user = await db.collection('users').findOne({ 
      email: 'priya.sharma@sac.gov.in' 
    });
    
    if (!user) {
      console.log('❌ User not found: priya.sharma@sac.gov.in');
      return;
    }
    
    console.log('\n👤 USER DETAILS');
    console.log('Name:', user.firstName, user.lastName);
    console.log('Email:', user.email);
    console.log('Role ID:', user.role);
    
    // Find the role
    const role = await db.collection('roles').findOne({ 
      _id: user.role 
    });
    
    if (!role) {
      console.log('❌ Role not found');
      return;
    }
    
    console.log('\n📋 ROLE DETAILS');
    console.log('Role Name:', role.name);
    console.log('Role Code:', role.code);
    console.log('Total Permissions:', role.permissions?.length || 0);
    
    // Check for AUDIT permissions
    const auditPermissions = role.permissions?.filter(p => 
      p.code && p.code.startsWith('AUDIT_')
    ) || [];
    
    console.log('\n🔍 AUDIT PERMISSIONS');
    if (auditPermissions.length === 0) {
      console.log('❌ NO AUDIT PERMISSIONS FOUND');
      console.log('\nAll permissions:');
      role.permissions?.forEach(p => {
        console.log(`  - ${p.code || p.name || p}`);
      });
    } else {
      console.log('✅ Found', auditPermissions.length, 'audit permissions:');
      auditPermissions.forEach(p => {
        console.log(`  - ${p.code}: ${p.name}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkPriyaAuditPermissions();
