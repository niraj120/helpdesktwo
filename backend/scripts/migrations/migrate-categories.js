/**
 * Migration script to move categories from project configuration to Category master table
 * Run this script once to migrate existing data
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const categorySchema = new mongoose.Schema({
  name: String,
  description: String,
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  isActive: { type: Boolean, default: true },
  color: String,
  icon: String,
  order: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

async function migrateCategories() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const projectsCollection = db.collection('projects');
    
    // Find all projects
    const projects = await projectsCollection.find({}).toArray();
    console.log(`📋 Found ${projects.length} projects`);

    let totalCategoriesCreated = 0;
    let totalCategoriesSkipped = 0;

    for (const project of projects) {
      console.log(`\n🔍 Processing project: ${project.name} (${project._id})`);
      
      // Extract categories from onlineFormFields
      const categoryField = project.configuration?.ticketSubmissionSettings?.onlineFormFields?.find(
        field => field.fieldName === 'Category'
      );

      if (!categoryField || !categoryField.options || categoryField.options.length === 0) {
        console.log(`  ⚠️  No categories found in project configuration`);
        continue;
      }

      console.log(`  📦 Found ${categoryField.options.length} categories: ${categoryField.options.join(', ')}`);

      // Create categories in Category master table
      for (let i = 0; i < categoryField.options.length; i++) {
        const categoryName = categoryField.options[i];
        
        // Check if category already exists
        const existingCategory = await Category.findOne({
          name: categoryName,
          projectId: project._id
        });

        if (existingCategory) {
          console.log(`  ⏭️  Category "${categoryName}" already exists, skipping`);
          totalCategoriesSkipped++;
          continue;
        }

        // Create new category
        const category = new Category({
          name: categoryName,
          projectId: project._id,
          isActive: true,
          order: i,
          description: `${categoryName} category for ${project.name}`,
        });

        await category.save();
        console.log(`  ✅ Created category: ${categoryName}`);
        totalCategoriesCreated++;
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`  ✅ Categories created: ${totalCategoriesCreated}`);
    console.log(`  ⏭️  Categories skipped (already exist): ${totalCategoriesSkipped}`);
    console.log(`  📋 Total processed: ${totalCategoriesCreated + totalCategoriesSkipped}`);

    await mongoose.connection.close();
    console.log('\n✅ Migration completed successfully');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateCategories();
