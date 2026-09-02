import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { Status } from '../src/models/Status';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

async function checkStatuses() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const statuses = await Status.find({}).select('name code color isDefault isClosed displayOrder projectId');
    
    console.log(`\n📊 Total statuses found: ${statuses.length}\n`);
    
    statuses.forEach(status => {
      console.log(`Status: "${status.name}"`);
      console.log(`  Code: "${status.code}"`);
      console.log(`  Color: ${status.color}`);
      console.log(`  Is Default: ${status.isDefault}`);
      console.log(`  Is Closed: ${status.isClosed}`);
      console.log(`  Display Order: ${status.displayOrder}`);
      console.log(`  Project ID: ${status.projectId}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkStatuses();
