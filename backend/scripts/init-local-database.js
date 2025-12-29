/**
 * Initialize Local Database with Schema and Sample Data
 * This script creates all collections with proper schema and seeds sample data
 * Run: node scripts/init-local-database.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Use local MongoDB
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

console.log('========================================');
console.log('Local Database Initialization');
console.log('========================================');
console.log('');
console.log('📍 MongoDB URI:', MONGO_URI);
console.log('');

async function initDatabase() {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected successfully\n');

    const db = mongoose.connection.db;

    // Get existing collections
    const existingCollections = await db.listCollections().toArray();
    const existingNames = existingCollections.map(c => c.name);

    console.log('📦 Existing collections:', existingNames.length);
    if (existingNames.length > 0) {
      console.log('   ', existingNames.join(', '));
      console.log('');
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        readline.question('⚠️  Drop existing collections and recreate? (yes/no): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Initialization cancelled');
        process.exit(0);
      }

      // Drop existing collections
      console.log('\n🗑️  Dropping existing collections...');
      for (const name of existingNames) {
        await db.collection(name).drop();
        console.log(`   ✓ Dropped ${name}`);
      }
      console.log('');
    }

    // Create collections with schema
    console.log('📋 Creating collections with schema...\n');

    // 1. Permissions
    console.log('1️⃣  Creating permissions...');
    const permissionsCollection = await db.createCollection('permissions');
    await permissionsCollection.createIndex({ name: 1 }, { unique: true });
    
    const permissions = [
      // Ticket Management
      { name: 'TICKET_VIEW_ALL', description: 'View all tickets', category: 'Tickets', createdAt: new Date(), updatedAt: new Date() },
      { name: 'TICKET_VIEW_OWN', description: 'View own tickets', category: 'Tickets', createdAt: new Date(), updatedAt: new Date() },
      { name: 'TICKET_CREATE', description: 'Create tickets', category: 'Tickets', createdAt: new Date(), updatedAt: new Date() },
      { name: 'TICKET_EDIT', description: 'Edit tickets', category: 'Tickets', createdAt: new Date(), updatedAt: new Date() },
      { name: 'TICKET_DELETE', description: 'Delete tickets', category: 'Tickets', createdAt: new Date(), updatedAt: new Date() },
      { name: 'TICKET_ASSIGN', description: 'Assign tickets', category: 'Tickets', createdAt: new Date(), updatedAt: new Date() },
      { name: 'TICKET_EXPORT', description: 'Export tickets', category: 'Tickets', createdAt: new Date(), updatedAt: new Date() },
      
      // User Management
      { name: 'USER_VIEW', description: 'View users', category: 'Users', createdAt: new Date(), updatedAt: new Date() },
      { name: 'USER_CREATE', description: 'Create users', category: 'Users', createdAt: new Date(), updatedAt: new Date() },
      { name: 'USER_EDIT', description: 'Edit users', category: 'Users', createdAt: new Date(), updatedAt: new Date() },
      { name: 'USER_DELETE', description: 'Delete users', category: 'Users', createdAt: new Date(), updatedAt: new Date() },
      { name: 'USER_IMPORT', description: 'Import users', category: 'Users', createdAt: new Date(), updatedAt: new Date() },
      
      // Role Management
      { name: 'ROLE_VIEW', description: 'View roles', category: 'Roles', createdAt: new Date(), updatedAt: new Date() },
      { name: 'ROLE_CREATE', description: 'Create roles', category: 'Roles', createdAt: new Date(), updatedAt: new Date() },
      { name: 'ROLE_EDIT', description: 'Edit roles', category: 'Roles', createdAt: new Date(), updatedAt: new Date() },
      { name: 'ROLE_DELETE', description: 'Delete roles', category: 'Roles', createdAt: new Date(), updatedAt: new Date() },
      
      // Project Management
      { name: 'PROJECT_VIEW', description: 'View projects', category: 'Projects', createdAt: new Date(), updatedAt: new Date() },
      { name: 'PROJECT_CREATE', description: 'Create projects', category: 'Projects', createdAt: new Date(), updatedAt: new Date() },
      { name: 'PROJECT_EDIT', description: 'Edit projects', category: 'Projects', createdAt: new Date(), updatedAt: new Date() },
      { name: 'PROJECT_DELETE', description: 'Delete projects', category: 'Projects', createdAt: new Date(), updatedAt: new Date() },
      
      // Asset Management
      { name: 'ASSET_VIEW', description: 'View assets', category: 'Assets', createdAt: new Date(), updatedAt: new Date() },
      { name: 'ASSET_CREATE', description: 'Create assets', category: 'Assets', createdAt: new Date(), updatedAt: new Date() },
      { name: 'ASSET_EDIT', description: 'Edit assets', category: 'Assets', createdAt: new Date(), updatedAt: new Date() },
      { name: 'ASSET_DELETE', description: 'Delete assets', category: 'Assets', createdAt: new Date(), updatedAt: new Date() },
      
      // Knowledge Base
      { name: 'KB_VIEW', description: 'View knowledge base', category: 'Knowledge Base', createdAt: new Date(), updatedAt: new Date() },
      { name: 'KB_CREATE', description: 'Create KB articles', category: 'Knowledge Base', createdAt: new Date(), updatedAt: new Date() },
      { name: 'KB_EDIT', description: 'Edit KB articles', category: 'Knowledge Base', createdAt: new Date(), updatedAt: new Date() },
      { name: 'KB_DELETE', description: 'Delete KB articles', category: 'Knowledge Base', createdAt: new Date(), updatedAt: new Date() },
      
      // Reports & Analytics
      { name: 'REPORT_VIEW', description: 'View reports', category: 'Reports', createdAt: new Date(), updatedAt: new Date() },
      { name: 'DASHBOARD_VIEW', description: 'View dashboard', category: 'Dashboard', createdAt: new Date(), updatedAt: new Date() },
      { name: 'AUDIT_VIEW', description: 'View audit logs', category: 'Audit', createdAt: new Date(), updatedAt: new Date() },
      
      // Master Data
      { name: 'MASTERDATA_VIEW', description: 'View master data', category: 'Master Data', createdAt: new Date(), updatedAt: new Date() },
      { name: 'MASTERDATA_EDIT', description: 'Edit master data', category: 'Master Data', createdAt: new Date(), updatedAt: new Date() },
      
      // Feedback
      { name: 'FEEDBACK_VIEW', description: 'View feedback', category: 'Feedback', createdAt: new Date(), updatedAt: new Date() },
      { name: 'FEEDBACK_CREATE', description: 'Create feedback forms', category: 'Feedback', createdAt: new Date(), updatedAt: new Date() },
      { name: 'FEEDBACK_EDIT', description: 'Edit feedback forms', category: 'Feedback', createdAt: new Date(), updatedAt: new Date() },
      { name: 'FEEDBACK_DELETE', description: 'Delete feedback forms', category: 'Feedback', createdAt: new Date(), updatedAt: new Date() },
      { name: 'FEEDBACK_RESPOND', description: 'Respond to feedback', category: 'Feedback', createdAt: new Date(), updatedAt: new Date() },
    ];
    
    await permissionsCollection.insertMany(permissions);
    console.log(`   ✓ Created ${permissions.length} permissions\n`);

    // 2. Roles
    console.log('2️⃣  Creating roles...');
    const rolesCollection = await db.createCollection('roles');
    await rolesCollection.createIndex({ name: 1 }, { unique: true });
    
    const permissionIds = await permissionsCollection.find().toArray();
    const allPermissionIds = permissionIds.map(p => p._id);
    
    const roles = [
      {
        module: 'Super Admin',
        name: 'Super Admin',
        code: 'SUPER_ADMIN',
        description: 'Full system access',
        type: 'system',
        permissions: allPermissionIds,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        module: 'Support Administrator',
        name: 'Support Administrator',
        code: 'SUPPORT_ADMIN',
        description: 'Administrative access',
        type: 'custom',
        permissions: allPermissionIds.filter((_, i) => i < 30), // Most permissions
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        module: 'Agent',
        name: 'Agent',
        code: 'AGENT',
        description: 'Support agent',
        type: 'custom',
        permissions: permissionIds
          .filter(p => ['TICKET_VIEW_ALL', 'TICKET_CREATE', 'TICKET_EDIT', 'TICKET_ASSIGN', 'KB_VIEW', 'DASHBOARD_VIEW', 'ASSET_VIEW'].includes(p.name))
          .map(p => p._id),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        module: 'Student',
        name: 'Student',
        code: 'STUDENT',
        description: 'Student user',
        type: 'system',
        permissions: permissionIds
          .filter(p => ['TICKET_VIEW_OWN', 'TICKET_CREATE', 'KB_VIEW', 'FEEDBACK_RESPOND'].includes(p.name))
          .map(p => p._id),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    await rolesCollection.insertMany(roles);
    console.log(`   ✓ Created ${roles.length} roles\n`);

    // 3. Projects
    console.log('3️⃣  Creating projects...');
    const projectsCollection = await db.createCollection('projects');
    await projectsCollection.createIndex({ name: 1 }, { unique: true });
    await projectsCollection.createIndex({ key: 1 }, { unique: true });
    
    const projects = [
      {
        name: 'Student Assist Center',
        key: 'SAC',
        description: 'Main helpdesk project',
        customUrlPath: 'mhcet',
        branding: {
          primaryColor: '#1976d2',
          secondaryColor: '#dc004e',
          logo: '',
          favicon: ''
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'IT Support',
        key: 'IT',
        description: 'IT infrastructure support',
        customUrlPath: 'it-support',
        branding: {
          primaryColor: '#2196F3',
          secondaryColor: '#FF9800',
          logo: '',
          favicon: ''
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'General Queries',
        key: 'GEN',
        description: 'General student queries',
        customUrlPath: 'general',
        branding: {
          primaryColor: '#4CAF50',
          secondaryColor: '#FFC107',
          logo: '',
          favicon: ''
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    await projectsCollection.insertMany(projects);
    console.log(`   ✓ Created ${projects.length} projects\n`);

    // 4. Statuses
    console.log('4️⃣  Creating statuses...');
    const statusesCollection = await db.createCollection('statuses');
    await statusesCollection.createIndex({ name: 1, projectId: 1 }, { unique: true });
    
    const sacProject = projects[0];
    const statuses = [
      {
        name: 'New',
        color: '#2196F3',
        isDefault: true,
        isClosed: false,
        order: 1,
        projectId: sacProject._id,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'In Progress',
        color: '#FF9800',
        isDefault: false,
        isClosed: false,
        order: 2,
        projectId: sacProject._id,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Resolved',
        color: '#4CAF50',
        isDefault: false,
        isClosed: true,
        order: 3,
        projectId: sacProject._id,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Closed',
        color: '#9E9E9E',
        isDefault: false,
        isClosed: true,
        order: 4,
        projectId: sacProject._id,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    await statusesCollection.insertMany(statuses);
    console.log(`   ✓ Created ${statuses.length} statuses\n`);

    // 5. Users
    console.log('5️⃣  Creating users...');
    const usersCollection = await db.createCollection('users');
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    const superAdminRole = await rolesCollection.findOne({ code: 'SUPER_ADMIN' });
    const agentRole = await rolesCollection.findOne({ code: 'AGENT' });
    const studentRole = await rolesCollection.findOne({ code: 'STUDENT' });
    
    const users = [
      {
        username: 'admin',
        email: 'admin@sachelpdesk.com',
        password: hashedPassword,
        firstName: 'System',
        lastName: 'Admin',
        role: superAdminRole._id,
        isActive: true,
        isVerified: true,
        eulaAccepted: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        username: 'agent1',
        email: 'agent@sachelpdesk.com',
        password: hashedPassword,
        firstName: 'Support',
        lastName: 'Agent',
        role: agentRole._id,
        isActive: true,
        isVerified: true,
        eulaAccepted: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        username: 'student1',
        email: 'student@sachelpdesk.com',
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'Student',
        role: studentRole._id,
        isActive: true,
        isVerified: true,
        eulaAccepted: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    await usersCollection.insertMany(users);
    console.log(`   ✓ Created ${users.length} users\n`);

    // 6. Categories
    console.log('6️⃣  Creating categories...');
    const categoriesCollection = await db.createCollection('categories');
    await categoriesCollection.createIndex({ name: 1, projectId: 1 }, { unique: true });
    
    const categories = [
      {
        name: 'Technical Issue',
        description: 'Technical problems and bugs',
        projectId: sacProject._id,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Access Request',
        description: 'Access and permission requests',
        projectId: sacProject._id,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'General Query',
        description: 'General questions and queries',
        projectId: sacProject._id,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    await categoriesCollection.insertMany(categories);
    console.log(`   ✓ Created ${categories.length} categories\n`);

    // 7. Create other essential collections (empty)
    console.log('7️⃣  Creating other collections...');
    
    const collections = [
      'tickets',
      'assets',
      'centers',
      'centerassetmappings',
      'kbcategories',
      'kbsubcategories',
      'knowledgebasearticles',
      'faqs',
      'feedbackforms',
      'feedbackresponses',
      'emailconfigs',
      'emaillogs',
      'accesslogs',
      'activitylogs',
      'apilogs',
      'approvalworkflows',
      'approvalcategories',
      'approvalrequesttypes',
      'eulaacceptances',
      'masterdata'
    ];
    
    for (const collName of collections) {
      await db.createCollection(collName);
      console.log(`   ✓ Created ${collName}`);
    }
    console.log('');

    // 8. Master Data
    console.log('8️⃣  Creating master data...');
    const masterDataCollection = db.collection('masterdata');
    
    const masterData = [
      {
        type: 'priority',
        values: [
          { value: 'Low', label: 'Low', order: 1, isActive: true },
          { value: 'Medium', label: 'Medium', order: 2, isActive: true },
          { value: 'High', label: 'High', order: 3, isActive: true },
          { value: 'Critical', label: 'Critical', order: 4, isActive: true }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        type: 'ticketType',
        values: [
          { value: 'Incident', label: 'Incident', order: 1, isActive: true },
          { value: 'Request', label: 'Service Request', order: 2, isActive: true },
          { value: 'Problem', label: 'Problem', order: 3, isActive: true },
          { value: 'Change', label: 'Change Request', order: 4, isActive: true }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    await masterDataCollection.insertMany(masterData);
    console.log(`   ✓ Created ${masterData.length} master data types\n`);

    console.log('========================================');
    console.log('✅ Database Initialization Complete!');
    console.log('========================================');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   • Permissions: ${permissions.length}`);
    console.log(`   • Roles: ${roles.length}`);
    console.log(`   • Projects: ${projects.length}`);
    console.log(`   • Statuses: ${statuses.length}`);
    console.log(`   • Users: ${users.length}`);
    console.log(`   • Categories: ${categories.length}`);
    console.log(`   • Collections: ${collections.length}`);
    console.log('');
    console.log('🔑 Test Credentials:');
    console.log('   Admin:   admin@sachelpdesk.com / Admin@123');
    console.log('   Agent:   agent@sachelpdesk.com / Admin@123');
    console.log('   Student: student@sachelpdesk.com / Admin@123');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('   1. Update backend/.env:');
    console.log('      MONGODB_URI=mongodb://localhost:27017/sac_helpdesk');
    console.log('   2. Start your backend server');
    console.log('   3. Login with test credentials');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Run initialization
initDatabase();
