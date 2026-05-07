import SLATracking from "../models/sla-module/SLATracking";
import SLARule from "../models/sla-module/SLARule";
import EscalationPolicy from "../models/sla-module/EscalationPolicy";
import CategorySLA from "../models/ticket-module/CategorySLA";
import mongoose from "mongoose";

/**
 * SLA Helper Service
 * Utilities for managing SLA tracking
 */

/**
 * Initialize SLA tracking for a new ticket.
 *
 * US-017: If a CategorySLA override exists for the ticket's Level-1 category,
 * it takes precedence over the priority-based SLARule.  The `slaSource` field
 * on the resulting SLATracking document records which source was used:
 *   'category' — CategorySLA override applied
 *   'priority' — SLARule matched by priority
 *   'default'  — no matching rule; fallback times used (not currently saved)
 */
export const initializeSLATracking = async (
  ticketId: mongoose.Types.ObjectId,
  projectId: mongoose.Types.ObjectId,
  priority: string,
  createdAt: Date = new Date(),
  /** Optional Level-1 category ObjectId (string or ObjectId) — used by US-017 */
  categoryId?: string | mongoose.Types.ObjectId,
): Promise<void> => {
  try {
    // ── US-017: Try category-level SLA override first ────────────────────
    if (categoryId) {
      const categorySLA = await CategorySLA.findOne({
        categoryId: categoryId,
        isActive: true,
      });

      if (categorySLA) {
        const responseDeadline = calculateDeadline(
          createdAt,
          categorySLA.responseTime,
        );
        const resolutionDeadline = calculateDeadline(
          createdAt,
          categorySLA.resolutionTime,
        );

        const tracking = new SLATracking({
          ticketId,
          projectId,
          slaSource: "category",
          responseDeadline,
          resolutionDeadline,
          responseStatus: "pending",
          resolutionStatus: "pending",
          currentEscalationLevel: 0,
          escalationHistory: [],
          isPaused: false,
          pausedDuration: 0,
        });

        await tracking.save();
        console.log(
          `✅ SLA tracking initialized (category override) for ticket ${ticketId}: response=${categorySLA.responseTime.value}${categorySLA.responseTime.unit} resolution=${categorySLA.resolutionTime.value}${categorySLA.resolutionTime.unit}`,
        );
        return;
      }
    }
    // ── Find applicable SLA rule (fallback to priority-based) ────────────
    // Find applicable SLA rule
    const slaRule = await SLARule.findOne({
      projectIds: { $in: [projectId] },
      priority: priority,
      isActive: true,
    });

    if (!slaRule) {
      console.log(
        `ℹ️  No SLA rule found for project ${projectId} and priority ${priority}`,
      );
      return;
    }

    // Calculate deadlines
    const responseDeadline = calculateDeadline(createdAt, slaRule.responseTime);

    // Get escalation policy
    const escalationPolicy = slaRule.escalationPolicyId
      ? await EscalationPolicy.findById(slaRule.escalationPolicyId)
      : null;

    // Calculate resolution deadline — use sum of ALL level times so the overall
    // SLA clock is never reset when the ticket escalates between levels.
    let resolutionDeadline: Date;
    let nextEscalationDue: Date | undefined = undefined;

    if (escalationPolicy && escalationPolicy.levels.length > 0) {
      const firstLevel = escalationPolicy.levels.find((l) => l.level === 1);

      // Sum every level's escalateAfter duration to get the true overall deadline
      const totalMs = escalationPolicy.levels.reduce((sum, l) => {
        const after = (l as any).escalateAfter;
        if (!after?.value) return sum;
        const hrs =
          after.unit === "minutes"
            ? after.value / 60
            : after.unit === "days"
              ? after.value * 24
              : after.value;
        return sum + hrs * 3600000;
      }, 0);

      resolutionDeadline =
        totalMs > 0
          ? new Date(new Date(createdAt).getTime() + totalMs)
          : calculateDeadline(createdAt, slaRule.resolutionTime);

      console.log(
        `📅 Overall SLA deadline (sum of all ${escalationPolicy.levels.length} level(s)): ${resolutionDeadline.toISOString()}`,
      );

      // nextEscalationDue = when L1 SLA expires (triggers first escalation)
      if (firstLevel && firstLevel.escalationMode === "auto") {
        nextEscalationDue = calculateDeadline(
          createdAt,
          firstLevel.escalateAfter,
        );
      }
    } else {
      // No escalation policy - use SLA rule resolution time
      resolutionDeadline = calculateDeadline(createdAt, slaRule.resolutionTime);
    }

    // Create SLA tracking record
    const tracking = new SLATracking({
      ticketId,
      projectId,
      slaRuleId: slaRule._id,
      escalationPolicyId: escalationPolicy?._id,
      slaSource: "priority",
      responseDeadline,
      resolutionDeadline,
      responseStatus: "pending",
      resolutionStatus: "pending",
      currentEscalationLevel: 0,
      nextEscalationDue,
      escalationHistory: [],
      isPaused: false,
      pausedDuration: 0,
    });

    await tracking.save();
    console.log(`✅ SLA tracking initialized for ticket ${ticketId}`);
  } catch (error: any) {
    console.error("❌ Failed to initialize SLA tracking:", error.message);
    throw error;
  }
};

