import mongoose from "mongoose";
import { NotificationSetting } from "../models/NotificationSetting";
import { Role } from "../models/Role";
import { TRIGGER_TYPES, TriggerType } from "../constants/notificationTriggers";

/**
 * Default global notification settings.
 * Maps each trigger to the role codes that should receive it by default.
 * These are global defaults (projectId = null) — project-specific overrides
 * take precedence at runtime in the notification engine.
 */
const DEFAULT_SETTINGS: Array<{
  triggerType: TriggerType;
  roleCodes: string[];
}> = [
  {
    triggerType: TRIGGER_TYPES.TICKET_CREATED,
    roleCodes: ["SUPER_ADMIN", "PROJECT_ADMIN", "AGENT"],
  },
  {
    // Direct assignment — engine uses recipientOverride, but setting still
    // needs to exist so admin can toggle it off globally
    triggerType: TRIGGER_TYPES.TICKET_ASSIGNED_TO_ME,
    roleCodes: ["AGENT"],
  },
  {
    triggerType: TRIGGER_TYPES.TICKET_REPLY_ADDED,
    roleCodes: ["AGENT", "STUDENT"],
  },
  {
    triggerType: TRIGGER_TYPES.TICKET_STATUS_CHANGED,
    roleCodes: ["AGENT", "STUDENT"],
  },
  {
    triggerType: TRIGGER_TYPES.TICKET_MENTIONED,
    roleCodes: ["SUPER_ADMIN", "PROJECT_ADMIN", "AGENT", "STUDENT"],
  },
  {
    triggerType: TRIGGER_TYPES.TICKET_CLOSED,
    roleCodes: ["AGENT", "STUDENT"],
  },
  {
    triggerType: TRIGGER_TYPES.TICKET_ESCALATED,
    roleCodes: ["SUPER_ADMIN", "PROJECT_ADMIN", "AGENT"],
  },
  {
    triggerType: TRIGGER_TYPES.KB_ARTICLE_PUBLISHED,
    roleCodes: ["SUPER_ADMIN", "PROJECT_ADMIN", "AGENT"],
  },
  {
    triggerType: TRIGGER_TYPES.KB_ARTICLE_UPDATED,
    roleCodes: ["SUPER_ADMIN", "PROJECT_ADMIN", "AGENT"],
  },
  {
    triggerType: TRIGGER_TYPES.KB_ARTICLE_ARCHIVED,
    roleCodes: ["SUPER_ADMIN", "PROJECT_ADMIN"],
  },
  {
    triggerType: TRIGGER_TYPES.SLA_BREACH_WARNING,
    roleCodes: ["SUPER_ADMIN", "PROJECT_ADMIN", "AGENT"],
  },
  {
    triggerType: TRIGGER_TYPES.SLA_BREACHED,
    roleCodes: ["SUPER_ADMIN", "PROJECT_ADMIN", "AGENT"],
  },
];

export async function seedNotificationSettings(): Promise<void> {
  try {
    // Fetch all relevant roles by code
    const roles = await Role.find(
      { code: { $in: ["SUPER_ADMIN", "PROJECT_ADMIN", "AGENT", "STUDENT"] } },
      "_id code",
    ).lean();

    if (roles.length === 0) {
      console.log(
        "⚠️  seedNotificationSettings: no roles found — skipping notification settings seed",
      );
      return;
    }

    const roleMap = new Map<string, mongoose.Types.ObjectId>(
      roles.map((r) => [r.code as string, r._id as mongoose.Types.ObjectId]),
    );

    let created = 0;
    let skipped = 0;

    for (const { triggerType, roleCodes } of DEFAULT_SETTINGS) {
      for (const roleCode of roleCodes) {
        const roleId = roleMap.get(roleCode);
        if (!roleId) continue; // role doesn't exist yet — skip

        // Upsert: only create if not already present (preserves admin customisations)
        const existing = await NotificationSetting.findOne({
          projectId: null,
          triggerType,
          roleId,
        });

        if (!existing) {
          await NotificationSetting.create({
            projectId: null,
            triggerType,
            roleId,
            isEnabled: true,
            channels: { inApp: true, email: false },
          });
          created++;
        } else {
          skipped++;
        }
      }
    }

    if (created > 0) {
      console.log(
        `✅ seedNotificationSettings: created ${created} global default setting(s) (${skipped} already existed)`,
      );
    } else {
      console.log(
        `✓ seedNotificationSettings: all global defaults already present (${skipped} records)`,
      );
    }
  } catch (error) {
    console.error("❌ seedNotificationSettings error:", error);
    // Non-fatal — log and continue server startup
  }
}
