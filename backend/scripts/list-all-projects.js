require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection string
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

async function listAllProjects() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    
    // Count total projects
    const count = await Project.countDocuments({});
    console.log(`📊 Total projects in database: ${count}\n`);
    
    const allProjects = await Project.find({}).limit(50);
    
    console.log(`📋 Listing ${allProjects.length} project(s):\n`);
    console.log('='.repeat(80));
    
    allProjects.forEach((p, index) => {
      console.log(`\n${index + 1}. ${p.name || 'Unnamed Project'}`);
      console.log(`   ID: ${p._id}`);
      console.log(`   Code: ${p.code || 'N/A'}`);
      console.log(`   Custom URL: ${p.branding?.customUrlPath || 'N/A'}`);
      console.log(`   Active: ${p.isActive !== false ? 'Yes' : 'No'}`);
    });
    
    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

listAllProjects();
