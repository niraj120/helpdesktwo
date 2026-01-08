import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Permission } from './src/models/Permission';

dotenv.config();

const auditAllPermissions = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected\n');

    // Get all permissions
    const permissions = await Permission.find({}).sort({ module: 1, code: 1 }).lean();

    console.log(`=== ALL PERMISSIONS IN DATABASE (${permissions.length} total) ===\n`);

    // Group by module
    const byModule: Record<string, any[]> = {};
    
    permissions.forEach(perm => {
      const module = perm.module || 'Other';
      if (!byModule[module]) {
        byModule[module] = [];
      }
      byModule[module].push(perm);
    });

    // Print by module
    Object.keys(byModule).sort().forEach(module => {
      console.log(`\n📁 ${module.toUpperCase()} Module (${byModule[module].length} permissions):`);
      console.log('─'.repeat(80));
      
      byModule[module].forEach((perm, index) => {
        console.log(`${index + 1}. ${perm.code}`);
        console.log(`   Name: ${perm.name}`);
        console.log(`   Description: ${perm.description || 'N/A'}`);
      });
    });

    // Now check which permissions have UI implementation
    console.log('\n\n=== UI IMPLEMENTATION STATUS ===\n');

    const uiMapping: Record<string, {
      hasUI: boolean;
      location: string;
      notes: string;
    }> = {
      // Dashboard
      'DASHBOARD_VIEW': { hasUI: true, location: 'ProjectAgentAdminPortal.tsx - DashboardModule', notes: 'Basic dashboard with stats' },
      'DASHBOARD_VIEW_ANALYTICS': { hasUI: false, location: '', notes: 'Analytics not implemented yet' },
      'DASHBOARD_EXPORT': { hasUI: false, location: '', notes: 'Export button not implemented' },
      
      // Tickets
      'TICKET_VIEW_ALL': { hasUI: true, location: 'TicketsModule.tsx - Ticket list', notes: 'Shows all tickets' },
      'TICKET_VIEW_OWN': { hasUI: true, location: 'TicketsModule.tsx - Ticket list', notes: 'Shows only own tickets' },
      'TICKET_CREATE': { hasUI: true, location: 'TicketsModule.tsx - Create Ticket button', notes: 'Create ticket button' },
      'TICKET_EDIT': { hasUI: true, location: 'TicketsModule.tsx - Edit action', notes: 'Edit button in ticket row' },
      'TICKET_DELETE': { hasUI: true, location: 'TicketsModule.tsx - Delete action', notes: 'Delete button in bulk toolbar' },
      'TICKET_ASSIGN': { hasUI: true, location: 'TicketsModule.tsx - Assign modal', notes: 'Assign button + modal with agent dropdown' },
      'TICKET_COMMENT': { hasUI: false, location: '', notes: 'Comment functionality not in TicketsModule' },
      'TICKET_VIEW_COMMENTS': { hasUI: false, location: '', notes: 'Comments not shown in TicketsModule' },
      'TICKET_CHANGE_STATUS': { hasUI: true, location: 'TicketsModule.tsx - Bulk toolbar', notes: 'Change status dropdown in bulk mode' },
      'TICKET_CHANGE_PRIORITY': { hasUI: true, location: 'TicketsModule.tsx - Bulk toolbar', notes: 'Change priority dropdown in bulk mode' },
      'TICKET_BULK_UPDATE': { hasUI: true, location: 'TicketsModule.tsx - Bulk Actions', notes: 'Bulk toolbar with select all' },
      'TICKET_MERGE': { hasUI: false, location: '', notes: 'Merge modal not implemented' },
      'TICKET_EXPORT': { hasUI: false, location: '', notes: 'Export button not implemented' },
      
      // Knowledge Base
      'KB_VIEW': { hasUI: true, location: 'KnowledgeBaseModule (placeholder)', notes: 'Basic KB view, needs full implementation' },
      'KB_CREATE': { hasUI: true, location: 'KnowledgeBaseModule - Create button', notes: 'Create Article button shown' },
      'KB_EDIT': { hasUI: false, location: '', notes: 'Edit UI not implemented' },
      'KB_DELETE': { hasUI: false, location: '', notes: 'Delete UI not implemented' },
      'KB_PUBLISH': { hasUI: false, location: '', notes: 'Publish/Unpublish not implemented' },
      
      // Users
      'USER_VIEW_ALL': { hasUI: true, location: 'UserManagementModule (placeholder)', notes: 'Basic user view, needs full implementation' },
      'USER_CREATE': { hasUI: false, location: '', notes: 'Create user form not implemented' },
      'USER_EDIT': { hasUI: false, location: '', notes: 'Edit user form not implemented' },
      'USER_DELETE': { hasUI: false, location: '', notes: 'Delete user button not implemented' },
      'USER_RESET_PASSWORD': { hasUI: false, location: '', notes: 'Reset password button not implemented' },
      'USER_MANAGE_GROUPS': { hasUI: false, location: '', notes: 'Group management not implemented' },
      
      // Projects
      'PROJECT_VIEW_ALL': { hasUI: true, location: 'ProjectsModule (placeholder)', notes: 'Basic project view, needs full implementation' },
      'PROJECT_CREATE': { hasUI: false, location: '', notes: 'Create project form not implemented' },
      'PROJECT_EDIT': { hasUI: false, location: '', notes: 'Edit project form not implemented' },
      'PROJECT_DELETE': { hasUI: false, location: '', notes: 'Delete project button not implemented' },
      'PROJECT_MANAGE_SETTINGS': { hasUI: false, location: '', notes: 'Project settings not implemented' },
      
      // Master Data
      'MASTER_DATA_VIEW': { hasUI: true, location: 'MasterDataModule (placeholder)', notes: 'Basic master data view, needs full implementation' },
      'MASTER_DATA_MANAGE_CATEGORIES': { hasUI: false, location: '', notes: 'Category management not implemented' },
      'MASTER_DATA_MANAGE_STATUSES': { hasUI: false, location: '', notes: 'Status management not implemented' },
      'MASTER_DATA_MANAGE_PRIORITIES': { hasUI: false, location: '', notes: 'Priority management not implemented' },
      
      // RBAC
      'RBAC_VIEW_ROLES': { hasUI: true, location: 'RBACModule (placeholder)', notes: 'Basic RBAC view, needs full implementation' },
      'RBAC_CREATE_ROLE': { hasUI: false, location: '', notes: 'Create role form not implemented' },
      'RBAC_EDIT_ROLE': { hasUI: false, location: '', notes: 'Edit role form not implemented' },
      'RBAC_DELETE_ROLE': { hasUI: false, location: '', notes: 'Delete role button not implemented' },
      'RBAC_ASSIGN_PERMISSIONS': { hasUI: false, location: '', notes: 'Permission assignment UI not implemented' },
      
      // Settings
      'SYSTEM_SETTINGS_VIEW': { hasUI: true, location: 'SettingsModule (placeholder)', notes: 'Basic settings view, needs full implementation' },
      'SYSTEM_SETTINGS_EDIT': { hasUI: false, location: '', notes: 'Settings edit form not implemented' },
    };

    let implemented = 0;
    let notImplemented = 0;

    permissions.forEach(perm => {
      const ui = uiMapping[perm.code];
      if (ui) {
        if (ui.hasUI) {
          console.log(`✅ ${perm.code}`);
          console.log(`   📍 ${ui.location}`);
          console.log(`   📝 ${ui.notes}\n`);
          implemented++;
        } else {
          console.log(`❌ ${perm.code}`);
          console.log(`   ⚠️  ${ui.notes}\n`);
          notImplemented++;
        }
      } else {
        console.log(`⚪ ${perm.code}`);
        console.log(`   ⚠️  Not in mapping (new permission?)\n`);
        notImplemented++;
      }
    });

    console.log('\n=== SUMMARY ===');
    console.log(`Total Permissions: ${permissions.length}`);
    console.log(`✅ Has UI: ${implemented} (${Math.round(implemented / permissions.length * 100)}%)`);
    console.log(`❌ Missing UI: ${notImplemented} (${Math.round(notImplemented / permissions.length * 100)}%)`);

    console.log('\n=== CRITICAL MISSING UI COMPONENTS ===');
    console.log('1. TICKET_MERGE - Merge tickets modal');
    console.log('2. TICKET_EXPORT - Export tickets to CSV/Excel');
    console.log('3. TICKET_COMMENT - Add comments to tickets');
    console.log('4. USER_CREATE/EDIT/DELETE - Full user management');
    console.log('5. PROJECT_CREATE/EDIT/DELETE - Full project management');
    console.log('6. MASTER_DATA management - Categories, Statuses, Priorities');
    console.log('7. RBAC management - Create/Edit/Delete roles');

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

auditAllPermissions();
