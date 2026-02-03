const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function directQueryTest() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Ticket = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false, collection: 'tickets' }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false, collection: 'roles' }));
    
    console.log('============================================================');
    console.log('🔍 SIMULATING getAllTickets QUERY LOGIC');
    console.log('============================================================\n');
    
    // Get the user
    const user = await User.findOne({ email: 'ankit.mehta@hubblehox.com' }).lean();
    
    if (!user) {
      console.log('❌ User not found!');
      process.exit(1);
    }
    
    // Get the role
    const role = await Role.findById(user.role).lean();
    
    console.log(`👤 User: ${user.email}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Role: ${role?.name} (${role?.code})\n`);
    
    // Get role with projects
    const fullRole = role;
    const roleProjectIds = (fullRole?.projects || []).map(p => 
      typeof p === 'string' ? new mongoose.Types.ObjectId(p) : new mongoose.Types.ObjectId(p._id || p)
    );
    
    console.log(`📋 Role projects: ${roleProjectIds.length}`);
    if (roleProjectIds.length > 0) {
      console.log(`   Projects:`, roleProjectIds.map(p => p.toString()));
    }
    console.log('');
    
    // Simulate the project context
    const projectContext = {
      viewMode: 'single',
      currentProjectId: '696f6d62254966069115cc29'
    };
    
    console.log(`🔍 Project Context:`, projectContext);
    console.log('');
    
    // Build the query (simulating getAllTickets logic)
    const isSuperAdmin = role?.code === 'SUPER_ADMIN';
    let query = {};
    
    console.log(`🔍 isSuperAdmin: ${isSuperAdmin}`);
    console.log(`🔍 viewMode: ${projectContext.viewMode}`);
    console.log(`🔍 currentProjectId: ${projectContext.currentProjectId}\n`);
    
    if (isSuperAdmin) {
      console.log('✅ Super Admin - no project filter');
    } else if (projectContext.viewMode === 'single' && projectContext.currentProjectId) {
      query['metadata.projectId'] = {
        $in: [
          projectContext.currentProjectId,
          new mongoose.Types.ObjectId(projectContext.currentProjectId)
        ]
      };
      console.log('✅ Single Project Mode - applying project filter');
    } else if (projectContext.viewMode === 'unified' || !projectContext.currentProjectId) {
      if (roleProjectIds.length > 0) {
        const allProjectIdFormats = roleProjectIds.flatMap(id => [
          id.toString(),
          id
        ]);
        query['metadata.projectId'] = { $in: allProjectIdFormats };
        console.log('✅ Unified Mode - applying projects filter');
      } else {
        console.log('❌ No projects assigned to role');
      }
    }
    
    // Check for user centers (for offline filtering)
    const userCenterIds = (user.centers || []).map(c => {
      const centerId = typeof c === 'string' ? c : c._id?.toString() || c.toString();
      return centerId;
    });
    
    console.log(`\n🏢 User centers: ${userCenterIds.length}`);
    
    const additionalFilters = [];
    if (userCenterIds.length > 0) {
      const centerObjectIds = userCenterIds.map(id => new mongoose.Types.ObjectId(id));
      additionalFilters.push({
        $or: [
          { 'metadata.centerId': 'online' },
          { 'metadata.centerId': { $in: [...userCenterIds, ...centerObjectIds] } },
          { 'metadata.centerId': { $exists: false } },
          { 'metadata.centerId': null }
        ]
      });
      console.log(`   Applying center filter for ${userCenterIds.length} center(s)`);
    }
    
    // Combine filters
    if (additionalFilters.length > 0) {
      if (query.$and) {
        query.$and.push(...additionalFilters);
      } else {
        query = { $and: [query, ...additionalFilters] };
      }
    }
    
    console.log('\n============================================================');
    console.log('📊 FINAL QUERY');
    console.log('============================================================');
    console.log(JSON.stringify(query, null, 2));
    console.log('');
    
    // Execute the query
    console.log('🔍 Executing query...\n');
    const tickets = await Ticket.find(query)
      .select('ticketNumber title status priority assignedTo metadata createdAt')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log('============================================================');
    console.log('📊 QUERY RESULTS');
    console.log('============================================================');
    console.log(`Total tickets found: ${tickets.length}\n`);
    
    if (tickets.length > 0) {
      console.log('✅ TICKETS:');
      tickets.forEach((ticket, i) => {
        console.log(`\n${i + 1}. ${ticket.ticketNumber}`);
        console.log(`   Title: ${ticket.title || 'No title'}`);
        console.log(`   Status: ${ticket.status}, Priority: ${ticket.priority}`);
        console.log(`   Project: ${ticket.metadata?.projectId}`);
        console.log(`   Center: ${ticket.metadata?.centerId || 'N/A'}`);
        console.log(`   Assigned: ${ticket.assignedTo || 'Unassigned'}`);
      });
    } else {
      console.log('❌ NO TICKETS FOUND!');
      console.log('\n🔍 Debugging - let\'s check what tickets exist:\n');
      
      // Debug: Check tickets with just the project filter (no center filter)
      const debugQuery = {
        'metadata.projectId': {
          $in: [
            projectContext.currentProjectId,
            new mongoose.Types.ObjectId(projectContext.currentProjectId)
          ]
        }
      };
      
      console.log('Debug Query (project only):', JSON.stringify(debugQuery, null, 2));
      const debugTickets = await Ticket.find(debugQuery)
        .select('ticketNumber metadata')
        .lean();
      
      console.log(`\n📋 Tickets with project filter only: ${debugTickets.length}`);
      if (debugTickets.length > 0) {
        debugTickets.slice(0, 5).forEach(t => {
          console.log(`   - ${t.ticketNumber}: centerId = ${t.metadata?.centerId || 'undefined'}`);
        });
        
        console.log('\n⚠️  The issue is likely the CENTER FILTER!');
        console.log(`   Your user has ${userCenterIds.length} center(s) assigned.`);
        console.log('   Tickets must either be "online" or match one of your assigned centers.');
      }
    }
    
    console.log('\n============================================================\n');
    
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

directQueryTest();
