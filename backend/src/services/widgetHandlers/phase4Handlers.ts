/**
 * Phase 4 Widget Query Handlers — Satisfaction (CSAT / NPS / CES)
 *
 * Implementation has moved to the canonical location per Sprint 9 spec:
 *     src/services/dashboard/queryHandlers/satisfactionHandlers.ts
 *
 * This file is kept as a backward-compatible re-export so that server.ts
 * does not need to change.
 */

export { registerSatisfactionHandlers as registerPhase4Handlers } from "../dashboard/queryHandlers/satisfactionHandlers";
