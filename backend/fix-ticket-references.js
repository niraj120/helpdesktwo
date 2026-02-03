/**
 * Migration Script: Fix Ticket Reference Data
 * 
 * This script fixes tickets where:
 * 1. metadata.projectId is stored as string instead of ObjectId
 * 2. category is stored as string instead of ObjectId
 * 
 * Usage:
 *   DRY RUN (default): node fix-ticket-references.js
 *   APPLY CHANGES:     node fix-ticket-references.js --apply
 */

const mongoose = require('mongoose');
require('dotenv').config();

const DRY_RUN = !process.argv.includes('--apply');

async function fixTicketReferences() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');
    
    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No changes will be made');
      console.log('   Run with --apply to make changes\n');
    } else {
      console.log('⚠️  APPLY MODE - Changes will be made to the database\n');
    }

    const ticketsCollection = mongoose.connection.db.collection('tickets');

    // 1. Fix metadata.projectId stored as strings
    console.log('=== Checking metadata.projectId ===');
    const ticketsWithStringProjectId = await ticketsCollection.find({
      'metadata.projectId': { $type: 'string' }
    }).toArray();
    
    console.log(`Found ${ticketsWithStringProjectId.length} tickets with string projectId`);
    
    let projectIdFixed = 0;
    let projectIdFailed = 0;
    
    for (const ticket of ticketsWithStringProjectId) {
      const stringId = ticket.metadata.projectId;
      
      // Check if it's a valid ObjectId string
      if (mongoose.Types.ObjectId.isValid(stringId) && stringId.length === 24) {
        if (!DRY_RUN) {
          await ticketsCollection.updateOne(
            { _id: ticket._id },
            { $set: { 'metadata.projectId': new mongoose.Types.ObjectId(stringId) } }
          );
        }
        console.log(`  ✓ ${ticket.ticketNumber}: projectId converted`);
        projectIdFixed++;
      } else {
        console.log(`  ✗ ${ticket.ticketNumber}: Invalid projectId "${stringId}"`);
        projectIdFailed++;
      }
    }
    
    console.log(`\nProjectId: ${projectIdFixed} fixed, ${projectIdFailed} failed\n`);

    // 2. Fix category stored as strings
    console.log('=== Checking category ===');
    const ticketsWithStringCategory = await ticketsCollection.find({
      category: { $type: 'string' }
    }).toArray();
    
    console.log(`Found ${ticketsWithStringCategory.length} tickets with string category`);
    
    // Load categories for name-based lookup
    const categoriesCollection = mongoose.connection.db.collection('categories');
    const allCategories = await categoriesCollection.find({}).toArray();
    const categoryNameMap = new Map();
    allCategories.forEach(c => {
      categoryNameMap.set(c.name?.toLowerCase(), c._id);
    });
    
    let categoryFixed = 0;
    let categoryFailed = 0;
    
    for (const ticket of ticketsWithStringCategory) {
      const stringId = ticket.category;
      
      // Check if it's a valid ObjectId string
      if (mongoose.Types.ObjectId.isValid(stringId) && stringId.length === 24) {
        if (!DRY_RUN) {
          await ticketsCollection.updateOne(
            { _id: ticket._id },
            { $set: { category: new mongoose.Types.ObjectId(stringId) } }
          );
        }
        console.log(`  ✓ ${ticket.ticketNumber}: category converted (ObjectId)`);
        categoryFixed++;
      } else {
        // Try to find category by name
        const categoryId = categoryNameMap.get(stringId?.toLowerCase());
        if (categoryId) {
          if (!DRY_RUN) {
            await ticketsCollection.updateOne(
              { _id: ticket._id },
              { $set: { category: categoryId } }
            );
          }
          console.log(`  ✓ ${ticket.ticketNumber}: category "${stringId}" → found by name`);
          categoryFixed++;
        } else {
          // Set to null if category doesn't exist
          if (!DRY_RUN) {
            await ticketsCollection.updateOne(
              { _id: ticket._id },
              { $set: { category: null } }
            );
          }
          console.log(`  ⚠ ${ticket.ticketNumber}: category "${stringId}" not found → set to null`);
          categoryFailed++;
        }
      }
    }
    
    console.log(`\nCategory: ${categoryFixed} fixed, ${categoryFailed} set to null\n`);

    // 3. Fix metadata.centerId stored as strings (but skip 'online')
    console.log('=== Checking metadata.centerId ===');
    const ticketsWithStringCenterId = await ticketsCollection.find({
      'metadata.centerId': { $type: 'string', $ne: 'online' }
    }).toArray();
    
    console.log(`Found ${ticketsWithStringCenterId.length} tickets with string centerId (excluding 'online')`);
    
    let centerIdFixed = 0;
    let centerIdFailed = 0;
    
    for (const ticket of ticketsWithStringCenterId) {
      const stringId = ticket.metadata.centerId;
      
      // Check if it's a valid ObjectId string (skip 'online' and other special values)
      if (mongoose.Types.ObjectId.isValid(stringId) && stringId.length === 24) {
        if (!DRY_RUN) {
          await ticketsCollection.updateOne(
            { _id: ticket._id },
            { $set: { 'metadata.centerId': new mongoose.Types.ObjectId(stringId) } }
          );
        }
        console.log(`  ✓ ${ticket.ticketNumber}: centerId converted`);
        centerIdFixed++;
      } else {
        console.log(`  ✗ ${ticket.ticketNumber}: Invalid/special centerId "${stringId}"`);
        centerIdFailed++;
      }
    }
    
    console.log(`\nCenterId: ${centerIdFixed} fixed, ${centerIdFailed} skipped\n`);

    // Summary
    console.log('=== SUMMARY ===');
    console.log(`ProjectId:  ${projectIdFixed} fixed, ${projectIdFailed} failed`);
    console.log(`Category:   ${categoryFixed} fixed, ${categoryFailed} failed`);
    console.log(`CenterId:   ${centerIdFixed} fixed, ${centerIdFailed} skipped`);
    
    if (DRY_RUN) {
      console.log('\n📝 This was a DRY RUN. No changes were made.');
      console.log('   Run with --apply to apply changes.');
    } else {
      console.log('\n✓ Migration complete!');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixTicketReferences();
