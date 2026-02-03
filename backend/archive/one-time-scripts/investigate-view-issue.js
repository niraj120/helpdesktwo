const mongoose = require('mongoose');
require('dotenv').config();

// Define schemas
const KBTableSchema = new mongoose.Schema({}, { strict: false, collection: 'kbtables' });
const KBArticleSchema = new mongoose.Schema({}, { strict: false, collection: 'kbarticles' });

const KBTable = mongoose.model('KBTable', KBTableSchema);
const KBArticle = mongoose.model('KBArticle', KBArticleSchema);

async function investigate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Check the table configuration
    console.log('=== STEP 1: Checking Notices Table Configuration ===');
    const table = await KBTable.findOne({ name: 'Notices' });
    
    if (!table) {
      console.log('❌ Notices table not found!');
      return;
    }

    const viewColumn = table.columns?.find(col => col.name === 'View');
    console.log('View Column Configuration:');
    console.log(JSON.stringify(viewColumn, null, 2));
    console.log('\n');

    // 2. Check the actual article
    console.log('=== STEP 2: Checking "All Courses" Article ===');
    const article = await KBArticle.findOne({ courseName: 'All Courses' });
    
    if (!article) {
      console.log('❌ Article "All Courses" not found!');
      return;
    }

    console.log('Article Data:');
    console.log({
      _id: article._id,
      courseName: article.courseName,
      subject: article.subject,
      hasHtmlContent: !!article.htmlContent,
      htmlContentLength: article.htmlContent?.length || 0,
      hasPdfUrl: !!article.pdfUrl,
      pdfUrl: article.pdfUrl,
      hasExternalUrl: !!article.externalUrl,
      externalUrl: article.externalUrl,
      publishedDate: article.publishedDate
    });
    console.log('\n');

    // 3. Simulate what the backend does
    console.log('=== STEP 3: Simulating Backend Logic ===');
    const fieldMapping = viewColumn?.articleFieldMapping || [];
    console.log('Field mapping priority:', fieldMapping);
    
    let viewValue = null;
    for (const field of fieldMapping) {
      if (field === 'externalUrl' && article.externalUrl) {
        viewValue = article.externalUrl;
        console.log(`✅ Found externalUrl: ${viewValue}`);
        break;
      } else if (field === 'pdfUrl' && article.pdfUrl) {
        viewValue = article.pdfUrl;
        console.log(`✅ Found pdfUrl: ${viewValue}`);
        break;
      } else if (field === 'htmlContent' && article.htmlContent) {
        viewValue = `/kb/articles/${article._id}`;
        console.log(`✅ Found htmlContent, generated URL: ${viewValue}`);
        break;
      }
    }

    if (!viewValue) {
      console.log('❌ No value found for View column - this is why you see N/A');
    }

    console.log('\n=== CONCLUSION ===');
    console.log('Expected View Value:', viewValue || 'N/A');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

investigate();
