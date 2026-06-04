import * as cron from "node-cron";
import { AttendanceConfig } from "../models/attendance/AttendanceConfig";
import { runAttendanceSync } from "./attendanceSyncService";

/**
 * Attendance Sync Scheduler
 *
 * On startup, reads all active tenant AttendanceConfig documents and schedules
 * a node-cron job for each time slot in syncSchedule.
 *
 * When config is updated via PUT /api/attendance/config, call
 * attendanceScheduler.rebuildProjectSchedule(projectId) to re-register jobs.
 */

type ProjectId = string;
// Map: projectId → array of active cron tasks
const projectJobs = new Map<ProjectId, cron.ScheduledTask[]>();

function buildCronExpression(timeSlot: string): string {
  // Input: "09:00" → cron: "0 9 * * *"
  const [hh, mm] = timeSlot.split(":");
  return `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * *`;
}

function scheduleProject(projectId: string, schedule: string[]): void {
  // Clear any existing jobs for this project
  const existing = projectJobs.get(projectId) || [];
  existing.forEach((task) => task.stop());
  projectJobs.delete(projectId);

  const tasks: cron.ScheduledTask[] = [];

  for (const timeSlot of schedule) {
    const cronExpr = buildCronExpression(timeSlot);
    if (!cron.validate(cronExpr)) {
      console.warn(
        `[AttendanceScheduler] Invalid cron expression "${cronExpr}" for slot "${timeSlot}" (project ${projectId}) — skipped`,
      );
      continue;
    }

    const task = cron.schedule(
      cronExpr,
      async () => {
        console.log(
          `[AttendanceScheduler] Scheduled sync starting for project ${projectId} at ${timeSlot}`,
        );
        try {
          await runAttendanceSync(projectId, "SCHEDULE");
        } catch (err) {
          console.error(
            `[AttendanceScheduler] Sync error for project ${projectId}:`,
            err,
          );
        }
      },
      // syncSchedule times are entered in IST. Without this, node-cron uses the
      // server's local clock (UTC in prod) and fires 5h30m off — e.g. an 09:00
      // IST slot would run at 14:30 IST. Matches attendanceAlertScheduler.
      { timezone: "Asia/Kolkata" },
    );

    tasks.push(task);
    console.log(
      `[AttendanceScheduler] Scheduled sync for project ${projectId} at ${timeSlot} (cron: ${cronExpr})`,
    );
  }

  if (tasks.length > 0) {
    projectJobs.set(projectId, tasks);
  }
}

class AttendanceScheduler {
  private initialised = false;

  /**
   * Load all active configs from MongoDB and schedule cron jobs.
   * Called once on server startup.
   */
  public async start(): Promise<void> {
    if (this.initialised) return;
    this.initialised = true;

    console.log("[AttendanceScheduler] Starting...");

    try {
      const configs = await AttendanceConfig.find({ syncActive: true }).lean();
      let scheduled = 0;

      for (const config of configs) {
        if (config.syncSchedule?.length) {
          scheduleProject(config.projectId.toString(), config.syncSchedule);
          scheduled++;
        }
      }

      console.log(
        `[AttendanceScheduler] Started. Scheduled sync for ${scheduled} project(s).`,
      );
    } catch (err) {
      console.error(
        "[AttendanceScheduler] Failed to load configs on start:",
        err,
      );
    }
  }

  /**
   * Rebuild cron jobs for a specific project after its config changes.
   * Call this from the attendance config PUT endpoint.
   */
  public async rebuildProjectSchedule(projectId: string): Promise<void> {
    try {
      const config = await AttendanceConfig.findOne({ projectId }).lean();

      if (!config || !config.syncActive) {
        // Stop all jobs for this project
        const existing = projectJobs.get(projectId) || [];
        existing.forEach((t) => t.stop());
        projectJobs.delete(projectId);
        console.log(
          `[AttendanceScheduler] Stopped jobs for project ${projectId} (inactive or deleted)`,
        );
        return;
      }

      scheduleProject(projectId, config.syncSchedule || []);
    } catch (err) {
      console.error(
        `[AttendanceScheduler] Failed to rebuild schedule for project ${projectId}:`,
        err,
      );
    }
  }

  /**
   * Stop all scheduled jobs (used on graceful shutdown).
   */
  public stop(): void {
    for (const [projectId, tasks] of projectJobs.entries()) {
      tasks.forEach((t) => t.stop());
      console.log(
        `[AttendanceScheduler] Stopped jobs for project ${projectId}`,
      );
    }
    projectJobs.clear();
    this.initialised = false;
    console.log("[AttendanceScheduler] All jobs stopped.");
  }
}

export const attendanceScheduler = new AttendanceScheduler();
