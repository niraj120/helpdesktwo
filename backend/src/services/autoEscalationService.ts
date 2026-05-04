import * as cron from "node-cron";
import SLATracking from "../models/sla-module/SLATracking";
import EscalationPolicy from "../models/sla-module/EscalationPolicy";
import { Ticket } from "../models/Ticket";
import { User } from "../models/User";
import mongoose from "mongoose";
import { sendTicketEscalatedEmail } from "../utils/emailService";
import { logError, ErrorContext, ErrorSeverity } from "../utils/errorLogger";
import {
  processAutoEscalation as processMatrixAutoEscalation,
  processSLAWarnings,
} from "./escalationMatrixService";

/**
 * Auto-Escalation Service
 * Monitors tickets for SLA breaches and automatically escalates based on policy
 */
class AutoEscalationService {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private checkInterval: string = "*/3 * * * *"; // Check every 3 minutes

  /**
   * Start the auto-escalation service
   */
  public start(): void {
    if (this.cronJob) {
      console.log("⚠️  Auto-escalation service is already running");
      return;
    }

    console.log(`🚀 Starting Auto-Escalation Service`);
    console.log(`   Check Interval: ${this.checkInterval} (every 3 minutes)`);

    // Schedule the cron job
    this.cronJob = cron.schedule(this.checkInterval, async () => {
      await this.checkAndEscalate();
    });

    console.log("✅ Auto-Escalation Service started successfully");

    // Run immediately on startup
    setTimeout(() => {
      this.checkAndEscalate();
    }, 10000); // Wait 10 seconds after server start
  }

