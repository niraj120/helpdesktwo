import crypto from 'crypto';

/**
 * Encryption utility for sensitive data
 * Uses AES-256-GCM for authenticated encryption
 */

// Get encryption key from environment (should be 32 bytes for AES-256)
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: ENCRYPTION_KEY environment variable must be set in production!');
    }
    console.warn('⚠️  WARNING: ENCRYPTION_KEY not set. Using development fallback. DO NOT use in production!');
    // Development fallback - 32 bytes for AES-256
    return Buffer.from('dev-only-encryption-key-32bytes!');
  }
  
  // Ensure key is exactly 32 bytes
  const keyBuffer = Buffer.from(key, 'utf8');
  if (keyBuffer.length < 32) {
    // Pad the key if too short
    const paddedKey = Buffer.alloc(32);
    keyBuffer.copy(paddedKey);
    return paddedKey;
  }
  return keyBuffer.slice(0, 32);
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM

/**
 * Encrypt sensitive data
 * @param plaintext - The plaintext to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all base64)
 */
export const encrypt = (plaintext: string): string => {
  if (!plaintext) return '';
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Return in format: iv:authTag:ciphertext
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt sensitive data
 * @param encryptedData - Encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext
 */
export const decrypt = (encryptedData: string): string => {
  if (!encryptedData) return '';
  
  try {
    // Check if data is in encrypted format (contains two colons)
    if (!encryptedData.includes(':')) {
      // Data might be in plain text (legacy data before encryption was added)
      console.warn('⚠️  Found unencrypted data, returning as-is');
      return encryptedData;
    }
    
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      // Invalid format, might be legacy data
      console.warn('⚠️  Invalid encrypted data format, returning as-is');
      return encryptedData;
    }
    
    const key = getEncryptionKey();
    const [ivBase64, authTagBase64, ciphertext] = parts;
    
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  } catch (error) {
    console.error('Decryption error:', error);
    // Return empty string on decryption failure for safety
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Check if a value is already encrypted
 * @param value - The value to check
 * @returns true if the value appears to be in encrypted format
 */
export const isEncrypted = (value: string): boolean => {
  if (!value) return false;
  
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  
  // Check if all parts are valid base64
  try {
    Buffer.from(parts[0], 'base64');
    Buffer.from(parts[1], 'base64');
    Buffer.from(parts[2], 'base64');
    return true;
  } catch {
    return false;
  }
};

/**
 * Hash a value (one-way, for comparison purposes)
 * @param value - The value to hash
 * @returns SHA-256 hash as hex string
 */
export const hash = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

export default { encrypt, decrypt, isEncrypted, hash };
