const jwt = require('jsonwebtoken');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6ImFkbWluQGhlbHBkZXNrLmdvdi5pbiIsInJvbGUiOnsibmFtZSI6IlN1cGVyIEFkbWluIiwiY29kZSI6IlNVUEVSX0FETUlOIn0sImlhdCI6MTc2Mjg4Mjg4NCwiZXhwIjoxNzYzNDg3Njg0fQ.Hf7GEqWIMkiOuK2pq1KLsfqFLYQ4yFBSDeGatkdCYlY';
const secret = 'your-secret-key';

console.log('Testing JWT verification...');
console.log('Token:', token.substring(0, 50) + '...');
console.log('Secret:', secret);

try {
  const decoded = jwt.verify(token, secret);
  console.log('✅ Token verified successfully!');
  console.log('Decoded:', JSON.stringify(decoded, null, 2));
} catch(e) {
  console.log('❌ Verification failed:', e.message);
  console.log('Error type:', e.name);
}