  /**
   * Stop the auto-escalation service
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log("🛑 Auto-Escalation Service stopped");
    }
  }

  /**
   * Main logic - check tickets and auto-escalate if needed
   */
  private async checkAndEscalate(): Promise<void> {
    if (this.isRunning) {
      console.log("⏭️  Auto-escalation check already in progress, skipping");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log("\n" + "=".repeat(60));
      console.log(
        `⏰ Auto-Escalation Check Started - ${new Date().toISOString()}`,
      );
      console.log("=".repeat(60));

      // Find tickets that need auto-escalation
      const now = new Date();
      const trackings = await SLATracking.find({
        nextEscalationDue: { $lte: now },
        resolutionStatus: { $ne: "met" }, // Not yet resolved
        isPaused: false, // Not paused
      })
        .populate("ticketId")
        .populate("escalationPolicyId")
        .limit(100); // Process in batches

      // Process policy-based auto-escalation if any trackings found
      if (trackings.length > 0) {
        console.log(
          `📋 Found ${trackings.length} ticket(s) due for policy-based auto-escalation`,
        );
      } else {
        console.log("ℹ️  No policy-based tickets due for auto-escalation");
      }

      let escalated = 0;
      let failed = 0;

      for (const tracking of trackings) {
        try {
          const ticket = tracking.ticketId as any;

          if (
            !ticket ||
            ticket.status === 4 ||
            ticket.status === 5 ||
            (ticket as any).closedAt
          ) {
            // Ticket is resolved, closed (any status code), or deleted — clear next escalation
            await SLATracking.updateOne(
              { _id: tracking._id },
              { $unset: { nextEscalationDue: 1 } },
            );
            continue;
          }

          await this.escalateTicket(tracking);
          escalated++;
        } catch (error: any) {
          failed++;
          console.error(
            `❌ Failed to escalate ticket ${tracking.ticketId}:`,
            error.message,
          );

          await logError({
            message: `Auto-escalation failed: ${error.message}`,
            context: ErrorContext.EMAIL_POLLING, // Reusing context
            severity: ErrorSeverity.MEDIUM,
            details: {
              ticketId: tracking.ticketId?.toString() ?? "null",
              currentLevel: tracking.currentEscalationLevel,
              error: error.message,
            },
          });
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log("\n" + "=".repeat(60));
      console.log("📊 Auto-Escalation Summary (Policy-Based):");
      console.log(`   Checked: ${trackings.length}`);
      console.log(`   Escalated: ${escalated}`);
      console.log(`   Failed: ${failed}`);
      console.log(`   Duration: ${duration}s`);
      console.log("=".repeat(60) + "\n");

      // Also process Matrix-based auto-escalation
      try {
        console.log("🔄 Checking Matrix-based Auto-Escalation...");
        const matrixResult = await processMatrixAutoEscalation();
        console.log("📊 Auto-Escalation Summary (Matrix-Based):");
        console.log(`   Processed: ${matrixResult.processed}`);
        console.log(`   Escalated: ${matrixResult.escalated}`);
        if (matrixResult.errors.length > 0) {
          console.log(`   Errors: ${matrixResult.errors.length}`);
        }
        console.log("=".repeat(60) + "\n");
      } catch (matrixError: any) {
        console.error(
          "❌ Matrix-based auto-escalation failed:",
          matrixError.message,
        );
      }

      // US-ESC-008: Process pre-breach SLA warnings
      try {
        console.log("🔔 Checking pre-breach SLA warnings...");
        await processSLAWarnings();
      } catch (warnErr: any) {
        console.error("❌ SLA warning processing failed:", warnErr.message);
      }
    } catch (error: any) {
      console.error("❌ Auto-escalation cycle failed:", error.message);
      console.error(error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Escalate a specific ticket to the next level
   */
  private async escalateTicket(tracking: any): Promise<void> {
    const ticket = tracking.ticketId;
    const policy = tracking.escalationPolicyId;

    if (!policy || !policy.levels || policy.levels.length === 0) {
      console.log(`⚠️  No escalation policy for ticket ${ticket.ticketNumber}`);
      return;
    }

    // Get next escalation level
    const nextLevel = tracking.currentEscalationLevel + 1;
    const levelConfig = policy.levels.find((l: any) => l.level === nextLevel);

    if (!levelConfig) {
      console.log(
        `ℹ️  Ticket ${ticket.ticketNumber} reached max escalation level`,
      );
      await SLATracking.updateOne(
        { _id: tracking._id },
        { $unset: { nextEscalationDue: 1 } },
      );
      return;
    }

    // Check if this level is auto-escalation
    if (levelConfig.escalationMode !== "auto") {
      console.log(
        `⏭️  Level ${nextLevel} is manual escalation, skipping auto-escalation`,
      );
      await SLATracking.updateOne(
        { _id: tracking._id },
        { $unset: { nextEscalationDue: 1 } },
      );
      return;
    }

    console.log(
      `🔼 Auto-escalating ticket ${ticket.ticketNumber} to level ${nextLevel}`,
    );

    // Find target user(s) for escalation
    const targetUsers = await this.findEscalationTargets(
      levelConfig.escalateTo,
      ticket.project,
    );

    if (targetUsers.length === 0) {
      throw new Error(
        `No users found for escalation target: ${levelConfig.escalateTo.targetName}`,
      );
    }

    // Pick the first available user (you can implement load balancing here)
    const escalatedToUser = targetUsers[0];

    // Capture the previous assignee (handler at current level) BEFORE changing
    const previousAssigneeId = ticket.assignedTo;
    const currentLevel = tracking.currentEscalationLevel;

    // Update ticket (no transaction - MongoDB doesn't support it without replica set)
    try {
      // Add to escalation history in ticket
      if (!ticket.escalationHistory) {
        ticket.escalationHistory = [];
      }

      ticket.escalationHistory.push({
        escalatedTo: escalatedToUser._id,
        escalatedBy: previousAssigneeId || escalatedToUser._id, // Use PREVIOUS assignee, fallback to new if none
        fromLevel: currentLevel,
        toLevel: nextLevel,
        reason: `Auto-escalated from L${currentLevel} to L${nextLevel} due to SLA breach`,
        escalatedAt: new Date(),
      });

      // Reassign if configured in actions
      if (levelConfig.actions?.changePriority) {
        ticket.priority = levelConfig.actions.changePriority;
      }

      ticket.assignedTo = escalatedToUser._id;

      // Mark current role-level SLA as breached and update for new level
      if (ticket.roleLevelSLA) {
        ticket.roleLevelSLA.breachedAt = new Date();
      }

      // Calculate new role-level SLA deadline
      if (levelConfig.escalateAfter) {
        const now = new Date();
        const slaHours =
          levelConfig.escalateAfter.unit === "hours"
            ? levelConfig.escalateAfter.value
            : levelConfig.escalateAfter.unit === "minutes"
              ? levelConfig.escalateAfter.value / 60
              : levelConfig.escalateAfter.value * 24;
        const newRoleDueAt = new Date(
          now.getTime() + slaHours * 60 * 60 * 1000,
        );

        ticket.roleLevelSLA = {
          startedAt: now,
          dueAt: newRoleDueAt,
          breachedAt: undefined,
          pausedAt: undefined,
          pausedDuration: 0,
        };
        console.log(
          `   ↳ Role-level SLA updated: L${nextLevel} deadline = ${newRoleDueAt.toISOString()}`,
        );
      }

      await ticket.save();

      // Update SLA tracking
      // Use atomic updateOne + $push so Mongoose does NOT re-validate
      // pre-existing escalationHistory entries that may be missing required fields
      const newHistoryEntry = {
        level: nextLevel,
        fromLevel: currentLevel,
        escalatedAt: new Date(),
        escalatedTo: escalatedToUser._id,
        escalatedBy: previousAssigneeId || escalatedToUser._id,
        mode: "auto",
        reason: `SLA breach - Auto-escalated from L${currentLevel} to L${nextLevel}`,
      };

      const setFields: any = {
        currentEscalationLevel: nextLevel,
        lastEscalationAt: new Date(),
      };
      const unsetFields: any = {};

      // Update resolution deadline based on the new level's SLA time
      if (levelConfig.escalateAfter) {
        const escalationTime = new Date();
        const newResolutionDeadline = this.calculateEscalationDeadline(
          levelConfig.escalateAfter,
        );
        setFields.resolutionDeadline = newResolutionDeadline;

        const slaHours =
          levelConfig.escalateAfter.unit === "hours"
            ? levelConfig.escalateAfter.value
            : levelConfig.escalateAfter.unit === "minutes"
              ? levelConfig.escalateAfter.value / 60
              : levelConfig.escalateAfter.value * 24;

        console.log(`📅 L${nextLevel} SLA Timing:`);
        console.log(`   ↳ Escalation Time: ${escalationTime.toISOString()}`);
        console.log(`   ↳ SLA Duration: ${slaHours} hours`);
        console.log(
          `   ↳ Resolution Deadline: ${newResolutionDeadline.toISOString()}`,
        );
        console.log(
          `   ↳ Calculation: NOW (${escalationTime.toISOString()}) + ${slaHours}h = ${newResolutionDeadline.toISOString()}`,
        );

        // If there's a subsequent level and current mode is auto, set next escalation trigger
        const subsequentLevel = policy.levels.find(
          (l: any) => l.level === nextLevel + 1,
        );
        if (subsequentLevel && levelConfig.escalationMode === "auto") {
          setFields.nextEscalationDue = newResolutionDeadline;
          console.log(
            `   ↳ Next escalation due: ${newResolutionDeadline.toISOString()} (when L${nextLevel} SLA expires)`,
          );
        } else {
          unsetFields.nextEscalationDue = 1;
        }
      } else {
        unsetFields.nextEscalationDue = 1;
      }

      const updateOp: any = {
        $set: setFields,
        $push: { escalationHistory: newHistoryEntry },
      };
      if (Object.keys(unsetFields).length) updateOp.$unset = unsetFields;
      await SLATracking.updateOne({ _id: tracking._id }, updateOp);

      // Keep in-memory tracking object in sync for subsequent reads in this cycle
      tracking.currentEscalationLevel = nextLevel;

      console.log(
        `✅ Ticket ${ticket.ticketNumber} escalated to ${escalatedToUser.firstName} ${escalatedToUser.lastName}`,
      );

      // Send notification
      await this.sendEscalationNotification(
        ticket,
        escalatedToUser,
        levelConfig,
        nextLevel,
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Find users based on escalation target
   */
  private async findEscalationTargets(
    escalateTo: any,
    projectId: mongoose.Types.ObjectId,
  ): Promise<any[]> {
    switch (escalateTo.type) {
      case "user":
        const user = await User.findById(escalateTo.targetId);
        return user ? [user] : [];

      case "role":
        return await User.find({
          role: escalateTo.targetId,
          isActive: true,
          projects: { $in: [projectId] },
        }).limit(10);

      case "group":
        // Implement group logic if you have groups
        return [];

      default:
        return [];
    }
  }

  /**
   * Calculate escalation deadline
   */
  private calculateEscalationDeadline(escalateAfter: {
    value: number;
    unit: "minutes" | "hours" | "days";
  }): Date {
    const now = new Date();
    let minutes = 0;

    switch (escalateAfter.unit) {
      case "minutes":
        minutes = escalateAfter.value;
        break;
      case "hours":
        minutes = escalateAfter.value * 60;
        break;
      case "days":
        minutes = escalateAfter.value * 24 * 60;
        break;
    }

    return new Date(now.getTime() + minutes * 60 * 1000);
  }

  /**
   * Send escalation notification
   */
  private async sendEscalationNotification(
    ticket: any,
    escalatedToUser: any,
    levelConfig: any,
    level: number,
  ): Promise<void> {
    try {
      if (
        levelConfig.notifyMethod?.includes("email") &&
        escalatedToUser.email
      ) {
        await sendTicketEscalatedEmail(
          escalatedToUser.email,
          ticket.ticketNumber,
          ticket.subject,
          `${escalatedToUser.firstName} ${escalatedToUser.lastName}`,
          ticket.project,
        );

        console.log(
          `📧 Escalation notification sent to ${escalatedToUser.email}`,
        );
      }
    } catch (error: any) {
      console.error(
        `⚠️  Failed to send escalation notification:`,
        error.message,
      );
      // Don't throw - escalation still succeeded
    }

    // Push notification to the newly assigned agent
    try {
      const {
        createNotification,
      } = require("../controllers/notificationController");
      const projId =
        ticket?.metadata?.projectId?._id?.toString() ||
        ticket?.metadata?.projectId?.toString() ||
        ticket?.project?.toString();
      if (projId && escalatedToUser._id) {
        const isProduction = process.env.NODE_ENV === "production";
        const frontendUrl = isProduction
          ? process.env.PRODUCTION_FRONTEND_URL ||
            "https://helpdesk.hubblehox.ai"
          : process.env.FRONTEND_URL || "http://localhost:3001";
        await createNotification({
          userId: new mongoose.Types.ObjectId(escalatedToUser._id.toString()),
          projectId: new mongoose.Types.ObjectId(projId),
          type: "info" as const,
          title: `Ticket Auto-Escalated to You: ${ticket.ticketNumber}`,
          message: ticket.subject || "Ticket auto-escalated",
          ticketId: ticket._id,
          link: `${frontendUrl}/tickets/${ticket._id}`,
        });
      }
    } catch (pushErr: any) {
      console.error(
        `⚠️  Failed to send auto-escalation push notification:`,
        pushErr.message,
      );
      // Don't throw - escalation still succeeded
    }
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isRunning: boolean;
    isActive: boolean;
    interval: string;
  } {
    return {
      isRunning: this.isRunning,
      isActive: this.cronJob !== null,
      interval: this.checkInterval,
    };
  }
}

// Export singleton instance
export const autoEscalationService = new AutoEscalationService();
