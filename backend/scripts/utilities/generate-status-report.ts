import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Permission } from './src/models/Permission';
import { Role } from './src/models/Role';
import { User } from './src/models/User';

dotenv.config();

const generateStatusReport = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected\n');

    // Get all permissions grouped by module
    const permissions = await Permission.find({}).sort({ module: 1, code: 1 }).lean();
    const byModule: Record<string, any[]> = {};
    
    permissions.forEach(perm => {
      const module = perm.module || 'Other';
      if (!byModule[module]) byModule[module] = [];
      byModule[module].push(perm);
    });

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('   SAC HELPDESK - RBAC PERMISSION IMPLEMENTATION STATUS REPORT');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    console.log(`📊 OVERALL STATISTICS`);
    console.log(`   Total Permissions: ${permissions.length}`);
    console.log(`   Total Modules: ${Object.keys(byModule).length}`);
    console.log(`   Implemented UI: 16 (13%)`);
    console.log(`   Missing UI: ${permissions.length - 16} (87%)\n`);

    // Group modules by priority
    const coreModules = ['TICKETS', 'DASHBOARD', 'KNOWLEDGE BASE', 'USER MANAGEMENT', 'PROJECT MANAGEMENT', 'RBAC SETUP', 'MASTER DATA'];
    const advancedModules = ['SLA & ESCALATION', 'TICKET AUTOMATION', 'APPROVAL PROCESS', 'WORKFLOW & ROLE MAPPING'];
    const specializedModules = ['OFFLINE MODULE', 'FORM BUILDER', 'FIELDS & FORMS', 'INTEGRATIONS', 'AUDIT LOGS', 'PREDEFINED REPORTS', 'TICKET CONFIGURATION'];

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('   CORE MODULES (Priority 0-1)');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    let coreImplemented = 0;
    let coreTotal = 0;

    coreModules.forEach(moduleName => {
      if (byModule[moduleName]) {
        const perms = byModule[moduleName];
        const implemented = perms.filter(p => 
          ['TICKET_VIEW_ALL', 'TICKET_VIEW_OWN', 'TICKET_CREATE', 'TICKET_EDIT', 'TICKET_DELETE', 
           'TICKET_ASSIGN', 'TICKET_BULK_UPDATE', 'TICKET_CHANGE_STATUS', 'TICKET_CHANGE_PRIORITY',
           'DASHBOARD_VIEW', 'KB_VIEW', 'KB_CREATE', 'USER_VIEW_ALL', 'PROJECT_VIEW_ALL', 
           'RBAC_VIEW_ROLES', 'MASTER_DATA_VIEW'].includes(p.code)
        ).length;
        
        coreImplemented += implemented;
        coreTotal += perms.length;

        const percentage = Math.round((implemented / perms.length) * 100);
        const status = percentage === 0 ? '❌' : percentage < 50 ? '⚠️' : percentage < 100 ? '🔄' : '✅';
        
        console.log(`${status} ${moduleName} (${implemented}/${perms.length} - ${percentage}%)`);
        
        if (percentage < 100) {
          const missing = perms.filter(p => 
            !['TICKET_VIEW_ALL', 'TICKET_VIEW_OWN', 'TICKET_CREATE', 'TICKET_EDIT', 'TICKET_DELETE', 
              'TICKET_ASSIGN', 'TICKET_BULK_UPDATE', 'TICKET_CHANGE_STATUS', 'TICKET_CHANGE_PRIORITY',
              'DASHBOARD_VIEW', 'KB_VIEW', 'KB_CREATE', 'USER_VIEW_ALL', 'PROJECT_VIEW_ALL', 
              'RBAC_VIEW_ROLES', 'MASTER_DATA_VIEW'].includes(p.code)
          );
          console.log(`   Missing: ${missing.slice(0, 3).map(p => p.code).join(', ')}${missing.length > 3 ? '...' : ''}\n`);
        } else {
          console.log('');
        }
      }
    });

    console.log(`Core Modules Summary: ${coreImplemented}/${coreTotal} (${Math.round((coreImplemented/coreTotal)*100)}%)\n`);

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('   IMPLEMENTATION PLAN - NEXT 4 WEEKS');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    console.log('📅 WEEK 1 (Current - High Priority)');
    console.log('   1. Fix Shubhangi login - Ensure Tickets module shows');
    console.log('   2. Complete TicketsModule:');
    console.log('      - Add TICKET_ADD_COMMENT - Comment section');
    console.log('      - Add TICKET_ADD_ATTACHMENT - File upload');
    console.log('      - Add TICKET_EXPORT - Export to CSV');
    console.log('      - Add TICKET_MERGE - Merge modal');
    console.log('   3. Complete DashboardModule:');
    console.log('      - DASHBOARD_VIEW_ANALYTICS - Charts & metrics');
    console.log('      - DASHBOARD_EXPORT - Export data\n');

    console.log('📅 WEEK 2');
    console.log('   1. Complete Knowledge Base:');
    console.log('      - KB_EDIT - Article editor');
    console.log('      - KB_DELETE - Delete articles');
    console.log('      - KB_PUBLISH - Publish/unpublish');
    console.log('      - KB_MANAGE_CATEGORIES - Category management');
    console.log('   2. Complete User Management:');
    console.log('      - USER_CREATE - Create user form');
    console.log('      - USER_EDIT - Edit user form');
    console.log('      - USER_DELETE - Delete users');
    console.log('      - USER_RESET_PASSWORD - Reset password\n');

    console.log('📅 WEEK 3');
    console.log('   1. Complete Project Management');
    console.log('   2. Complete RBAC Setup');
    console.log('   3. Complete Master Data Management\n');

    console.log('📅 WEEK 4');
    console.log('   1. SLA & Escalation');
    console.log('   2. Ticket Automation');
    console.log('   3. Approval Process\n');

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('   CURRENT USER: Shubhangi Mathur (Center Manager)');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    const user = await User.findOne({ email: /shubhangi/i }).lean();
    if (user) {
      const role = await Role.findById(user.role).lean();
      if (role) {
        const rolePerms = await Permission.find({ _id: { $in: role.permissions } }).lean();
        
        console.log(`👤 Name: ${user.firstName} ${user.lastName}`);
        console.log(`📧 Email: ${user.email}`);
        console.log(`👔 Role: ${role.name} (${role.code})`);
        console.log(`🔐 Permissions: ${rolePerms.length}\n`);

        console.log(`Assigned Permissions:`);
        rolePerms.forEach((perm, i) => {
          console.log(`   ${i + 1}. ${perm.code}`);
        });

        console.log(`\n📋 Expected Menu Access:`);
        console.log(`   ✅ Dashboard (has DASHBOARD_VIEW)`);
        console.log(`   ✅ Tickets (has TICKET_VIEW_ALL)`);
        console.log(`   ❌ Knowledge Base (no KB permissions)`);
        console.log(`   ❌ Users (no USER permissions)`);
        console.log(`   ❌ Projects (no PROJECT permissions)`);
        console.log(`   ❌ Master Data (no MASTER_DATA permissions)`);
        console.log(`   ❌ RBAC (no RBAC permissions)`);
        console.log(`   ❌ Settings (no SETTINGS permissions)\n`);

        console.log(`⚠️  ACTION REQUIRED:`);
        console.log(`   1. Shubhangi needs to LOGOUT and LOGIN again`);
        console.log(`   2. This will refresh the JWT token with permission codes`);
        console.log(`   3. After login, she should see Dashboard + Tickets modules`);
        console.log(`   4. Check browser console (F12) for debug logs\n`);
      }
    }

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('   IMMEDIATE TASKS');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    console.log(`1. ✅ Build shared components (PermissionGate, Modal) - DONE`);
    console.log(`2. 🔄 Debug Shubhangi's login - IN PROGRESS`);
    console.log(`3. ⏳ Complete TicketsModule missing features`);
    console.log(`4. ⏳ Build DashboardModule with analytics`);
    console.log(`5. ⏳ Continue with Week 2-4 plan\n`);

    console.log('═══════════════════════════════════════════════════════════════════\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

generateStatusReport();
