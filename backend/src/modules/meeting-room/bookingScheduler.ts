/**
 * Keeps bookings honest without anyone pressing a button: releases rooms held
 * by people who never turned up, and closes meetings that have ended.
 *
 * Every five minutes is fine — the grace period is per room and measured in
 * minutes, so a short delay only means the room frees a little later than the
 * policy's earliest moment.
 */
import cron, { ScheduledTask } from "node-cron";
import { sweepBookings } from "./bookingService";

const EXPRESSION = process.env.MEETING_ROOM_SWEEP_CRON || "*/5 * * * *";

let task: ScheduledTask | null = null;

export function startMeetingRoomScheduler(): void {
  if (task) return;
  if (!cron.validate(EXPRESSION)) {
    console.warn(
      `[meeting-room] invalid MEETING_ROOM_SWEEP_CRON "${EXPRESSION}" — sweep not scheduled`,
    );
    return;
  }
  task = cron.schedule(EXPRESSION, async () => {
    try {
      const { released, completed } = await sweepBookings();
      if (released || completed) {
        console.log(
          `[meeting-room] sweep — ${released} released as no-show, ${completed} completed`,
        );
      }
    } catch (e) {
      console.error("[meeting-room] sweep failed:", (e as any)?.message);
    }
  });
  console.log(`[meeting-room] booking sweep scheduled (${EXPRESSION})`);
}

export function stopMeetingRoomScheduler(): void {
  task?.stop();
  task = null;
}
