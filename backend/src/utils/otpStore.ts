import crypto from 'crypto';
import { hash } from './encryption';

// Simple in-memory fallback store
type OtpEntry = {
  email: string;
  hashedOtp: string;
  expiresAt: number; // epoch ms
  meta?: any;
};

const memoryStore = new Map<string, OtpEntry>();

// Attempt to use Redis if available (optional dependency)
let redisClient: any = null;
let useRedis = false;
try {
  // Deliberately require at runtime so build doesn't fail if package not installed
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const IORedis = require('ioredis');
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    redisClient = new IORedis(redisUrl);
    useRedis = true;
    console.info('✅ OTP Store: Using Redis at', redisUrl);
  }
} catch (err) {
  // Redis not available - fall back to memory
  useRedis = false;
}

const generateKey = () => crypto.randomBytes(16).toString('hex');

export const createOtp = async (email: string, otpPlain: string, ttlSeconds = 600, meta?: any): Promise<string> => {
  const otpKey = generateKey();
  const hashed = hash(otpPlain);
  const expiresAt = Date.now() + ttlSeconds * 1000;

  if (useRedis && redisClient) {
    const payload = JSON.stringify({ email, hashedOtp: hashed, meta });
    await redisClient.set(`otp:${otpKey}`, payload, 'PX', ttlSeconds * 1000);
    return otpKey;
  }

  memoryStore.set(otpKey, { email, hashedOtp: hashed, expiresAt, meta });
  return otpKey;
};

export const verifyOtpByKey = async (otpKey: string, otpPlain: string): Promise<boolean> => {
  if (useRedis && redisClient) {
    const raw = await redisClient.get(`otp:${otpKey}`);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      const hashed = parsed.hashedOtp;
      const candidate = hash(otpPlain);
      if (candidate === hashed) {
        await redisClient.del(`otp:${otpKey}`);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  const entry = memoryStore.get(otpKey);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(otpKey);
    return false;
  }
  const candidate = hash(otpPlain);
  if (candidate === entry.hashedOtp) {
    memoryStore.delete(otpKey);
    return true;
  }
  return false;
};

export const deleteOtpByKey = async (otpKey: string): Promise<void> => {
  if (useRedis && redisClient) {
    await redisClient.del(`otp:${otpKey}`);
    return;
  }
  memoryStore.delete(otpKey);
};

export const findOtpKeysByEmail = async (email: string): Promise<string[]> => {
  if (useRedis && redisClient) {
    // Redis scan for keys - avoid in large DBs but acceptable for small installs
    const keys: string[] = [];
    let cursor = '0';
    do {
      // eslint-disable-next-line no-await-in-loop
      const res = await redisClient.scan(cursor, 'MATCH', 'otp:*', 'COUNT', 100);
      cursor = res[0];
      const found = res[1] as string[];
      for (const k of found) {
        // eslint-disable-next-line no-await-in-loop
        const raw = await redisClient.get(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.email === email) keys.push(k.replace(/^otp:/, ''));
        } catch (err) {
          // ignore
        }
      }
    } while (cursor !== '0');
    return keys;
  }

  const results: string[] = [];
  for (const [k, v] of memoryStore.entries()) {
    if (v.email === email) results.push(k);
  }
  return results;
};

export const consumeOtpsForEmail = async (email: string): Promise<number> => {
  const keys = await findOtpKeysByEmail(email);
  for (const k of keys) {
    await deleteOtpByKey(k);
  }
  return keys.length;
};

export default {
  createOtp,
  verifyOtpByKey,
  deleteOtpByKey,
  findOtpKeysByEmail,
  consumeOtpsForEmail,
};
