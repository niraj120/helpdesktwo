import mongoose from "mongoose";
import { Notification } from "../models/Notification";
import { NotificationSetting } from "../models/NotificationSetting";
import { UserNotificationPreference } from "../models/UserNotificationPreference";
import { User } from "../models/User";
import {
  TriggerType,
  TITLE_TEMPLATES,
} from "../constants/notificationTriggers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FireNotificationEvent {
  triggerType: TriggerType;
  triggeredByUserId?: mongoose.Types.ObjectId | string;
  projectId?: mongoose.Types.ObjectId | string;
  entityType: "ticket" | "kb_article" | "comment";
  entityId: mongoose.Types.ObjectId | string;
  deepLinkUrl: string;
  templateVars: Record<string, string>;
  /**
   * When set, skip role-based fan-out and send ONLY to these users.
   * Used for direct assignments (ticket_assigned_to_me), mentions, etc.
   */
  recipientOverride?: Array<mongoose.Types.ObjectId | string>;
  /**
   * When set during role-based fan-out, only include users whose `centers`
   * array contains this centerId. Pass "online" to skip center filtering
   * (online tickets are visible to all agents in the project).
   */
  centerId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function toObjectId(
  id: mongoose.Types.ObjectId | string,
): mongoose.Types.ObjectId {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(id);
}

// Deduplication window in milliseconds (60 seconds)
const DEDUP_WINDOW_MS = 60 * 1000;

// ─── Core Engine ──────────────────────────────────────────────────────────────

/**
 * Central notification fan-out. Non-blocking — caller should wrap in
 * `fireNotification(...).catch(console.error)` for fire-and-forget.
 */
export async function fireNotification(
  event: FireNotificationEvent,
): Promise<void> {
  try {
    const {
      triggerType,
      triggeredByUserId,
      projectId,
      entityType,
      entityId,
      deepLinkUrl,
      templateVars,
      recipientOverride,
      centerId,
    } = event;

    const entityObjectId = toObjectId(entityId);
    const triggeredByObjectId = triggeredByUserId
      ? toObjectId(triggeredByUserId)
      : undefined;
    const projectObjectId = projectId ? toObjectId(projectId) : undefined;

    // Render the notification title
    const titleTemplate =
      TITLE_TEMPLATES[triggerType] || "You have a new notification";
    const title = renderTemplate(titleTemplate, templateVars);

    // ── Step 1: Determine recipients ──────────────────────────────────────────

    let recipientIds: mongoose.Types.ObjectId[] = [];

    if (recipientOverride && recipientOverride.length > 0) {
      // Direct override — use exactly these users
      recipientIds = recipientOverride.map(toObjectId);
    } else {
      // Role-based fan-out
      // Load enabled roles for this trigger+project (project-specific first, then global default)
      let settings = await NotificationSetting.find({
        projectId: projectObjectId ?? null,
        triggerType,
        isEnabled: true,
        "channels.inApp": true,
      })
        .select("roleId")
        .lean();

      // If no project-specific settings found, fall back to global defaults (projectId=null)
      if (settings.length === 0 && projectObjectId) {
        settings = await NotificationSetting.find({
          projectId: null,
          triggerType,
          isEnabled: true,
          "channels.inApp": true,
        })
          .select("roleId")
          .lean();
      }

      if (settings.length === 0) return; // No notification settings configured

      const enabledRoleIds = settings.map((s) => s.roleId);

      // Find all users with one of these roles, scoped to the project
      const userQuery: any = { role: { $in: enabledRoleIds }, isActive: true };
      if (projectObjectId) {
        userQuery.projects = projectObjectId;
      }
      // Center/venue filter: only notify agents mapped to the ticket's center.
      // Skip filtering for online tickets (centerId === "online") or when not provided.
      if (
        centerId &&
        centerId !== "online" &&
        mongoose.Types.ObjectId.isValid(centerId)
      ) {
        userQuery.centers = new mongoose.Types.ObjectId(centerId);
      }

      const users = await User.find(userQuery).select("_id").lean();
      recipientIds = users.map((u) => u._id as mongoose.Types.ObjectId);
    }

    if (recipientIds.length === 0) return;

    // ── Step 2: Exclude the action initiator ─────────────────────────────────
    if (triggeredByObjectId) {
      recipientIds = recipientIds.filter(
        (id) => !id.equals(triggeredByObjectId),
      );
    }

    if (recipientIds.length === 0) return;

    // ── Step 3: Apply personal opt-out preferences ────────────────────────────
    const prefs = await UserNotificationPreference.find({
      userId: { $in: recipientIds },
      triggerType,
      inAppEnabled: false,
    })
      .select("userId")
      .lean();

    const optedOutIds = new Set(prefs.map((p) => p.userId.toString()));
    recipientIds = recipientIds.filter((id) => !optedOutIds.has(id.toString()));

    if (recipientIds.length === 0) return;

    // ── Step 4: Deduplication ─────────────────────────────────────────────────
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS);
    const existingNotifs = await Notification.find({
      recipientUserId: { $in: recipientIds },
      triggerType,
      entityId: entityObjectId,
      createdAt: { $gte: dedupSince },
    })
      .select("recipientUserId")
      .lean();

    const alreadyNotifiedIds = new Set(
      existingNotifs.map((n) => n.recipientUserId.toString()),
    );
    recipientIds = recipientIds.filter(
      (id) => !alreadyNotifiedIds.has(id.toString()),
    );

    if (recipientIds.length === 0) return;

    // ── Step 5: Bulk insert notifications ─────────────────────────────────────
    const records = recipientIds.map((recipientId) => ({
      recipientUserId: recipientId,
      triggeredByUserId: triggeredByObjectId,
      projectId: projectObjectId,
      triggerType,
      entityType,
      entityId: entityObjectId,
      title,
      deepLinkUrl,
      isRead: false,
    }));

    const inserted = await Notification.insertMany(records, { ordered: false });

    // ── Step 6: Emit Socket.IO real-time events ───────────────────────────────
    try {
      const { getIo } = require("../socket/ioInstance");
      const io = getIo();
      if (io) {
        for (const notif of inserted) {
          io.to(`user-${notif.recipientUserId.toString()}`).emit(
            "notification:new",
            {
              _id: notif._id.toString(),
              triggerType: notif.triggerType,
              entityType: notif.entityType,
              entityId: notif.entityId.toString(),
              projectId: notif.projectId?.toString(),
              title: notif.title,
              deepLinkUrl: notif.deepLinkUrl,
              isRead: false,
              createdAt: notif.createdAt,
            },
          );
        }
      }
    } catch {
      // Socket.IO emit failure is non-fatal — notification is already persisted
    }
  } catch (error) {
    // Log but don't rethrow — notification failure must never break core flows
    console.error(`[notificationEngine] fireNotification failed:`, error);
  }
}
