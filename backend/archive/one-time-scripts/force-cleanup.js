const mongoose = require('mongoose');
require('dotenv').config();

async function forceCleanup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Direct update using MongoDB native driver
    const result = await mongoose.connection.db.collection('kbarticles').updateOne(
      { documentName: 'All Courses' },
      { 
        $unset: { 
          externalUrl: '',
          htmlContent: ''
        }
      }
    );

    console.log('📊 Update Result:');
    console.log('   Matched:', result.matchedCount);
    console.log('   Modified:', result.modifiedCount);

    // Fetch and display the updated document
    const article = await mongoose.connection.db.collection('kbarticles').findOne({ documentName: 'All Courses' });
    
    console.log('\n📄 Article After Update:');
    console.log('   Document Name:', article.documentName);
    console.log('   Document Type:', article.documentType);
    console.log('   PDF URL:', article.pdfUrl ? 'SET ✓' : 'NOT SET');
    console.log('   External URL:', article.externalUrl ? `STILL EXISTS: ${article.externalUrl}` : 'CLEARED ✓');
    console.log('   HTML Content:', article.htmlContent ? 'SET' : 'CLEARED ✓');
    console.log('   Updated At:', new Date(article.updatedAt).toISOString());

    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

forceCleanup();
