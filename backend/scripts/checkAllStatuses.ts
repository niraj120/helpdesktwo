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

async function checkAllStatuses() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const projectId = '693bd61817834e29eb111ec2';
    const statuses = await Status.find({ projectId }).sort({ displayOrder: 1 });
    
    console.log(`\n📊 Found ${statuses.length} statuses for MHCET project:\n`);
    
    statuses.forEach((status, index) => {
      console.log(`${index + 1}. Name: "${status.name}" → Code: "${status.code}"`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAllStatuses();
