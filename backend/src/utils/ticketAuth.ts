/**
 * Shared ticket (query) authorization helpers.
 *
 * Ownership model: an agent may MUTATE a ticket (comment, reply, status,
 * priority, category, escalate, attachments, edit) only when they are the
 * CURRENT ASSIGNEE, or when they hold the TICKET_MODIFY_ANY permission
 * (supervisor/admin capability). Merely having "View Queries"
 * (TICKET_VIEW_ALL) grants read-only access to other people's tickets.
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
export function hasModifyAnyTicket(user: any): boolean {
  if (user?.role?.code === "SUPER_ADMIN") return true;
  const perms = user?.role?.permissions;
  if (!Array.isArray(perms)) return false;
  return perms.some(
    (p: any) => (typeof p === "string" ? p : p?.code) === "TICKET_MODIFY_ANY",
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
  if (hasModifyAnyTicket(user)) return true;
  const assigneeId = ticket?.assignedTo?._id
    ? ticket.assignedTo._id.toString()
    : ticket?.assignedTo?.toString();
  return !!assigneeId && assigneeId === userId;
}
