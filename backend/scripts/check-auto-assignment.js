const { MongoClient, ObjectId } = require('mongodb');

(async () => {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  console.log('✅ Connected to MongoDB');
  
  const db = client.db('sac_helpdesk');
  
  // Check project settings
  const project = await db.collection('projects').findOne(
    { _id: new ObjectId('6938f34bedea0c244850566d') },
    { projection: { 'configuration.ticketAssignmentSettings': 1, name: 1 } }
  );
  
  console.log('\n📋 Project:', project.name);
  console.log('\n🎯 Auto-assignment settings:');
  console.log(JSON.stringify(project.configuration?.ticketAssignmentSettings, null, 2));
  
  // Check for agent roles mapped to this project
  console.log('\n🔍 Checking agent roles for this project...');
  const agentRoles = await db.collection('roles').find({
    isAgent: true,
    isActive: true,
    $or: [
      { projects: new ObjectId('6938f34bedea0c244850566d') },
      { projectId: new ObjectId('6938f34bedea0c244850566d') }
    ]
  }).toArray();
  
  console.log(`\n📊 Found ${agentRoles.length} agent roles mapped to this project:`);
  agentRoles.forEach(role => {
    console.log(`  - ${role.name} (${role.code}) - isAgent: ${role.isAgent}`);
  });
  
  // Check users with agent roles
  if (agentRoles.length > 0) {
    const agentRoleIds = agentRoles.map(r => r._id);
    const agents = await db.collection('users').find({
      role: { $in: agentRoleIds },
      isActive: true
    }).toArray();
    
    console.log(`\n👥 Found ${agents.length} active users with agent roles:`);
    agents.forEach(user => {
      console.log(`  - ${user.firstName} ${user.lastName} (${user.email})`);
    });
  }
  
  await client.close();
})();
