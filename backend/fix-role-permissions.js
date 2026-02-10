/**
 * Fix corrupted role permissions in MongoDB
 * Run with: node fix-role-permissions.js
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection string from .env
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk';

console.log('🔗 Connecting to:', MONGO_URI.replace(/:[^:@]+@/, ':****@'));

async function fixRolePermissions() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const rolesCollection = db.collection('roles');
    
    // Find all roles
    const roles = await rolesCollection.find({}).toArray();
    console.log(`📋 Found ${roles.length} roles to check`);
    
    let fixed = 0;
    let errors = 0;
    
    for (const role of roles) {
      try {
        if (!role.permissions || !Array.isArray(role.permissions)) {
          continue;
        }
        
        // Debug: Show first permission of each role
        if (role.permissions.length > 0) {
          const firstPerm = role.permissions[0];
          const permType = typeof firstPerm;
          const permValue = permType === 'string' ? firstPerm.substring(0, 100) : (firstPerm?._bsontype || 'object');
          console.log(`  ${role.name}: [0] type=${permType}, value=${permValue}`);
        }
        
        let needsFix = false;
        let fixedPermissions = [];
        
        for (const perm of role.permissions) {
          if (typeof perm === 'string') {
            // Check if it's a JSON string
            if (perm.startsWith('[') || perm.startsWith('"')) {
              needsFix = true;
              try {
                const parsed = JSON.parse(perm);
                if (Array.isArray(parsed)) {
                  // It's a JSON array string
                  for (const p of parsed) {
                    if (typeof p === 'string' && /^[0-9a-fA-F]{24}$/.test(p)) {
                      fixedPermissions.push(new ObjectId(p));
                    }
                  }
                } else if (typeof parsed === 'string' && /^[0-9a-fA-F]{24}$/.test(parsed)) {
                  fixedPermissions.push(new ObjectId(parsed));
                }
              } catch {
                // Not valid JSON, check if it's a plain ObjectId string
                if (/^[0-9a-fA-F]{24}$/.test(perm)) {
                  fixedPermissions.push(new ObjectId(perm));
                }
              }
            } else if (/^[0-9a-fA-F]{24}$/.test(perm)) {
              // Plain ObjectId string
              needsFix = true;
              fixedPermissions.push(new ObjectId(perm));
            }
          } else if (perm instanceof ObjectId || (perm && perm._bsontype === 'ObjectId')) {
            // Already an ObjectId
            fixedPermissions.push(perm);
          } else if (typeof perm === 'object' && perm._id) {
            // Populated permission object
            fixedPermissions.push(perm._id);
          }
        }
        
        if (needsFix) {
          // Remove duplicates
          const uniqueIds = [...new Set(fixedPermissions.map(p => p.toString()))];
          const finalPermissions = uniqueIds.map(id => new ObjectId(id));
          
          await rolesCollection.updateOne(
            { _id: role._id },
            { $set: { permissions: finalPermissions } }
          );
          
          console.log(`🔧 Fixed role "${role.name}": ${role.permissions.length} → ${finalPermissions.length} permissions`);
          fixed++;
        }
      } catch (err) {
        console.error(`❌ Error fixing role "${role.name}":`, err.message);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Total roles: ${roles.length}`);
    console.log(`   Fixed: ${fixed}`);
    console.log(`   Errors: ${errors}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

fixRolePermissions();
