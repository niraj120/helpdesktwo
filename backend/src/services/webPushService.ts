// eslint-disable-next-line @typescript-eslint/no-require-imports
const webPush = require("web-push") as typeof import("web-push");
import mongoose from "mongoose";
import { PushSubscription } from "../models/PushSubscription";
import SystemSettings from "../models/SystemSettings";

// Lazy VAPID initialization — reads env vars first, falls back to DB-persisted keys,
// and auto-generates + persists a new pair if neither source has keys yet.
let _webPushConfigured = false;
let _cachedPublicKey = "";

const VAPID_DB_KEY = "vapid_keys";

/**
 * Ensure VAPID is configured. Tries (in order):
 * 1. Env vars VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * 2. SystemSettings doc with key "vapid_keys"
 * 3. Auto-generate a new pair, persist to SystemSettings, then configure
 *
 * Returns true when VAPID is ready, false if DB is not yet connected.
 */
export const ensureWebPushConfiguredAsync = async (): Promise<boolean> => {
  if (_webPushConfigured) return true;

  const subject = process.env.VAPID_SUBJECT || "mailto:support@hubblehox.ai";

  // 1. Env vars (fastest path — used when set on the server)
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) {
    webPush.setVapidDetails(subject, envPub, envPriv);
    _cachedPublicKey = envPub;
    _webPushConfigured = true;
    return true;
  }

  // 2 & 3. DB-backed keys (auto-generate if missing)
  try {
    let setting = await SystemSettings.findOne({ key: VAPID_DB_KEY });
    if (!setting) {
      // Generate and persist a new VAPID key pair
      const keys = webPush.generateVAPIDKeys();
      setting = await SystemSettings.create({
        key: VAPID_DB_KEY,
        value: { publicKey: keys.publicKey, privateKey: keys.privateKey },
        description: "Auto-generated VAPID keys for web push notifications",
      });
      console.log("✅ VAPID keys auto-generated and stored in SystemSettings");
    }

    const { publicKey, privateKey } = setting.value as {
      publicKey: string;
      privateKey: string;
    };
    webPush.setVapidDetails(subject, publicKey, privateKey);
    _cachedPublicKey = publicKey;
    _webPushConfigured = true;
    return true;
  } catch (err) {
    console.warn("⚠️ Could not load/generate VAPID keys from DB:", err);
    return false;
  }
};

// Synchronous wrapper kept for backwards-compat (fire-and-forget).
// Callers that need the result should use ensureWebPushConfiguredAsync.
const ensureWebPushConfigured = (): boolean => {
  if (_webPushConfigured) return true;
  // Kick off async init; result will be ready for subsequent calls
  ensureWebPushConfiguredAsync().catch(() => {/* logged inside */});
  return false;
};

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

/**
 * Send web push notification to all subscriptions for a user.
 * Silently removes expired/invalid subscriptions (410 Gone).
 */
export const sendPushToUser = async (
  userId: string,
  payload: PushPayload,
): Promise<void> => {
  const ready = await ensureWebPushConfiguredAsync();
  if (!ready) return;

  const subscriptions = await PushSubscription.find({
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (subscriptions.length === 0) return;

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/favicon.ico",
    badge: payload.badge || "/favicon.ico",
    url: payload.url || "/",
    tag: payload.tag || "helpdesk-notification",
    timestamp: Date.now(),
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          notification,
        );
      } catch (err: any) {
        // 410 Gone or 404 means the subscription is no longer valid — remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ endpoint: sub.endpoint });
          console.log(`🗑️ Removed stale push subscription for user ${userId}`);
        } else {
          throw err;
        }
      }
    }),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(
      `⚠️ ${failed.length} push notification(s) failed for user ${userId}`,
    );
  }
};

/**
 * Send web push to multiple users (e.g. all agents watching a project).
 */
export const sendPushToUsers = async (
  userIds: string[],
  payload: PushPayload,
): Promise<void> => {
  await Promise.allSettled(userIds.map((uid) => sendPushToUser(uid, payload)));
};

/**
 * Returns the VAPID public key. For async callers (e.g. HTTP routes) use
 * getVapidPublicKeyAsync() so the DB fallback is awaited.
 */
export const getVapidPublicKey = (): string =>
  process.env.VAPID_PUBLIC_KEY || _cachedPublicKey;

export const getVapidPublicKeyAsync = async (): Promise<string> => {
  await ensureWebPushConfiguredAsync();
  return process.env.VAPID_PUBLIC_KEY || _cachedPublicKey;
};
