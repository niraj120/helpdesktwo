require('dotenv').config();
const mongoose = require('mongoose');

async function fixAndVerify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const KBTable = mongoose.model('KBTable', new mongoose.Schema({}, { strict: false }), 'kbtables');
    const KBArticle = mongoose.model('KBArticle', new mongoose.Schema({}, { strict: false }), 'kbarticles');

    // Fix the View column mapping
    console.log('=== FIXING VIEW COLUMN ===');
    const table = await KBTable.findOne({ tableName: 'Notices' });
    
    if (!table) {
      console.log('❌ Notices table not found');
      await mongoose.connection.close();
      return;
    }

    const viewColumn = table.columns.find(c => c.columnName === 'View');
    
    if (!viewColumn) {
      console.log('❌ View column not found');
      await mongoose.connection.close();
      return;
    }

    console.log('Before:', viewColumn.articleFieldMapping);
    
    // Update the mapping
    viewColumn.articleFieldMapping = ['externalUrl', 'pdfUrl', 'htmlContent'];
    
    // Save the table
    await table.save();
    
    console.log('After:', viewColumn.articleFieldMapping);
    console.log('✅ View column updated!\n');

    // Now find articles with HTML content
    console.log('=== FINDING HTML ARTICLES ===');
    const htmlArticles = await KBArticle.find({ 
      htmlContent: { $exists: true, $ne: null, $ne: '' },
      pdfUrl: { $exists: false },
      externalUrl: { $exists: false }
    }, 'courseName subject htmlContent');
    
    console.log(`Found ${htmlArticles.length} HTML-only articles:`);
    htmlArticles.forEach((art, idx) => {
      const subject = art.subject ? art.subject.substring(0, 60) : 'No subject';
      console.log(`${idx + 1}. "${art.courseName}" - ${subject}...`);
      console.log(`   HTML length: ${art.htmlContent?.length || 0} chars`);
      console.log(`   ID: ${art._id}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

fixAndVerify();
