const mongoose = require('mongoose');

/**
 * Script to enable AI Assistance in Knowledge Base settings for all projects
 * This enables the "GPT-5.2-Codex" (AI assistance) feature for all clients
 */

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // Get all projects
    const projects = await db.collection('projects').find({}).toArray();
    
    if (projects.length === 0) {
      console.log('❌ No projects found');
      process.exit(1);
    }
    
    console.log(`📊 Found ${projects.length} project(s)\n`);
    
    let updatedCount = 0;
    let alreadyEnabledCount = 0;
    
    // Update each project
    for (const project of projects) {
      const projectName = project.name || 'Unnamed Project';
      const projectCode = project.code || project.projectId || 'N/A';
      
      // Initialize configuration if it doesn't exist
      if (!project.configuration) {
        project.configuration = {};
      }
      
      // Initialize knowledgeBaseSettings if it doesn't exist
      if (!project.configuration.knowledgeBaseSettings) {
        project.configuration.knowledgeBaseSettings = {
          enabled: true,
          enableAIAssistance: false,
          enableSatisfactionFeedback: true
        };
      }
      
      // Check current status
      const wasEnabled = project.configuration.knowledgeBaseSettings.enableAIAssistance === true;
      
      if (wasEnabled) {
        console.log(`✓ ${projectName} (${projectCode}): AI Assistance already enabled`);
        alreadyEnabledCount++;
      } else {
        // Enable AI Assistance
        project.configuration.knowledgeBaseSettings.enableAIAssistance = true;
        
        // Update the project
        await db.collection('projects').updateOne(
          { _id: project._id },
          { 
            $set: { 
              'configuration.knowledgeBaseSettings.enableAIAssistance': true,
              updatedAt: new Date()
            } 
          }
        );
        
        console.log(`✅ ${projectName} (${projectCode}): AI Assistance ENABLED`);
        updatedCount++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Projects: ${projects.length}`);
    console.log(`Newly Enabled: ${updatedCount}`);
    console.log(`Already Enabled: ${alreadyEnabledCount}`);
    console.log('='.repeat(60));
    console.log('\n✅ AI Assistance (GPT-5.2-Codex) has been enabled for all clients!\n');
    
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
