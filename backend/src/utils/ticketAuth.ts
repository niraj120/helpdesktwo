/**
 * Shared ticket (query) authorization helpers.
 *
 * Ownership model: an agent may MUTATE a ticket (comment, reply, status,
 * priority, category, escalate, attachments, edit) only when they are the
 * CURRENT ASSIGNEE, or when they hold the supervisor capability for that kind
 * of record — TICKET_MODIFY_ANY for a normal query, SR_MODIFY_ANY for a PSR or
 * ISR. Merely having "View Queries" (TICKET_VIEW_ALL) grants read-only access
 * to other people's tickets.
 *
 * NOTE: assign / reassign are intentionally NOT governed by this — they are
 * controlled solely by the TICKET_ASSIGN / TICKET_REASSIGN permissions.
 */

/**
 * True when the user can act on ANY ticket regardless of assignment.
 * SUPER_ADMIN is always allowed as a safety net (so admins can't be locked out
 * before the permission is re-seeded onto their role / refreshed in their token).
 * Accepts permissions as code strings or populated permission objects.
 */
export function hasModifyAnyTicket(user: any, interactionType?: string | null): boolean {
  if (user?.role?.code === "SUPER_ADMIN") return true;
  const perms = user?.role?.permissions;
  if (!Array.isArray(perms)) return false;
  // Service requests carry their own supervisor capability: SR_MODIFY_ANY does
  // not let you loose on the query desk, and TICKET_MODIFY_ANY does not let you
  // loose on service requests.
  const required =
    interactionType === "PSR" || interactionType === "ISR"
      ? "SR_MODIFY_ANY"
      : "TICKET_MODIFY_ANY";
  return perms.some(
    (p: any) => (typeof p === "string" ? p : p?.code) === required,
  );
}

/**
 * Whether `user` (with role.permissions) may mutate `ticket`.
 * `ticket.assignedTo` may be a raw ObjectId or a populated { _id } document.
 */
export function canModifyTicket(
  userId: string,
  ticket: any,
  user: any,
): boolean {
  if (hasModifyAnyTicket(user, ticket?.interactionType)) return true;
  const assigneeId = ticket?.assignedTo?._id
    ? ticket.assignedTo._id.toString()
    : ticket?.assignedTo?.toString();
  return !!assigneeId && assigneeId === userId;
}
