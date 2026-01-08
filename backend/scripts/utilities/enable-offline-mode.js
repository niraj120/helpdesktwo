const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const projects = await db.collection('projects').find({}).toArray();
    
    if (projects.length === 0) {
      console.log('❌ No projects found');
      process.exit(1);
    }
    
    const project = projects[0]; // Get first project
    console.log(`📝 Updating project: ${project.name} (${project.code})\n`);
    
    // Initialize configuration if it doesn't exist
    if (!project.configuration) {
      project.configuration = {};
    }
    
    // Initialize ticketSubmissionSettings if it doesn't exist
    if (!project.configuration.ticketSubmissionSettings) {
      project.configuration.ticketSubmissionSettings = {};
    }
    
    // Set mode to 'both' to enable both online and offline
    project.configuration.ticketSubmissionSettings.mode = 'both';
    project.configuration.ticketSubmissionSettings.enableOnlineForm = true;
    project.configuration.ticketSubmissionSettings.enableOfflineCenter = true;
    
    // Set or update offlineModuleSettings with default configuration
    project.configuration.offlineModuleSettings = {
        registrationFields: [
          {
            fieldName: 'First Name',
            fieldType: 'text',
            required: true,
            placeholder: 'Enter first name',
            isFixed: true,
            isEnabled: true,
            order: 1
          },
          {
            fieldName: 'Last Name',
            fieldType: 'text',
            required: true,
            placeholder: 'Enter last name',
            isFixed: true,
            isEnabled: true,
            order: 2
          },
          {
            fieldName: 'Email',
            fieldType: 'email',
            required: true,
            placeholder: 'Enter email address',
            isFixed: true,
            isEnabled: true,
            order: 3
          },
          {
            fieldName: 'Phone',
            fieldType: 'phone',
            required: true,
            placeholder: 'Enter phone number',
            isFixed: true,
            isEnabled: true,
            order: 4
          }
        ],
        ticketFields: [
          {
            id: 'category-fixed',
            fieldName: 'Category',
            fieldType: 'category-select',
            required: true,
            placeholder: 'Select category',
            isFixed: true,
            isEnabled: true,
            order: 1
          },
          {
            id: 'description-dynamic',
            fieldName: 'Description',
            fieldType: 'textarea',
            required: true,
            placeholder: 'Detailed description',
            isFixed: false,
            isEnabled: true,
            order: 2
          },
          {
            id: 'attachment-dynamic',
            fieldName: 'Attachment',
            fieldType: 'file',
            required: false,
            placeholder: 'Attach files',
            allowMultiple: true,
            maxFiles: 5,
            allowedFileTypes: ['pdf', 'jpg', 'png', 'doc'],
            isFixed: false,
            isEnabled: true,
            order: 3
          }
        ],
        allowAgentToMarkResolved: true,
        allowAgentToEscalate: true,
        autoAssignToCreatingAgent: true,
        requireStudentVerification: false,
        notificationSettings: {
          notifyStudentOnRegistration: true,
          notifyStudentOnTicketCreation: true,
          sendWelcomeEmail: true
        }
      };
    
    // Update the project
    await db.collection('projects').updateOne(
      { _id: project._id },
      { $set: { configuration: project.configuration } }
    );
    
    console.log('✅ Offline mode enabled successfully!\n');
    console.log('Configuration:');
    console.log(`  Submission Mode: ${project.configuration.ticketSubmissionSettings.mode}`);
    console.log(`  Enable Online Form: ${project.configuration.ticketSubmissionSettings.enableOnlineForm}`);
    console.log(`  Enable Offline Center: ${project.configuration.ticketSubmissionSettings.enableOfflineCenter}`);
    console.log(`  Offline Module Settings: Configured with ${project.configuration.offlineModuleSettings.registrationFields.length} registration fields and ${project.configuration.offlineModuleSettings.ticketFields.length} ticket fields`);
    
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
