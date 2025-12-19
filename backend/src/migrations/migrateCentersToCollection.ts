import mongoose from 'mongoose';
import { Project } from '../models/Project';
import { Center } from '../models/Center';
import { User } from '../models/User';

/**
 * Migration script to move offline centers from Project.configuration.ticketSubmissionSettings.offlineCenters
 * to the dedicated Centers collection
 */
async function migrateCentersToCollection() {
  try {
    // Get MongoDB URI from environment
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get the Super Admin user to use as creator
    const superAdmin = await User.findOne({ email: 'admin@helpdesk.gov.in' });
    if (!superAdmin) {
      throw new Error('Super Admin user not found');
    }
    console.log(`👤 Using Super Admin (${superAdmin.email}) as creator\n`);

    // Fetch all projects with offline centers
    const projects = await Project.find({
      'configuration.ticketSubmissionSettings.offlineCenters': { $exists: true, $ne: [] }
    });

    console.log(`📋 Found ${projects.length} projects with offline centers\n`);

    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const project of projects) {
      const offlineCenters = project.configuration?.ticketSubmissionSettings?.offlineCenters || [];
      
      if (offlineCenters.length === 0) continue;

      console.log(`\n📦 Processing project: ${project.name || project.projectId}`);
      console.log(`   Centers to migrate: ${offlineCenters.length}`);

      for (const centerData of offlineCenters) {
        try {
          // Check if center already exists
          const existingCenter = await Center.findOne({
            projectId: project._id,
            centerName: centerData.centerName,
          });

          if (existingCenter) {
            console.log(`   ⏭️  Skipped: "${centerData.centerName}" (already exists)`);
            totalSkipped++;
            continue;
          }

          // Create new center in collection
          await Center.create({
            projectId: project._id,
            centerName: centerData.centerName,
            address: centerData.address || '',
            city: centerData.city || '',
            state: centerData.state || '',
            pincode: centerData.pincode,
            phone: centerData.phone,
            email: centerData.email,
            workingHours: centerData.workingHours,
            latitude: centerData.latitude,
            longitude: centerData.longitude,
            features: centerData.features || [],
            mapLink: centerData.mapLink,
            googleMapLink: centerData.googleMapLink,
            contacts: centerData.contacts || [],
            isActive: true,
            createdBy: superAdmin._id,
          });

          console.log(`   ✅ Migrated: "${centerData.centerName}"`);
          totalMigrated++;

        } catch (error: any) {
          console.error(`   ❌ Error migrating "${centerData.centerName}":`, error.message);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${totalMigrated} centers`);
    console.log(`⏭️  Skipped (already exist): ${totalSkipped} centers`);
    console.log(`📦 Total projects processed: ${projects.length}`);
    
    // Verify the migration
    const totalCentersInDB = await Center.countDocuments();
    console.log(`\n🗄️  Total centers now in database: ${totalCentersInDB}`);
    
    console.log('\n✨ Migration completed successfully!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  // Load environment variables
  require('dotenv').config();
  
  migrateCentersToCollection()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export default migrateCentersToCollection;
