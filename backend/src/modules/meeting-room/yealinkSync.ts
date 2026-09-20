/**
 * Push a booking to the room's Yealink panel.
 *
 * Yealink deployments differ — some sites drive the panels through the Yealink
 * Management Cloud, others through an on-prem RPS or a Teams/Exchange room
 * mailbox — so the endpoint, headers and body are configured per project
 * rather than coded to one API. That mirrors the lead CRM sync: the admin
 * supplies the URL and a body template, we fill the placeholders in.
 *
 * Failures never block a booking: the room is held in Hubble regardless, the
 * booking records why the push failed, and it can be retried.
 */
import axios from "axios";
import { MeetingRoom } from "../../models/meeting-room/MeetingRoom";
import { MeetingBooking } from "../../models/meeting-room/MeetingBooking";
import { Project } from "../../models/Project";
import { User } from "../../models/User";

export interface YealinkConfig {
  enabled: boolean;
  /** Where to POST a booking. Supports the same placeholders as the body. */
  createUrl: string;
  /** PUT/POST for a change, DELETE for a cancellation; blank = reuse create. */
  updateUrl?: string;
  cancelUrl?: string;
  authHeaderName?: string;
  authHeaderValue?: string;
  headers?: Record<string, string>;
  /** JSON, with {{placeholders}}. Blank = a sensible default body. */
  bodyTemplate?: string;
  timeoutMs?: number;
}

/** The project's Yealink settings (Integrations → Meeting rooms). */
export async function getYealinkConfig(projectId: string): Promise<YealinkConfig | null> {
  const project: any = await Project.findById(projectId)
    .select("configuration.meetingRoom.yealink")
    .lean();
  const cfg = project?.configuration?.meetingRoom?.yealink;
  return cfg?.enabled ? cfg : null;
}

const fill = (template: string, values: Record<string, any>): string =>
  template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const value = key
      .split(".")
      .reduce((acc: any, part: string) => (acc == null ? acc : acc[part]), values);
    return value == null ? "" : String(value);
  });

/**
 * Send one booking to the panel. `action` decides which endpoint is used;
 * everything is best-effort and recorded on the booking.
 */
export async function pushBookingToDevice(
  bookingId: string,
  action: "create" | "update" | "cancel" = "create",
): Promise<void> {
  const booking: any = await MeetingBooking.findById(bookingId);
  if (!booking) return;
  const room: any = await MeetingRoom.findById(booking.roomId).lean();
  if (!room?.device?.enabled || room.device.provider !== "yealink") {
    booking.deviceSync = { status: "skipped" };
    await booking.save();
    return;
  }
  const cfg = await getYealinkConfig(String(booking.projectId));
  if (!cfg) {
    booking.deviceSync = { status: "skipped" };
    await booking.save();
    return;
  }

  const organizer: any = await User.findById(booking.organizerId)
    .select("firstName lastName fullName email")
    .lean();
  const values = {
    booking: {
      id: String(booking._id),
      externalId: booking.deviceSync?.externalId || "",
      title: booking.title,
      purpose: booking.purpose || "",
      agenda: booking.agenda || "",
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
      status: booking.status,
      attendees: (booking.attendees || [])
        .map((a: any) => a.email || a.name)
        .filter(Boolean)
        .join(","),
    },
    room: {
      id: String(room._id),
      name: room.name,
      code: room.code,
      account: room.device.roomAccount || "",
      deviceId: room.device.deviceId || "",
    },
    organizer: {
      name: organizer?.fullName || `${organizer?.firstName || ""} ${organizer?.lastName || ""}`.trim(),
      email: organizer?.email || "",
    },
  };

  const url = fill(
    (action === "cancel" && cfg.cancelUrl) ||
      (action === "update" && cfg.updateUrl) ||
      cfg.createUrl ||
      "",
    values,
  );
  if (!url) {
    booking.deviceSync = { status: "skipped" };
    await booking.save();
    return;
  }

  const body = cfg.bodyTemplate
    ? JSON.parse(fill(cfg.bodyTemplate, values) || "{}")
    : {
        room: values.room.account || values.room.code,
        subject: values.booking.title,
        organizer: values.organizer.email,
        start_time: values.booking.start,
        end_time: values.booking.end,
        action,
        reference: values.booking.id,
      };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(cfg.headers || {}),
  };
  if (cfg.authHeaderName && cfg.authHeaderValue) {
    headers[cfg.authHeaderName] = cfg.authHeaderValue;
  }

  booking.deviceSync = {
    ...(booking.deviceSync || {}),
    status: "pending",
    lastAttemptAt: new Date(),
  };
  await booking.save();

  try {
    const res = await axios.request({
      url,
      method: action === "cancel" && cfg.cancelUrl ? "DELETE" : action === "update" ? "PUT" : "POST",
      headers,
      data: body,
      timeout: cfg.timeoutMs || 15000,
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300) {
      booking.deviceSync = {
        status: "synced",
        externalId:
          res.data?.id || res.data?.meeting_id || booking.deviceSync?.externalId,
        lastAttemptAt: new Date(),
      };
      await MeetingRoom.updateOne(
        { _id: room._id },
        { $set: { "device.lastSyncAt": new Date(), "device.lastSyncStatus": "ok", "device.lastSyncError": "" } },
      );
    } else {
      booking.deviceSync = {
        ...(booking.deviceSync || {}),
        status: "failed",
        error: `HTTP ${res.status}`,
        lastAttemptAt: new Date(),
      };
      await MeetingRoom.updateOne(
        { _id: room._id },
        { $set: { "device.lastSyncStatus": "failed", "device.lastSyncError": `HTTP ${res.status}` } },
      );
    }
  } catch (e: any) {
    booking.deviceSync = {
      ...(booking.deviceSync || {}),
      status: "failed",
      error: e?.message || "Request failed",
      lastAttemptAt: new Date(),
    };
    await MeetingRoom.updateOne(
      { _id: room._id },
      { $set: { "device.lastSyncStatus": "failed", "device.lastSyncError": e?.message } },
    );
  }
  await booking.save();
}

/** Fire and forget: a panel that is down must not fail the booking. */
export const pushBookingSafely = (
  bookingId: string,
  action: "create" | "update" | "cancel" = "create",
) => {
  pushBookingToDevice(bookingId, action).catch((e) =>
    console.warn("[yealink] push failed:", bookingId, e?.message),
  );
};
