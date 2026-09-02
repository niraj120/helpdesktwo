require('dotenv').config();
const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;

  // Find the project
  const project = await db.collection('projects').findOne({ name: /mh cet extension|upkendra/i });
  if (!project) {
    console.log('Project not found');
    await mongoose.disconnect();
    return;
  }
  console.log('Project ID: ' + project._id.toString());
  console.log('Project Name: ' + project.name);

  // Show project's embedded statuses/settings
  console.log('\nProject statuses field: ' + JSON.stringify(project.statuses, null, 2));
  console.log('Project ticketSettings field: ' + JSON.stringify(project.ticketSettings, null, 2));
  console.log('\nAll collection names:');
  const collections = await db.listCollections().toArray();
  collections.forEach(c => console.log(' -', c.name));

  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
