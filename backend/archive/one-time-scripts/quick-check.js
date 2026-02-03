const mongoose = require('mongoose');
require('dotenv').config();

async function quickCheck() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Check table
    const KBTable = mongoose.model('KBTable', new mongoose.Schema({}, { strict: false, collection: 'kbtables' }));
    const table = await KBTable.findOne({ name: 'Notices' });
    
    const viewCol = table?.columns?.find(c => c.name === 'View');
    console.log('View column mapping:', viewCol?.articleFieldMapping);

    // Check article
    const KBArticle = mongoose.model('KBArticle', new mongoose.Schema({}, { strict: false, collection: 'kbarticles' }));
    const article = await KBArticle.findOne({ courseName: 'All Courses' });
    
    console.log('\nArticle fields:');
    console.log('- htmlContent:', article?.htmlContent ? `${article.htmlContent.length} chars` : 'MISSING');
    console.log('- pdfUrl:', article?.pdfUrl || 'MISSING');
    console.log('- externalUrl:', article?.externalUrl || 'MISSING');

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

quickCheck();
