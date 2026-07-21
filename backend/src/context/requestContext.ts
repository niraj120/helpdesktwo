import { AsyncLocalStorage } from "async_hooks";

/**
 * Actor + request context for a single in-flight operation.
 *
 * Bound once per HTTP request by the auditContext middleware and read later,
 * deep in the async call stack, by the mongoose audit plugin. This is the
 * piece the codebase was missing: it lets a `pre('save')` hook know WHO is
 * performing a mutation without every controller threading `req.user` down by
 * hand.
 *
 * All fields are optional. A write with no bound context (cron job, seed
 * script, startup migration) is attributed to the `system` source downstream.
 */
export interface AuditContext {
  userId?: string;
  userName?: string;
  userEmail?: string;
  role?: string;
  projectId?: string;
  projectName?: string;
  ipAddress?: string;
  userAgent?: string;
  /** Resolved express route pattern, e.g. "PUT /api/projects/:id/offline-settings". */
  route?: string;
  method?: string;
  /** Origin of the mutation. Defaults to "system" when no context is bound. */
  source?: "web" | "public-api" | "student" | "system" | "job";
  /**
   * The live express request. Held by reference because auth runs per-route,
   * AFTER this context is bound — so `req.user` is only populated later. The
   * audit plugin resolves the actor from here at write time, when it is set.
   */
  req?: any;
  /**
   * When true, the audit plugin skips capture for the current operation.
   * Set around bulk imports/migrations that would otherwise flood the log.
   */
  suppressAudit?: boolean;
}

const storage = new AsyncLocalStorage<AuditContext>();

/**
 * Run `fn` with `ctx` bound as the ambient audit context. Everything awaited
 * inside `fn` — including mongoose middleware — sees the same store.
 */
export const runWithAuditContext = <T>(ctx: AuditContext, fn: () => T): T =>
  storage.run(ctx, fn);

/** Current ambient context, or undefined outside any bound scope. */
export const getAuditContext = (): AuditContext | undefined =>
  storage.getStore();

/**
 * Merge `patch` into the current context in place. No-op if nothing is bound.
 * Used to enrich the store after auth resolves (userId, role) or after the
 * route matcher runs (route pattern).
 */
export const patchAuditContext = (patch: Partial<AuditContext>): void => {
  const store = storage.getStore();
  if (store) Object.assign(store, patch);
};

/**
 * Run `fn` with auditing suppressed for the current async scope. Returns
 * whatever `fn` returns. Use for large seeds/imports where per-doc audit rows
 * would be noise, not signal.
 */
export const withoutAudit = <T>(fn: () => T): T => {
  const current = storage.getStore();
  return storage.run({ ...(current ?? {}), suppressAudit: true }, fn);
};
