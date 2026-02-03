/**
 * Fix User Role References Migration Script
 * ==========================================
 * This script fixes user documents where the 'role' field is stored as a string
 * (like "agent", "student") instead of a valid ObjectId reference.
 * 
 * SAFE EXECUTION:
 * 1. First run with DRY_RUN=true (default) to see what would be changed
 * 2. Review the output
 * 3. Run with DRY_RUN=false to apply changes
 * 
 * Usage:
 *   node fix-user-role-references.js          # Dry run (preview only)
 *   node fix-user-role-references.js --apply  # Apply changes
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Configuration
const DRY_RUN = !process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  dim: (msg) => console.log(`${colors.dim}${msg}${colors.reset}`),
};

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  Fix User Role References Migration');
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    log.warn('DRY RUN MODE - No changes will be made');
    log.info('Run with --apply flag to apply changes\n');
  } else {
    log.warn('LIVE MODE - Changes will be applied to the database\n');
  }

  try {
    // Connect to MongoDB
    log.info(`Connecting to MongoDB...`);
    await mongoose.connect(MONGODB_URI);
    log.success(`Connected to MongoDB`);
    log.dim(`  Database: ${mongoose.connection.db.databaseName}\n`);

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const rolesCollection = db.collection('roles');

    // Step 1: Find all roles and create a lookup map
    log.info('Loading roles from database...');
    const roles = await rolesCollection.find({}).toArray();
    log.success(`Found ${roles.length} roles`);
    
    // Create lookup maps for role code and name (case-insensitive)
    const roleByCode = {};
    const roleByName = {};
    roles.forEach(role => {
      if (role.code) {
        roleByCode[role.code.toLowerCase()] = role;
      }
      if (role.name) {
        roleByName[role.name.toLowerCase()] = role;
      }
    });

    // Step 2: Find users with string role values
    log.info('\nSearching for users with invalid role references...');
    
    // Find users where role is a string (not an ObjectId)
    const usersWithStringRole = await usersCollection.find({
      role: { $type: 'string' }
    }).toArray();

    if (usersWithStringRole.length === 0) {
      log.success('No users with string role values found. Database is clean!');
      await mongoose.disconnect();
      return;
    }

    log.warn(`Found ${usersWithStringRole.length} users with string role values\n`);

    // Step 3: Analyze and prepare fixes
    const fixes = [];
    const unfixable = [];

    console.log('Analyzing affected users:');
    console.log('-'.repeat(60));

    for (const user of usersWithStringRole) {
      const roleString = String(user.role).toLowerCase().trim();
      
      // Try to find matching role by code or name
      let matchedRole = roleByCode[roleString] || roleByName[roleString];
      
      // Also try some common variations
      if (!matchedRole) {
        // Try with underscores replaced by spaces
        const variations = [
          roleString.replace(/_/g, ' '),
          roleString.replace(/ /g, '_'),
          roleString.replace(/-/g, '_'),
          roleString.replace(/-/g, ' '),
        ];
        for (const variation of variations) {
          matchedRole = roleByCode[variation] || roleByName[variation];
          if (matchedRole) break;
        }
      }

      if (matchedRole) {
        fixes.push({
          userId: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          currentRole: user.role,
          newRoleId: matchedRole._id,
          newRoleName: matchedRole.name,
          newRoleCode: matchedRole.code,
        });
        log.success(`${user.email || user._id}`);
        log.dim(`    Current: "${user.role}" → New: ${matchedRole.name} (${matchedRole._id})`);
      } else {
        unfixable.push({
          userId: user._id,
          email: user.email,
          currentRole: user.role,
        });
        log.error(`${user.email || user._id}`);
        log.dim(`    Role "${user.role}" not found in roles collection`);
      }
    }

    console.log('\n' + '-'.repeat(60));
    console.log(`Summary:`);
    console.log(`  - Fixable: ${fixes.length} users`);
    console.log(`  - Unfixable: ${unfixable.length} users`);
    console.log('-'.repeat(60) + '\n');

    // Step 4: Apply fixes (if not dry run)
    if (!DRY_RUN && fixes.length > 0) {
      log.info('Creating backup of affected users...');
      
      // Create backup collection
      const backupCollectionName = `users_backup_${Date.now()}`;
      const backupCollection = db.collection(backupCollectionName);
      
      const userIdsToBackup = fixes.map(f => f.userId);
      const usersToBackup = await usersCollection.find({ 
        _id: { $in: userIdsToBackup } 
      }).toArray();
      
      if (usersToBackup.length > 0) {
        await backupCollection.insertMany(usersToBackup);
        log.success(`Backup created: ${backupCollectionName} (${usersToBackup.length} documents)`);
      }

      log.info('\nApplying fixes...');
      let successCount = 0;
      let errorCount = 0;

      for (const fix of fixes) {
        try {
          await usersCollection.updateOne(
            { _id: fix.userId },
            { $set: { role: fix.newRoleId } }
          );
          successCount++;
        } catch (err) {
          log.error(`Failed to update ${fix.email}: ${err.message}`);
          errorCount++;
        }
      }

      console.log('\n' + '='.repeat(60));
      log.success(`Migration complete!`);
      console.log(`  - Updated: ${successCount} users`);
      console.log(`  - Failed: ${errorCount} users`);
      console.log(`  - Backup: ${backupCollectionName}`);
      console.log('='.repeat(60) + '\n');
    } else if (DRY_RUN && fixes.length > 0) {
      console.log('\n' + '='.repeat(60));
      log.warn('DRY RUN COMPLETE - No changes were made');
      log.info(`Run with --apply flag to fix ${fixes.length} users`);
      console.log('='.repeat(60) + '\n');
    }

    // Report unfixable users
    if (unfixable.length > 0) {
      console.log('\n' + colors.yellow + 'ATTENTION: Unfixable users' + colors.reset);
      console.log('The following users have role values that don\'t match any role:');
      for (const user of unfixable) {
        console.log(`  - ${user.email || user.userId}: "${user.currentRole}"`);
      }
      console.log('\nYou may need to manually assign roles to these users.\n');
    }

    await mongoose.disconnect();
    log.success('Disconnected from MongoDB');

  } catch (error) {
    log.error(`Migration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
