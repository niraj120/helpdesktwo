export const TRIGGER_TYPES = {
  TICKET_CREATED: "ticket_created",
  TICKET_ASSIGNED_TO_ME: "ticket_assigned_to_me",
  TICKET_REPLY_ADDED: "ticket_reply_added",
  TICKET_STATUS_CHANGED: "ticket_status_changed",
  TICKET_MENTIONED: "ticket_mentioned",
  TICKET_CLOSED: "ticket_closed",
  TICKET_ESCALATED: "ticket_escalated",
  KB_ARTICLE_PUBLISHED: "kb_article_published",
  KB_ARTICLE_UPDATED: "kb_article_updated",
  KB_ARTICLE_ARCHIVED: "kb_article_archived",
  SLA_BREACH_WARNING: "sla_breach_warning",
  SLA_BREACHED: "sla_breached",
} as const;

export type TriggerType = (typeof TRIGGER_TYPES)[keyof typeof TRIGGER_TYPES];

export const TRIGGER_TYPE_VALUES = Object.values(TRIGGER_TYPES);

export const TITLE_TEMPLATES: Record<TriggerType, string> = {
  ticket_created: "New ticket #{{ticketNumber}}: {{subject}}",
  ticket_assigned_to_me: "Ticket #{{ticketNumber}} was assigned to you",
  ticket_reply_added: "{{agentName}} replied to Ticket #{{ticketNumber}}",
  ticket_status_changed:
    'Ticket #{{ticketNumber}} is now "{{newStatus}}"',
  ticket_mentioned: "You were mentioned in Ticket #{{ticketNumber}}",
  ticket_closed: "Ticket #{{ticketNumber}} has been closed",
  ticket_escalated: "Ticket #{{ticketNumber}} has been escalated",
  kb_article_published: "New article published: {{articleTitle}}",
  kb_article_updated: 'Article updated: "{{articleTitle}}"',
  kb_article_archived: 'Article archived: "{{articleTitle}}"',
  sla_breach_warning:
    "Ticket #{{ticketNumber}} SLA is due in {{timeRemaining}}",
  sla_breached: "Ticket #{{ticketNumber}} has breached its SLA",
};

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  ticket_created: "Ticket Created",
  ticket_assigned_to_me: "Ticket Assigned to Me",
  ticket_reply_added: "New Reply on Ticket",
  ticket_status_changed: "Ticket Status Changed",
  ticket_mentioned: "Mentioned in Ticket",
  ticket_closed: "Ticket Closed",
  ticket_escalated: "Ticket Escalated",
  kb_article_published: "KB Article Published",
  kb_article_updated: "KB Article Updated",
  kb_article_archived: "KB Article Archived",
  sla_breach_warning: "SLA Breach Warning",
  sla_breached: "SLA Breached",
};
