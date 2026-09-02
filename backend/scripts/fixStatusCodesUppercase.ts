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

async function fixStatusCodes() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Map of incorrect codes to correct codes
    const codeMapping: Record<string, string> = {
      'OPEN': 'open',
      'CLOSE': 'closed',
      'RESOLVED': 'resolved',
      'ONHOLD': 'on-hold',
      'IN-PROGRESS': 'in-progress',
      'INPROGRESS': 'in-progress'
    };

    const statuses = await Status.find({});
    console.log(`\n📋 Found ${statuses.length} statuses\n`);

    for (const status of statuses) {
      const oldCode = status.code;
      const newCode = codeMapping[oldCode] || oldCode.toLowerCase();
      
      if (oldCode !== newCode) {
        console.log(`Fixing: "${status.name}" from "${oldCode}" to "${newCode}"`);
        status.code = newCode;
        await status.save();
        console.log(`✅ Updated!`);
      } else {
        console.log(`✓ "${status.name}" already has correct code: "${oldCode}"`);
      }
    }

    console.log('\n🎉 All status codes fixed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixStatusCodes();
