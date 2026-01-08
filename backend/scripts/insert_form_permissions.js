const mongoose = require('mongoose');

const formPerms = [
  { module: 'Form Builder', name: 'View Forms', code: 'FORM_VIEW', description: 'Can view all forms and their versions', category: 'form-builder', isActive: true },
  { module: 'Form Builder', name: 'Create Form', code: 'FORM_CREATE', description: 'Can create new forms', category: 'form-builder', isActive: true },
  { module: 'Form Builder', name: 'Edit Form', code: 'FORM_EDIT', description: 'Can edit forms and add new versions', category: 'form-builder', isActive: true },
  { module: 'Form Builder', name: 'Delete Form', code: 'FORM_DELETE', description: 'Can delete forms', category: 'form-builder', isActive: true },
  { module: 'Form Builder', name: 'Assign Form Context', code: 'FORM_ASSIGN_CONTEXT', description: 'Can map forms to roles, products, categories, or pages', category: 'form-builder', isActive: true },
  { module: 'Form Builder', name: 'View Form Audit Logs', code: 'FORM_VIEW_AUDIT_LOGS', description: 'Can view audit logs for form changes', category: 'form-builder', isActive: true },
];

async function run() {
  try{
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk');
    const db = mongoose.connection.db;
    const permissions = db.collection('permissions');
    const roles = db.collection('roles');

    const insertedIds = [];
    for (const p of formPerms) {
      const existing = await permissions.findOne({ code: p.code });
      if (existing) {
        console.log('Already exists:', p.code);
        insertedIds.push(existing._id);
      } else {
        const res = await permissions.insertOne(p);
        console.log('Inserted permission:', p.code);
        insertedIds.push(res.insertedId);
      }
    }

    // Roles to update
    const roleCodes = ['SUPER_ADMIN','ACCOUNT_OWNER','SUPPORT_ADMIN','SUPPORT_MANAGER'];
    for (const rc of roleCodes) {
      const role = await roles.findOne({ code: rc });
      if (!role) {
        console.log('Role not found:', rc);
        continue;
      }
      // Add permission ids to role.permissions if not present
      const toAdd = insertedIds.filter(id => !(role.permissions||[]).some(p => p.toString() === id.toString()));
      if (toAdd.length > 0) {
        await roles.updateOne({ _id: role._id }, { $addToSet: { permissions: { $each: toAdd } } });
        console.log(`Updated role ${rc}: added ${toAdd.length} permissions`);
      } else {
        console.log(`Role ${rc} already has all form permissions`);
      }
    }

    console.log('Done');
    await mongoose.disconnect();
    process.exit(0);
  }catch(err){
    console.error(err);
    process.exit(1);
  }
}

run();
