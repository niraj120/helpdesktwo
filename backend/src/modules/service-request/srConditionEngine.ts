/**
 * Service Request (PSR/ISR) — server-side condition evaluator.
 * Ports the frontend conditionEngine operators to the backend so config-driven
 * rules (e.g. auto-close) can be evaluated against an SR's field values at
 * creation time. Pure — no DB / side-effects.
 */

export type SrConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than";

export interface SrCondition {
  /** Key looked up in the value bag (usually a form field name). */
  field: string;
  operator: SrConditionOperator;
  /** Comparison value — ignored for is_empty / is_not_empty. */
  value?: string;
}

const norm = (v: any): string =>
  v === undefined || v === null ? "" : String(v).trim();

/** Evaluate a single condition against a value bag. */
export function evalCondition(
  cond: SrCondition,
  values: Record<string, any>,
): boolean {
  const raw = values[cond.field];
  const actual = norm(raw).toLowerCase();
  const expected = norm(cond.value).toLowerCase();

  switch (cond.operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "contains":
      return actual.includes(expected);
    case "not_contains":
      return !actual.includes(expected);
    case "is_empty":
      return actual === "";
    case "is_not_empty":
      return actual !== "";
    case "greater_than":
      return Number(raw) > Number(cond.value);
    case "less_than":
      return Number(raw) < Number(cond.value);
    default:
      return false;
  }
}

/**
 * Evaluate a set of conditions. `match` = "all" (AND, default) or "any" (OR).
 * An empty condition list is treated as NOT matching (rules must be explicit).
 */
export function evalConditions(
  conditions: SrCondition[] | undefined,
  values: Record<string, any>,
  match: "all" | "any" = "all",
): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return false;
  return match === "any"
    ? conditions.some((c) => evalCondition(c, values))
    : conditions.every((c) => evalCondition(c, values));
}

/**
 * Render a remark template. Supports {{ticketNumber}}, {{subject}} and
 * {{field.KEY}} / {{formData.KEY}} placeholders resolved from `values`.
 * Unknown placeholders render as an empty string.
 */
export function renderTemplate(
  template: string,
  ctx: {
    ticketNumber?: string;
    subject?: string;
    values?: Record<string, any>;
  },
): string {
  if (!template) return "";
  const values = ctx.values || {};
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const k = String(key);
    if (k === "ticketNumber") return norm(ctx.ticketNumber);
    if (k === "subject") return norm(ctx.subject);
    if (k.startsWith("field.")) return norm(values[k.slice(6)]);
    if (k.startsWith("formData.")) return norm(values[k.slice(9)]);
    return norm(values[k]);
  });
}
