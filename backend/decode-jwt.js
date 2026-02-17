// INSTRUCTIONS:
// 1. Open browser console (F12)
// 2. Run: localStorage.getItem('authToken')
// 3. Copy the token value
// 4. Replace 'YOUR_TOKEN_HERE' below with the actual token
// 5. Run this script: node decode-jwt.js

const token = 'YOUR_TOKEN_HERE';

if (token === 'YOUR_TOKEN_HERE') {
  console.log('\n❌ Please edit this file and replace YOUR_TOKEN_HERE with the actual JWT token from browser');
  console.log('\nTo get the token:');
  console.log('1. Open browser console (F12)');
  console.log('2. Run: localStorage.getItem("authToken")');
  console.log('3. Copy the token and paste it in this file\n');
  process.exit(1);
}

try {
  const parts = token.split('.');
  
  if (parts.length !== 3) {
    console.error('❌ Invalid JWT format');
    process.exit(1);
  }
  
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  
  console.log('\n=== JWT TOKEN CONTENTS ===\n');
  console.log('Email:', payload.email);
  console.log('Role:', payload.role?.name, `(${payload.role?.code})`);
  console.log('\n=== PERMISSIONS IN TOKEN ===');
  console.log(`Total: ${(payload.role?.permissions || []).length}`);
  console.log('');
  
  const permissions = payload.role?.permissions || [];
  permissions.forEach((perm, index) => {
    console.log(`${index + 1}. ${perm}`);
  });
  
  console.log('\n=== DASHBOARD PERMISSIONS CHECK ===');
  const hasDashboardView = permissions.includes('DASHBOARD_VIEW');
  const hasDashboardViewHierarchy = permissions.includes('DASHBOARD_VIEW_HIERARCHY');
  const hasDashboardViewTeam = permissions.includes('DASHBOARD_VIEW_TEAM');
  
  console.log(`DASHBOARD_VIEW: ${hasDashboardView ? '✅ YES' : '❌ NO'}`);
  console.log(`DASHBOARD_VIEW_TEAM: ${hasDashboardViewTeam ? '✅ YES' : '❌ NO'}`);
  console.log(`DASHBOARD_VIEW_HIERARCHY: ${hasDashboardViewHierarchy ? '✅ YES' : '❌ NO'}`);
  
  if (!hasDashboardViewHierarchy) {
    console.log('\n❌ DASHBOARD_VIEW_HIERARCHY is MISSING from the JWT token!');
    console.log('   This means the permission was added AFTER this JWT was generated.');
    console.log('   Solution: Logout and login again to get a fresh token.\n');
  } else {
    console.log('\n✅ Token has DASHBOARD_VIEW_HIERARCHY permission');
    console.log('   The issue might be with localStorage cache.\n');
  }
  
} catch (error) {
  console.error('❌ Error decoding token:', error.message);
}
