/**
 * Which permission governs which action, per record type.
 *
 * Mirrors backend/src/constants/ticketActionPermissions.ts — keep the two in
 * step. A PSR/ISR is stored as a Ticket and is worked through the same detail
 * screen as a normal query, but the two carry separate permission sets: a
 * query-desk agent gets no reach over service requests, and vice versa. The
 * screen therefore has to ask "may I do X to THIS record", not "may I do X".
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
  | "EXPORT"
  | "MODIFY_ANY";

export const ACTION_PERMISSIONS: Record<
  TicketAction,
  { ticket: string[]; sr: string[] }
> = {
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
  CHANGE_STATUS: { ticket: ["TICKET_CHANGE_STATUS"], sr: ["SR_CHANGE_STATUS"] },
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
  MODIFY_ANY: { ticket: ["TICKET_MODIFY_ANY"], sr: ["SR_MODIFY_ANY"] },
};

/** True when a record is a service request rather than a normal query. */
export const isServiceRequest = (interactionType?: string | null): boolean =>
  interactionType === "PSR" || interactionType === "ISR";

/** The codes that allow `action` on a record of this type. */
export const permissionsFor = (
  action: TicketAction,
  interactionType?: string | null,
): string[] => {
  const pair = ACTION_PERMISSIONS[action];
  return isServiceRequest(interactionType) ? pair.sr : pair.ticket;
};

/**
 * Whether `permissions` allows `action` on a record of this type.
 * Pass the record's interactionType so a PSR is judged by SR_* and a query by
 * TICKET_* — the whole point of the split.
 */
export const canDo = (
  permissions: string[],
  action: TicketAction,
  interactionType?: string | null,
): boolean =>
  permissionsFor(action, interactionType).some((code) =>
    permissions.includes(code),
  );
