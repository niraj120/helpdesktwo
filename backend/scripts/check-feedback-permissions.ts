import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import models
import { Permission } from '../src/models/Permission';

async function checkFeedbackPermissions() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB Connected');

    // Check all permissions
    const totalCount = await Permission.countDocuments();
    console.log(`\n📊 Total permissions in database: ${totalCount}`);

    // Check feedback permissions specifically
    const feedbackPermissions = await Permission.find({
      code: { $regex: /^FEEDBACK_/i }
    }).sort({ code: 1 });

    console.log(`\n🔍 Feedback permissions found: ${feedbackPermissions.length}`);
    
    if (feedbackPermissions.length > 0) {
      console.log('\n📋 Feedback Permission Details:');
      feedbackPermissions.forEach(perm => {
        console.log(`   - ${perm.code}`);
        console.log(`     Name: ${perm.name}`);
        console.log(`     Module: ${perm.module}`);
        console.log(`     Category: ${perm.category}`);
        console.log(`     Active: ${perm.isActive}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No feedback permissions found in database!');
    }

    // Check permissions by category 'feedback'
    const feedbackCategoryPerms = await Permission.find({ category: 'feedback' });
    console.log(`\n🏷️  Permissions with category='feedback': ${feedbackCategoryPerms.length}`);

    // Show all categories
    const categories = await Permission.distinct('category');
    console.log(`\n📂 All permission categories in database (${categories.length}):`);
    categories.sort().forEach(cat => console.log(`   - ${cat}`));

    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkFeedbackPermissions();
