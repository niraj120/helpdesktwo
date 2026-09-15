/**
 * Interaction-aware permission gate for the shared ticket endpoints.
 *
 * `/api/tickets/:id/*` serves normal queries, PSRs and ISRs alike — they are one
 * collection distinguished by `interactionType`. A fixed `checkPermission`
 * cannot express "TICKET_CLOSE closes a query, SR_CLOSE closes a service
 * request", so this resolves the record first and then applies the permission
 * that belongs to that record type, per ACTION_PERMISSIONS.
 *
 * Ownership (assignee vs TICKET_MODIFY_ANY) is enforced separately by
 * canModifyTicket in the controllers; this decides only whether the caller may
 * perform the action on this KIND of record at all.
 */
import { Response, NextFunction, RequestHandler } from "express";
import { AuthRequest } from "./auth";
import { Ticket } from "../models/Ticket";
import {
  TicketAction,
  permissionsFor,
  isServiceRequest,
} from "../constants/ticketActionPermissions";

/** Mirrors the Super Admin bypass used by checkPermission. */
function isSuperAdmin(req: AuthRequest): boolean {
  const role = req.user?.role;
  if (!role) return false;
  return role.code === "SUPER_ADMIN" || role.name === "Super Admin";
}

function holds(req: AuthRequest, codes: string[]): boolean {
  const rolePerms = req.user?.role?.permissions || [];
  return codes.some((code) =>
    rolePerms.some((p: any) => {
      const permCode = typeof p === "string" ? p : p?.code;
      const permName = typeof p === "string" ? p : p?.name;
      return permCode === code || permName === code;
    }),
  );
}

/**
 * Require the permission governing `action` on the ticket named by `:id`.
 * `idParam` allows routes that carry the id under a different name.
 */
export const requireTicketAction =
  (action: TicketAction, idParam = "id"): RequestHandler =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (isSuperAdmin(req)) return next();

      const id = (req.params as any)?.[idParam];
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Ticket id is required" });
        return;
      }

      // Only the discriminator is needed to choose the permission set.
      const ticket = await Ticket.findById(id).select("interactionType").lean();
      if (!ticket) {
        res.status(404).json({ success: false, message: "Ticket not found" });
        return;
      }

      const interactionType = (ticket as any).interactionType;
      const codes = permissionsFor(action, interactionType);

      if (holds(req, codes)) return next();

      const kind = isServiceRequest(interactionType)
        ? `${interactionType} service request`
        : "query";
      console.log(
        `❌ [PERMISSION] ${req.user?.email} lacks ${codes.join(" / ")} for ${action} on a ${kind}`,
      );
      res.status(403).json({
        success: false,
        message: `Forbidden: you do not have permission to ${action
          .toLowerCase()
          .replace(/_/g, " ")} this ${kind}`,
      });
      return;
    } catch (err) {
      console.error("Ticket action permission check failed:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
      return;
    }
  };

/**
 * Same idea for endpoints that take the ticket as a QUERY parameter and may be
 * called for any of several actions — e.g. the assignable-agent list, which
 * both Assign and Reassign use. With a ticket id, the permission follows that
 * record's type (SR_* for a PSR/ISR, TICKET_* for a query); without one there
 * is no record to judge, so the TICKET_* codes apply as before.
 */
export const requireTicketActionAnyOf =
  (actions: TicketAction[], queryKey = "ticketId"): RequestHandler =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (isSuperAdmin(req)) return next();

      const id = (req.query as any)?.[queryKey];
      let interactionType: string | undefined;
      if (id && typeof id === "string" && /^[a-f0-9]{24}$/i.test(id)) {
        const ticket = await Ticket.findById(id).select("interactionType").lean();
        interactionType = (ticket as any)?.interactionType;
      }
      const codes = actions.flatMap((a) => permissionsFor(a, interactionType));
      if (holds(req, codes)) return next();

      res.status(403).json({
        success: false,
        message: `Forbidden: requires one of ${codes.join(", ")}`,
      });
      return;
    } catch (err) {
      console.error("Ticket action permission check failed:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
      return;
    }
  };
