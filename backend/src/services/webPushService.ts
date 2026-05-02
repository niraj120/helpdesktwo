// eslint-disable-next-line @typescript-eslint/no-require-imports
const webPush = require("web-push") as typeof import("web-push");
import mongoose from "mongoose";
import { PushSubscription } from "../models/PushSubscription";

// Lazy VAPID initialization — read env vars on first use so dotenv has time to load
let _webPushConfigured = false;
const ensureWebPushConfigured = (): boolean => {
  if (_webPushConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || "mailto:support@hubblehox.ai";
  if (pub && priv) {
    webPush.setVapidDetails(sub, pub, priv);
    _webPushConfigured = true;
    return true;
  }
  console.warn("⚠️ VAPID keys not set — web push notifications disabled");
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
  if (!ensureWebPushConfigured()) return;

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

export const getVapidPublicKey = (): string =>
  process.env.VAPID_PUBLIC_KEY || "";