/**
 * Update SLA tracking when ticket receives first response
 */
export const recordFirstResponse = async (
  ticketId: mongoose.Types.ObjectId,
  responseAt: Date = new Date(),
): Promise<void> => {
  try {
    const tracking = await SLATracking.findOne({ ticketId });
    if (!tracking) {
      console.log(`⚠️  No SLA tracking found for ticket ${ticketId}`);
      return;
    }

    if (tracking.firstResponseAt) {
      // Already recorded
      return;
    }

    // Calculate response time in minutes
    const createdAt = tracking.createdAt;
    const responseTime = Math.floor(
      (responseAt.getTime() - createdAt.getTime()) / 60000,
    );

    tracking.firstResponseAt = responseAt;
    tracking.responseTime = responseTime;

    // Check if response SLA was met
    if (tracking.responseDeadline) {
      tracking.responseStatus =
        responseAt <= tracking.responseDeadline ? "met" : "breached";
    } else {
      tracking.responseStatus = "met";
    }

    await tracking.save();
    console.log(
      `✅ First response recorded for ticket ${ticketId} (${responseTime} minutes)`,
    );
  } catch (error: any) {
    console.error("❌ Failed to record first response:", error.message);
  }
};

/**
 * Update SLA tracking when ticket is resolved
 */
export const recordResolution = async (
  ticketId: mongoose.Types.ObjectId,
  resolvedAt: Date = new Date(),
): Promise<void> => {
  try {
    const tracking = await SLATracking.findOne({ ticketId });
    if (!tracking) {
      console.log(`⚠️  No SLA tracking found for ticket ${ticketId}`);
      return;
    }

    if (tracking.resolvedAt) {
      // Already recorded
      return;
    }

    // Calculate resolution time in minutes (excluding paused duration)
    const createdAt = tracking.createdAt;
    const totalTime = Math.floor(
      (resolvedAt.getTime() - createdAt.getTime()) / 60000,
    );
    const resolutionTime = totalTime - tracking.pausedDuration;

    tracking.resolvedAt = resolvedAt;
    tracking.resolutionTime = resolutionTime;

    // Check if resolution SLA was met
    tracking.resolutionStatus =
      resolvedAt <= tracking.resolutionDeadline ? "met" : "breached";

    // Clear next escalation (ticket is resolved)
    tracking.nextEscalationDue = undefined;

    await tracking.save();
    console.log(
      `✅ Resolution recorded for ticket ${ticketId} (${resolutionTime} minutes)`,
    );
  } catch (error: any) {
    console.error("❌ Failed to record resolution:", error.message);
  }
};

/**
 * Pause SLA tracking (e.g., when ticket is on hold)
 */
export const pauseSLATracking = async (
  ticketId: mongoose.Types.ObjectId,
): Promise<void> => {
  try {
    const tracking = await SLATracking.findOne({ ticketId });
    if (!tracking) {
      console.log(`⚠️  No SLA tracking found for ticket ${ticketId}`);
      return;
    }

    if (tracking.isPaused) {
      return; // Already paused
    }

    tracking.isPaused = true;
    tracking.pausedAt = new Date();
    await tracking.save();

    console.log(`⏸️  SLA tracking paused for ticket ${ticketId}`);
  } catch (error: any) {
    console.error("❌ Failed to pause SLA tracking:", error.message);
  }
};

/**
 * Resume SLA tracking (e.g., when ticket is back to active)
 */
