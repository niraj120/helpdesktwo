const jwt = require('jsonwebtoken');

// Generate a fresh token with expiry 30 days from now
const payload = {
  userId: '6532fd1bf89f277125c7f077e',
  email: 'admin@syasc.in',
  role: 'superadmin'
};

const secret = 'your-super-secret-jwt-key-change-this-in-production';

// 30 days expiry
const token = jwt.sign(payload, secret, { expiresIn: '30d' });

console.log('Fresh Token (30 days expiry):');
console.log(token);

// Verify it
try {
  const decoded = jwt.verify(token, secret);
  console.log('\n✅ Token verified successfully');
  console.log('Payload:', decoded);
} catch (error) {
  console.error('❌ Token verification failed:', error.message);
}
