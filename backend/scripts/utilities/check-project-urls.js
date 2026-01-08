const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sac_helpdesk';

async function checkProjects() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }));
    
    const projects = await Project.find({}).select('name code branding.customUrlPath branding.logo branding.colorTheme');
    
    console.log('\n📊 Projects in Database:', projects.length);
    console.log('\n' + '='.repeat(80));
    
    projects.forEach((project, index) => {
      console.log(`\n${index + 1}. ${project.name} (${project.code})`);
      console.log(`   Custom URL Path: ${project.branding?.customUrlPath || 'NOT SET'}`);
      console.log(`   Logo: ${project.branding?.logo ? '✅ Configured' : '❌ Not set'}`);
      console.log(`   Color Theme: ${project.branding?.colorTheme?.primary || 'Default'}`);
      
      if (project.branding?.customUrlPath) {
        console.log(`   🔗 Login URL: http://localhost:3001/${project.branding.customUrlPath}`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    
    const projectsWithUrl = projects.filter(p => p.branding?.customUrlPath);
    console.log(`\n✅ Projects with custom URL: ${projectsWithUrl.length}/${projects.length}`);
    
    if (projectsWithUrl.length === 0) {
      console.log('\n⚠️  No projects have custom URL paths configured!');
      console.log('   Please set customUrlPath in project branding to test project login.');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkProjects();