export const resumeSLATracking = async (
  ticketId: mongoose.Types.ObjectId,
): Promise<void> => {
  try {
    const tracking = await SLATracking.findOne({ ticketId });
    if (!tracking) {
      console.log(`⚠️  No SLA tracking found for ticket ${ticketId}`);
      return;
    }

    if (!tracking.isPaused) {
      return; // Not paused
    }

    // Calculate paused duration
    if (tracking.pausedAt) {
      const pauseDuration = Math.floor(
        (Date.now() - tracking.pausedAt.getTime()) / 60000,
      );
      tracking.pausedDuration += pauseDuration;

      // Extend deadlines by the paused duration
      if (tracking.responseDeadline && !tracking.firstResponseAt) {
        tracking.responseDeadline = new Date(
          tracking.responseDeadline.getTime() + pauseDuration * 60000,
        );
      }

      tracking.resolutionDeadline = new Date(
        tracking.resolutionDeadline.getTime() + pauseDuration * 60000,
      );

      if (tracking.nextEscalationDue) {
        tracking.nextEscalationDue = new Date(
          tracking.nextEscalationDue.getTime() + pauseDuration * 60000,
        );
      }
    }

    tracking.isPaused = false;
    tracking.pausedAt = undefined;
    await tracking.save();

    console.log(`▶️  SLA tracking resumed for ticket ${ticketId}`);
  } catch (error: any) {
    console.error("❌ Failed to resume SLA tracking:", error.message);
  }
};

/**
 * Manual escalation - record in tracking
 */
export const recordManualEscalation = async (
  ticketId: mongoose.Types.ObjectId,
  escalatedTo: mongoose.Types.ObjectId,
  escalatedBy: mongoose.Types.ObjectId,
  reason: string,
  level?: number,
): Promise<void> => {
  try {
    const tracking = await SLATracking.findOne({ ticketId });
    if (!tracking) {
      console.log(`⚠️  No SLA tracking found for ticket ${ticketId}`);
      return;
    }

    const escalationLevel = level || tracking.currentEscalationLevel + 1;

    tracking.escalationHistory.push({
      level: escalationLevel,
      escalatedAt: new Date(),
      escalatedTo,
      escalatedBy,
      mode: "manual",
      reason,
    });

    tracking.currentEscalationLevel = escalationLevel;
    tracking.lastEscalationAt = new Date();

    await tracking.save();
    console.log(`✅ Manual escalation recorded for ticket ${ticketId}`);
  } catch (error: any) {
    console.error("❌ Failed to record manual escalation:", error.message);
  }
};

/**
 * Calculate deadline based on time value and unit
 */
function calculateDeadline(
  startTime: Date,
  timeConfig: { value: number; unit: "minutes" | "hours" | "days" },
): Date {
  let minutes = 0;

  switch (timeConfig.unit) {
    case "minutes":
      minutes = timeConfig.value;
      break;
    case "hours":
      minutes = timeConfig.value * 60;
      break;
    case "days":
      minutes = timeConfig.value * 24 * 60;
      break;
  }

  return new Date(startTime.getTime() + minutes * 60 * 1000);
}

/**
 * Get SLA status for a ticket
 */
export const getSLAStatus = async (
  ticketId: mongoose.Types.ObjectId,
): Promise<any> => {
  try {
    const tracking = await SLATracking.findOne({ ticketId })
      .populate("slaRuleId")
      .populate("escalationPolicyId");

    if (!tracking) {
      return null;
    }

    const now = new Date();
    const responseTimeRemaining = tracking.responseDeadline
      ? Math.max(
          0,
          Math.floor(
            (tracking.responseDeadline.getTime() - now.getTime()) / 60000,
          ),
        )
      : null;

    const resolutionTimeRemaining = Math.max(
      0,
      Math.floor(
        (tracking.resolutionDeadline.getTime() - now.getTime()) / 60000,
      ),
    );

    return {
      responseStatus: tracking.responseStatus,
      resolutionStatus: tracking.resolutionStatus,
      responseDeadline: tracking.responseDeadline,
      resolutionDeadline: tracking.resolutionDeadline,
      responseTimeRemaining,
      resolutionTimeRemaining,
      currentEscalationLevel: tracking.currentEscalationLevel,
      nextEscalationDue: tracking.nextEscalationDue,
      isPaused: tracking.isPaused,
      escalationHistory: tracking.escalationHistory,
    };
  } catch (error: any) {
    console.error("❌ Failed to get SLA status:", error.message);
    return null;
  }
};
