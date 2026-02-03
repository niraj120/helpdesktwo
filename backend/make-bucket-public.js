const { Storage } = require('@google-cloud/storage');
const path = require('path');
require('dotenv').config();

async function makeBucketPublic() {
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

    // Add allUsers as Storage Object Viewer (for uniform bucket-level access)
    await bucket.iam.setPolicy({
      bindings: [
        {
          role: 'roles/storage.objectViewer',
          members: ['allUsers'],
        },
      ],
    });

    console.log('✅ Bucket is now public!');
    console.log('🌐 All objects in this bucket are now publicly accessible');
    console.log('\n📝 Note: With uniform bucket-level access enabled,');
    console.log('   all objects inherit the bucket-level IAM permissions.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 If you get permission errors, you may need to:');
    console.error('   1. Go to GCS Console: https://console.cloud.google.com/storage/browser');
    console.error('   2. Select your bucket: helpdesk-knowledge-base');
    console.error('   3. Go to Permissions tab');
    console.error('   4. Click "Grant Access"');
    console.error('   5. Add principal: allUsers');
    console.error('   6. Select role: Storage Object Viewer');
    process.exit(1);
  }
}

makeBucketPublic();
