const mongoose = require('mongoose');
require('dotenv').config();

async function fixTokenCategories() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Permission = mongoose.connection.collection('permissions');
  
  // Fix all TOKEN permissions that have no category or wrong category
  const tokenCodes = [
    'TOKEN_CONFIG_CREATE',
    'TOKEN_CONFIG_EDIT', 
    'TOKEN_CONFIG_RESET',
    'TOKEN_CONFIG_VIEW',
    'TOKEN_CREATE',
    'TOKEN_DELETE',
    'TOKEN_SKIP',
    'TOKEN_VIEW'
  ];
  
  const result = await Permission.updateMany(
    { code: { $in: tokenCodes } },
    { 
      $set: { 
        category: 'token-management',
        module: 'Token Management'
      } 
    }
  );
  
  console.log('✅ Updated', result.modifiedCount, 'TOKEN permissions to use "token-management" category');
  
  // Also update DESK and TOKEN_ANALYTICS to have proper module name
  const result2 = await Permission.updateMany(
    { code: { $regex: /^DESK_|^TOKEN_ANALYTICS/ } },
    { 
      $set: { 
        module: 'Token Management'
      } 
    }
  );
  
  console.log('✅ Updated', result2.modifiedCount, 'DESK/ANALYTICS permissions module name');
  
  // Verify all token permissions now
  const allToken = await Permission.find({ 
    $or: [
      { code: { $regex: /^TOKEN/ } },
      { code: { $regex: /^DESK/ } }
    ]
  }).toArray();
  
  console.log('\n✅ All Token Management permissions now:');
  allToken.forEach(p => {
    console.log(`  [${p.category}] ${p.code} - ${p.name} (${p.module})`);
  });
  
  await mongoose.disconnect();
}

fixTokenCategories().catch(console.error);
