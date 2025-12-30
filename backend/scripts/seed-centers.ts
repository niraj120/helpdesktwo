import mongoose from 'mongoose';
import { Center } from '../src/models/Center';
import { Project } from '../src/models/Project';
import { User } from '../src/models/User';
import * as dotenv from 'dotenv';

dotenv.config();

const centersData = [
  {
    centerName: "CET केंद्र - Amravati",
    address: "Government College of Engineering, VMV Road, Near Kathora Naka",
    city: "Amravati",
    state: "Maharashtra",
    pincode: "444604",
    phone: "02294749373",
    email: "amravati@gov.in",
    workingHours: "Mon-Fri: 9AM to 7PM",
    latitude: 20.9571681,
    longitude: 77.7541867,
    features: ["Wifi enabled", "Printing assistance", "Information Kiosk", "Disability friendly"],
    googleMapLink: "https://www.google.com/maps/place/Government+College+of+Engineering/@20.9571681,77.7541867,17z/data=!4m14!1m7!3m6!1s0x3bd6a3464a9a39cf:0x41ba68e6a59d67ab!2sGovernment+College+of+Engineering!8m2!3d20.9571631!4d77.7567616!16s%2Fm%2F02pqjz1!3m5!1s0x3bd6a3464a9a39cf:0x41ba68e6a59d67ab!8m2!3d20.9571631!4d77.7567616!16s%2Fm%2F02pqjz1?entry=ttu&g_ep=EgoyMDI1MTIwOS4wIKXMDSoASAFQAw%3D%3D"
  },
  {
    centerName: "CET केंद्र - Kolhapur",
    address: "Government College of Engineering, Old Pune Bangalore Road Vidyanagar",
    city: "Kolhapur",
    state: "Maharashtra",
    pincode: "416004",
    phone: "0227936483",
    email: "kolhapur@gov.in",
    workingHours: "Mon-Fri: 9AM to 7PM",
    latitude: 16.6858993,
    longitude: 74.255769,
    features: ["Wifi enabled", "Printing assistance", "Information Kiosk", "Disability friendly"],
    googleMapLink: "https://www.google.com/maps/place/Government+Engineering+College+Kolhapur/@16.6858993,74.255769,17z/data=!4m10!1m2!2m1!1sGovernment+College+of+Engineering+kolhapur!3m6!1s0x3bc1013da12cec39:0x11d37dd45a2d0f04!8m2!3d16.6880227!4d74.2583386!15sCipHb3Zlcm5tZW50IENvbGxlZ2Ugb2YgRW5naW5lZXJpbmcga29saGFwdXKSAQdjb2xsZWdl4AEA!16s%2Fg%2F11kr82l_s_?entry=ttu&g_ep=EgoyMDI1MTIwOS4wIKXMDSoASAFQAw%3D%3D"
  },
  {
    centerName: "CET केंद्र - Mumbai Suburban",
    address: "Sardar Patel College of Engineering, Munshi Nagar, Andheri (West)",
    city: "Mumbai Suburban",
    state: "Maharashtra",
    pincode: "400058",
    phone: "02284639473",
    email: "mumbaisub@gov.in",
    workingHours: "Mon-Fri: 9AM to 7PM",
    latitude: 19.1259692,
    longitude: 72.8334128,
    features: ["Wifi enabled", "Printing assistance", "Information Kiosk", "Disability friendly"],
    googleMapLink: "https://www.google.com/maps/place/SARDAR+PATEL+COLLEGE,+Munshi+Nagar,+Andheri+West,+Mumbai,+Maharashtra+400058/@19.1259692,72.8334128,17z/data=!3m1!4b1!4m6!3m5!1s0x3be7c9d8bdce23b9:0xe0805f50b400bbbe!8m2!3d19.1261035!4d72.8351159!16s%2Fg%2F11ckqk0hfd?entry=ttu&g_ep=EgoyMDI1MTIwOS4wIKXMDSoASAFQAw%3D%3D"
  }
];

async function seedCenters() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find the MH CET project
    const project = await Project.findOne({ 
      $or: [
        { name: { $regex: /MH CET/i } },
        { projectName: { $regex: /MH CET/i } }
      ]
    });

    if (!project) {
      throw new Error('MH CET project not found. Please create the project first.');
    }

    console.log(`✅ Found project: ${project.name || project.projectName}`);

    // Find a super admin user to assign as creator
    const superAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
    if (!superAdmin) {
      throw new Error('No super admin user found. Please create a super admin first.');
    }

    console.log(`✅ Found super admin: ${superAdmin.email}`);

    // Check if centers already exist
    const existingCount = await Center.countDocuments({ projectId: project._id });
    if (existingCount > 0) {
      console.log(`⚠️  ${existingCount} centers already exist for this project. Skipping seed.`);
      process.exit(0);
    }

    // Create centers
    console.log('🔄 Creating centers...');
    const centersToCreate = centersData.map(center => ({
      ...center,
      projectId: project._id,
      createdBy: superAdmin._id,
      isActive: true
    }));

    const createdCenters = await Center.insertMany(centersToCreate);
    console.log(`✅ Successfully created ${createdCenters.length} centers`);

    // Display created centers
    createdCenters.forEach((center, index) => {
      console.log(`  ${index + 1}. ${center.centerName} (${center.city})`);
    });

    console.log('\n✅ Centers seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding centers:', error);
    process.exit(1);
  }
}

// Run the seed function
seedCenters();
