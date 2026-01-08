const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    // Find the project
    const project = await mongoose.connection.db.collection('projects').findOne({
      name: 'Student assist center'
    });
    
    if (!project) {
      console.log('❌ Project not found');
      process.exit(1);
    }
    
    console.log('📋 Project found:', project.name);
    console.log('   ProjectID:', project._id);
    console.log('   Assignment Type:', project.configuration?.ticketAssignmentSettings?.assignmentType);
    console.log('   Assignment Enabled:', project.configuration?.ticketAssignmentSettings?.enabled);
    
    // Generate ticket number
    const ticketCount = await mongoose.connection.db.collection('tickets').countDocuments();
    const now = new Date();
    const ticketNumber = `TKT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(ticketCount + 1).padStart(4, '0')}`;
    
    console.log('\n📝 Creating test ticket:', ticketNumber);
    
    // Create a test ticket
    const systemUserId = new mongoose.Types.ObjectId();
    const ticket = {
      ticketNumber,
      title: 'Test Ticket - Student Query',
      description: 'This is a test ticket submitted from student portal to verify the assignment workflow',
      status: 'open',
      priority: 'medium',
      category: 'General',
      createdBy: systemUserId,
      assignedTo: null, // Manual assignment means no auto-assign
      submissionSource: 'online',
      attachments: [],
      tags: ['student-submission', `project-${project._id}`],
      metadata: {
        studentName: 'Test Student',
        studentEmail: 'test.student@example.com',
        studentPhone: '1234567890',
        projectId: project._id,
        submissionType: 'online',
        autoAssigned: false
      },
      threads: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await mongoose.connection.db.collection('tickets').insertOne(ticket);
    
    console.log('✅ Test ticket created successfully!');
    console.log('   Ticket ID:', result.insertedId);
    console.log('   Ticket Number:', ticketNumber);
    console.log('   Assigned To:', ticket.assignedTo || 'Unassigned (Manual Assignment)');
    
    console.log('\n📋 Summary:');
    console.log('   - Ticket created: YES');
    console.log('   - Auto-assigned: NO (manual assignment configured)');
    console.log('   - Status: open');
    console.log('   - Priority: medium');
    
    console.log('\n💡 Next steps:');
    console.log('   1. Login as Center Manager (deepa.rao@sac.gov.in)');
    console.log('   2. Go to Ticket Assignment page');
    console.log('   3. You should see this unassigned ticket');
    console.log('   4. Manually assign it to an agent with isAgent role');
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
