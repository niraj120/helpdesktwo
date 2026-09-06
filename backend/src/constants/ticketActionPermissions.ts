/**
 * Ticket actions and the permission that governs each, per record type.
 *
 * A PSR/ISR is stored as a Ticket (`interactionType`) and is worked through the
 * same routes and the same detail screen as a normal query. The two are
 * nonetheless separate products with separate audiences, so each action is
 * governed by its own permission on each side: TICKET_* for a normal query,
 * SR_* for a service request. Nothing is shared — granting an agent the run of
 * the query desk gives them no reach over service requests, and vice versa.
 *
 * This map is the single source of truth. `requireTicketAction` (backend) reads
 * it per request after resolving the record's interactionType; the frontend
 * mirrors it in constants/ticketActionPermissions.ts for button visibility.
 * Add an action here rather than hardcoding a pair of codes at a call site.
 */
export type TicketAction =
  | "VIEW"
  | "EDIT"
  | "REPLY"
  | "COMMENT"
  | "ATTACH"
  | "DELETE_ATTACHMENT"
  | "CHANGE_STATUS"
  | "CHANGE_PRIORITY"
  | "CHANGE_CATEGORY"
  | "ESCALATE"
  | "ASSIGN"
  | "REASSIGN"
  | "DELEGATE"
  | "CLOSE"
  | "REOPEN"
  | "CANCEL"
  | "MERGE"
  | "LINK"
  | "DELETE"
  | "BULK_UPDATE"
  | "EXPORT";

export interface ActionPermissions {
  /** Accepted when the record is a normal query (interactionType normal/absent). */
  ticket: string[];
  /** Accepted when the record is a PSR or ISR. */
  sr: string[];
}

export const ACTION_PERMISSIONS: Record<TicketAction, ActionPermissions> = {
  VIEW: {
    ticket: ["TICKET_VIEW_ALL", "TICKET_VIEW_OWN"],
    sr: ["SR_VIEW_ALL", "SR_VIEW_OWN"],
  },
  EDIT: { ticket: ["TICKET_EDIT"], sr: ["SR_EDIT"] },
  REPLY: { ticket: ["TICKET_REPLY", "TICKET_ADD_COMMENT"], sr: ["SR_REPLY"] },
  COMMENT: { ticket: ["TICKET_ADD_COMMENT"], sr: ["SR_ADD_COMMENT"] },
  ATTACH: { ticket: ["TICKET_ADD_ATTACHMENT"], sr: ["SR_ADD_ATTACHMENT"] },
  DELETE_ATTACHMENT: {
    ticket: ["TICKET_DELETE_ATTACHMENT"],
    sr: ["SR_DELETE_ATTACHMENT"],
  },
  CHANGE_STATUS: {
    ticket: ["TICKET_CHANGE_STATUS"],
    sr: ["SR_CHANGE_STATUS"],
  },
  CHANGE_PRIORITY: {
    ticket: ["TICKET_CHANGE_PRIORITY"],
    sr: ["SR_CHANGE_PRIORITY"],
  },
  CHANGE_CATEGORY: {
    ticket: ["TICKET_CHANGE_CATEGORY"],
    sr: ["SR_CHANGE_CATEGORY"],
  },
  ESCALATE: { ticket: ["TICKET_ESCALATE"], sr: ["SR_ESCALATE"] },
  ASSIGN: { ticket: ["TICKET_ASSIGN"], sr: ["SR_ASSIGN"] },
  REASSIGN: { ticket: ["TICKET_REASSIGN"], sr: ["SR_REASSIGN"] },
  DELEGATE: { ticket: ["TICKET_DELEGATE"], sr: ["SR_DELEGATE"] },
  CLOSE: { ticket: ["TICKET_CLOSE"], sr: ["SR_CLOSE"] },
  REOPEN: { ticket: ["TICKET_REOPEN"], sr: ["SR_REOPEN"] },
  CANCEL: { ticket: ["TICKET_CANCEL"], sr: ["SR_CANCEL"] },
  MERGE: { ticket: ["TICKET_MERGE"], sr: ["SR_MERGE"] },
  LINK: { ticket: ["TICKET_LINK"], sr: ["SR_ISR_LINK"] },
  DELETE: { ticket: ["TICKET_DELETE"], sr: ["SR_DELETE"] },
  BULK_UPDATE: { ticket: ["TICKET_BULK_UPDATE"], sr: ["SR_BULK_UPDATE"] },
  EXPORT: { ticket: ["TICKET_EXPORT"], sr: ["SR_EXPORT"] },
};

/** True when a ticket document is a service request rather than a normal query. */
export function isServiceRequest(interactionType?: string | null): boolean {
  return interactionType === "PSR" || interactionType === "ISR";
}

/** The permission codes that allow `action` on a record of this type. */
export function permissionsFor(
  action: TicketAction,
  interactionType?: string | null,
): string[] {
  const pair = ACTION_PERMISSIONS[action];
  return isServiceRequest(interactionType) ? pair.sr : pair.ticket;
}
