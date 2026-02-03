require('dotenv').config();
const mongoose = require('mongoose');

async function diagnose() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const KBTable = mongoose.model('KBTable', new mongoose.Schema({}, { strict: false }), 'kbtables');
    const KBArticle = mongoose.model('KBArticle', new mongoose.Schema({}, { strict: false }), 'kbarticles');

    // Step 1: Find the table
    console.log('=== STEP 1: Finding Notices Table ===');
    const table = await KBTable.findOne({ tableName: 'Notices' });
    
    if (!table) {
      console.log('❌ Notices table NOT FOUND!');
      console.log('\nLet me check all tables:');
      const allTables = await KBTable.find({}, 'tableName');
      console.log('All tables:', allTables.map(t => t.tableName));
      await mongoose.connection.close();
      return;
    }

    console.log('✅ Found Notices table');
    console.log('Table ID:', table._id);
    console.log('Columns:', table.columns.map(c => c.columnName).join(', '));

    // Step 2: Check View column
    console.log('\n=== STEP 2: Checking View Column ===');
    const viewColumn = table.columns.find(c => c.columnName === 'View');
    
    if (!viewColumn) {
      console.log('❌ View column NOT FOUND!');
      await mongoose.connection.close();
      return;
    }

    console.log('✅ Found View column');
    console.log('Article Field Mapping:', JSON.stringify(viewColumn.articleFieldMapping));
    console.log('Has htmlContent in mapping:', viewColumn.articleFieldMapping.includes('htmlContent'));

    // Step 3: Check the article
    console.log('\n=== STEP 3: Checking Article "All Courses" ===');
    const article = await KBArticle.findOne({ courseName: 'All Courses' });
    
    if (!article) {
      console.log('❌ Article "All Courses" NOT FOUND!');
      await mongoose.connection.close();
      return;
    }

    console.log('✅ Found article');
    console.log('Article ID:', article._id);
    console.log('Has htmlContent:', !!article.htmlContent, article.htmlContent ? `(${article.htmlContent.length} chars)` : '');
    console.log('Has pdfUrl:', !!article.pdfUrl, article.pdfUrl || '');
    console.log('Has externalUrl:', !!article.externalUrl, article.externalUrl || '');

    // Step 4: Simulate backend logic
    console.log('\n=== STEP 4: Simulating Backend Logic ===');
    const fieldMapping = viewColumn.articleFieldMapping || [];
    console.log('Field mapping array:', fieldMapping);
    
    let viewValue = 'N/A';
    for (const field of fieldMapping) {
      console.log(`  Checking field: "${field}"`);
      
      if (field === 'externalUrl') {
        if (article.externalUrl) {
          viewValue = article.externalUrl;
          console.log(`    ✅ Found externalUrl: ${viewValue}`);
          break;
        } else {
          console.log(`    ❌ No externalUrl`);
        }
      } else if (field === 'pdfUrl') {
        if (article.pdfUrl) {
          viewValue = article.pdfUrl;
          console.log(`    ✅ Found pdfUrl: ${viewValue}`);
          break;
        } else {
          console.log(`    ❌ No pdfUrl`);
        }
      } else if (field === 'htmlContent') {
        if (article.htmlContent) {
          viewValue = `/kb/articles/${article._id}`;
          console.log(`    ✅ Found htmlContent, generated URL: ${viewValue}`);
          break;
        } else {
          console.log(`    ❌ No htmlContent`);
        }
      }
    }

    console.log('\n=== FINAL RESULT ===');
    console.log('Expected View Value:', viewValue);
    
    if (viewValue === 'N/A') {
      console.log('\n❌ PROBLEM IDENTIFIED:');
      if (!fieldMapping.includes('htmlContent')) {
        console.log('   - htmlContent is NOT in the field mapping array!');
      } else if (!article.htmlContent) {
        console.log('   - Article does NOT have htmlContent field!');
      } else {
        console.log('   - Unknown issue - check the logic!');
      }
    } else {
      console.log('\n✅ VIEW SHOULD WORK!');
      console.log('   The database is configured correctly.');
      console.log('   The backend should return:', viewValue);
    }

    await mongoose.connection.close();
    console.log('\n✅ Disconnected');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

diagnose();
