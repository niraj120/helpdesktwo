const mongoose = require('mongoose');
require('dotenv').config();

const KBArticleSchema = new mongoose.Schema({}, { strict: false, collection: 'kbarticles' });
const KBArticle = mongoose.model('KBArticle', KBArticleSchema);

async function cleanupArticleURLs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find article with documentName "All Courses"
    const article = await KBArticle.findOne({ documentName: 'All Courses' });
    
    if (!article) {
      console.log('❌ Article "All Courses" not found');
      process.exit(1);
    }

    console.log('\n📄 Current Article State:');
    console.log('   Document Name:', article.documentName);
    console.log('   Document Type:', article.documentType);
    console.log('   PDF URL:', article.pdfUrl || 'NOT SET');
    console.log('   External URL:', article.externalUrl || 'NOT SET');
    console.log('   HTML Content:', article.htmlContent ? `${article.htmlContent.substring(0, 50)}...` : 'NOT SET');

    // Clear fields based on documentType
    if (article.documentType === 'pdf') {
      console.log('\n🔧 Document type is PDF - clearing externalUrl and htmlContent...');
      article.externalUrl = undefined;
      article.htmlContent = undefined;
      await article.save();
      console.log('✅ Cleared externalUrl and htmlContent');
    } else if (article.documentType === 'link') {
      console.log('\n🔧 Document type is Link - clearing PDF fields and htmlContent...');
      article.pdfUrl = undefined;
      article.pdfFilename = undefined;
      article.pdfSize = undefined;
      article.htmlContent = undefined;
      await article.save();
      console.log('✅ Cleared PDF fields and htmlContent');
    } else if (article.documentType === 'html') {
      console.log('\n🔧 Document type is HTML - clearing PDF fields and externalUrl...');
      article.pdfUrl = undefined;
      article.pdfFilename = undefined;
      article.pdfSize = undefined;
      article.externalUrl = undefined;
      await article.save();
      console.log('✅ Cleared PDF fields and externalUrl');
    } else if (article.documentType === 'both') {
      console.log('\n🔧 Document type is Both - clearing only externalUrl...');
      article.externalUrl = undefined;
      await article.save();
      console.log('✅ Cleared externalUrl, kept PDF and HTML');
    }

    console.log('\n📄 Updated Article State:');
    console.log('   Document Type:', article.documentType);
    console.log('   PDF URL:', article.pdfUrl || 'NOT SET');
    console.log('   External URL:', article.externalUrl || 'NOT SET');
    console.log('   HTML Content:', article.htmlContent ? 'SET' : 'NOT SET');

    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

cleanupArticleURLs();
