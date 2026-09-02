require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}
mongoose.connect(MONGO_URI, {serverSelectionTimeoutMS: 10000}).then(async () => {
  const db = mongoose.connection.db;

  // 1. Mark original 'Please ignore' entry as 'completed' (ticket already created)
  const r1 = await db.collection('emailprocessingqueues').updateOne(
    { _id: new mongoose.Types.ObjectId('69c4c368a3ab174108feccec') },
    { $set: { status: 'completed', errorMessage: null, processedAt: new Date(), ticketId: new mongoose.Types.ObjectId('69c4c3a4a3ab174108fed291') } }
  );
  console.log('Marked original email (Please ignore) as completed:', r1.modifiedCount > 0 ? 'OK' : 'NOT FOUND/MODIFIED');

  // 2. Reset student reply 'Re: Please ignore' to pending for retry after code fix
  const r2 = await db.collection('emailprocessingqueues').updateOne(
    { _id: new mongoose.Types.ObjectId('69c4c41ca3ab174108fed840') },
    { $set: { status: 'pending', retryCount: 0, errorMessage: null, lastAttemptAt: null } }
  );
  console.log('Reset student reply (Re: Please ignore) to pending:', r2.modifiedCount > 0 ? 'OK' : 'NOT FOUND/MODIFIED');

  // Verify
  const entries = await db.collection('emailprocessingqueues').find(
    { _id: { $in: [new mongoose.Types.ObjectId('69c4c368a3ab174108feccec'), new mongoose.Types.ObjectId('69c4c41ca3ab174108fed840')] } },
    { projection: { status: 1, retryCount: 1, 'metadata.subject': 1 } }
  ).toArray();
  console.log('Verification:', JSON.stringify(entries, null, 2));

  await mongoose.disconnect();
  console.log('Done.');
}).catch(e => console.error('Error:', e.message));
