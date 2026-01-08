const mongoose = require('mongoose');

async function checkSLA() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const slarulesCollection = db.collection('slarules');
    const projectsCollection = db.collection('projects');

    // Get the project
    const project = await projectsCollection.findOne({ name: 'Student Assist Center' });
    console.log('\n📋 Project:', {
      _id: project._id,
      name: project.name
    });

    // Get all SLA rules
    const allRules = await slarulesCollection.find({}).toArray();
    console.log('\n📋 All SLA Rules in database:');
    allRules.forEach(rule => {
      console.log(`   - ${rule.name}:`);
      console.log(`     _id: ${rule._id}`);
      console.log(`     priority: ${rule.priority}`);
      console.log(`     isActive: ${rule.isActive}`);
      console.log(`     projectIds: ${JSON.stringify(rule.projectIds)}`);
    });

    // Try the query that the backend uses
    console.log('\n🔍 Testing backend query:');
    console.log(`   projectIds: { $in: [${project._id}] }`);
    console.log(`   isActive: true`);
    console.log(`   priority: { $exists: true, $ne: null }`);

    const matchingRules = await slarulesCollection.find({
      projectIds: { $in: [project._id] },
      isActive: true,
      priority: { $exists: true, $ne: null }
    }).toArray();

    console.log(`\n✅ Found ${matchingRules.length} matching rules:`);
    matchingRules.forEach(rule => {
      console.log(`   - ${rule.name}: priority=${rule.priority}`);
    });

    if (matchingRules.length === 0) {
      console.log('\n❌ No matching rules found. Checking why:');
      
      // Check if any rules have the project ID
      const rulesWithProject = await slarulesCollection.find({
        projectIds: { $in: [project._id] }
      }).toArray();
      console.log(`   Rules with projectId: ${rulesWithProject.length}`);
      
      // Check active rules
      const activeRules = await slarulesCollection.find({
        isActive: true
      }).toArray();
      console.log(`   Active rules: ${activeRules.length}`);
      
      // Check rules with priority
      const rulesWithPriority = await slarulesCollection.find({
        priority: { $exists: true, $ne: null }
      }).toArray();
      console.log(`   Rules with priority: ${rulesWithPriority.length}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSLA();
