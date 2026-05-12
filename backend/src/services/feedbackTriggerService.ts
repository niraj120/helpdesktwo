import { FeedbackForm } from "../models/FeedbackForm";
import { scheduleFeedbackEmail } from "./feedbackEmailService";

interface TriggerContext {
  projectId: string;
  ticketId?: string;
  studentId?: string;
  statusId?: string;
  agentId?: string;
}

/**
 * Check and trigger feedback forms based on event type
 * @param triggerType - The event that occurred
 * @param context - Context data for the event
 */
export const checkAndTriggerFeedback = async (
  triggerType:
    | "ticket_created"
    | "ticket_status_changed"
    | "ticket_closed"
    | "student_registered"
    | "agent_assigned",
  context: TriggerContext,
): Promise<void> => {
  try {
    console.log(
      `🔔 Checking feedback triggers for: ${triggerType}, project: ${context.projectId}, ticket: ${context.ticketId}`,
    );

    // Find all active feedback forms for this project with matching trigger
    const feedbackForms = await FeedbackForm.find({
      projectId: context.projectId,
      isActive: true,
      "triggers.type": triggerType,
      "triggers.enabled": true,
    });

    console.log(
      `📋 Found ${feedbackForms.length} active feedback form(s) with ${triggerType} trigger`,
    );

    for (const form of feedbackForms) {
      // Get the specific trigger configuration
      const trigger = form.triggers?.find(
        (t) => t.type === triggerType && t.enabled,
      );

      if (!trigger) continue;

      // Check trigger conditions
      let shouldTrigger = true;

      // For status change triggers, check if status matches
      if (triggerType === "ticket_status_changed" && context.statusId) {
        if (
          trigger.conditions?.statusIds &&
          trigger.conditions.statusIds.length > 0
        ) {
          shouldTrigger = trigger.conditions.statusIds.includes(
            context.statusId,
          );
        }
      }

      // If conditions are met, schedule feedback email
      if (shouldTrigger && context.ticketId) {
        const delayMinutes = form.settings?.emailDelay || 0;
        console.log(
          `✅ Triggering feedback: ${form.name}, delay: ${delayMinutes} min`,
        );
        await scheduleFeedbackEmail(
          context.ticketId,
          delayMinutes,
          form._id.toString(),
        );
        console.log(
          `📧 Feedback email scheduled for trigger: ${triggerType}, form: ${form.name}, delay: ${delayMinutes} min`,
        );
      } else {
        console.log(
          `⏭️  Skipping feedback form: ${form.name} (shouldTrigger: ${shouldTrigger}, hasTicketId: ${!!context.ticketId})`,
        );
      }
    }
  } catch (error) {
    console.error("❌ Error checking feedback triggers:", error);
    // Don't throw error - feedback is not critical
  }
};
