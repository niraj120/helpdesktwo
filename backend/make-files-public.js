const { Storage } = require('@google-cloud/storage');
const path = require('path');
require('dotenv').config();

async function makeExistingFilesPublic() {
  try {
    const gcsKeyFile = process.env.GCS_KEY_FILE || path.join(__dirname, 'config/gcs-key.json');
    
    const storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID || 'helpdesk-dev-478611',
      keyFilename: gcsKeyFile,
    });

    const bucketName = process.env.GCS_BUCKET_NAME || 'helpdesk-knowledge-base';
    const bucket = storage.bucket(bucketName);

    console.log('✅ Connected to GCS');
    console.log(`📦 Bucket: ${bucketName}\n`);

    // Get all files in the kb-pdfs folder
    const [files] = await bucket.getFiles({ prefix: '693bd61817834e29eb111ec2/kb-pdfs/' });

    console.log(`📄 Found ${files.length} files\n`);

    for (const file of files) {
      try {
        await file.makePublic();
        console.log(`✅ Made public: ${file.name}`);
      } catch (error) {
        console.error(`❌ Failed to make public: ${file.name}`, error.message);
      }
    }

    console.log('\n🎉 All existing files are now public!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

makeExistingFilesPublic();
