/**
 * Human labels for the widget `module` each definition carries.
 *
 * The API returns the raw key ("service_request"), and the dashboard builder
 * groups by it — without this the group headings read like database values.
 * Unknown keys fall back to a tidied version of the key itself, so a new
 * module shows up sensibly before anyone adds it here.
 */
export const WIDGET_MODULE_LABELS: Record<string, string> = {
  ticketing: "Tickets",
  tickets: "Tickets",
  service_request: "Service Requests",
  users: "Users",
  onboarding: "Onboarding",
  attendance: "Attendance",
  capacity: "Capacity",
  feedback: "Feedback",
  satisfaction: "Satisfaction",
  kb: "Knowledge Base",
  system: "System",
};

export const widgetModuleLabel = (key: string): string =>
  WIDGET_MODULE_LABELS[key] ??
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
