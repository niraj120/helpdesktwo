/**
 * conditionEngine — Pure, stateless form condition evaluator.
 *
 * Determines which fields are visible and which are required based on
 * the current form values and each field's configured conditions/rules.
 *
 * Usage:
 *   const { visibleFields, requiredFields } = conditionEngine(fields, formValues);
 *
 * Design principles:
 * - Zero side-effects: same inputs always produce same outputs.
 * - Reusable across admin preview and live end-user form (no React dependency).
 * - Fixed fields (isFixed: true) bypass all condition logic.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than";

export interface FieldCondition {
  /** fieldName of the field whose current value triggers this condition */
  triggerField: string;
  operator: ConditionOperator;
  /** Comparison value (ignored for is_empty / is_not_empty) */
  value: string;
}

export type RequiredMode = "always" | "conditional" | "optional";

export interface FormFieldSchema {
  id?: string;
  fieldName: string;
  fieldLabel?: string;
  fieldType: string;
  /** Legacy: true → behaves like requiredMode: 'always' */
  required?: boolean;
  /** isFixed: true → always visible, always required as per `required` flag — not hideable */
  isFixed?: boolean;
  /** AND-evaluated conditions that govern visibility */
  conditions?: FieldCondition[];
  /** What to do when all conditions match. Default: 'show' */
  conditionAction?: "show" | "hide";
  /** Controls required behaviour */
  requiredMode?: RequiredMode;
  /** AND-evaluated conditions for required-if mode */
  requiredConditions?: FieldCondition[];
  placeholder?: string;
  options?: string[];
  order?: number;
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
  allowMultiple?: boolean;
  validation?: { minLength?: number; maxLength?: number; pattern?: string };
  /** When true, this field is exposed via the External / Public API */
  includeInPublicApi?: boolean;
}

export interface ConditionEngineResult {
  /** Set of fieldNames that should be rendered / visible */
  visibleFields: Set<string>;
  /** Set of fieldNames that are currently required */
  requiredFields: Set<string>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function evalOne(cond: FieldCondition, values: Record<string, any>): boolean {
  const raw = values[cond.triggerField];
  const cmp = String(cond.value ?? "").toLowerCase();

  switch (cond.operator) {
    case "equals":
      if (Array.isArray(raw))
        return raw.some((v) => String(v).toLowerCase() === cmp);
      return String(raw ?? "").toLowerCase() === cmp;

    case "not_equals":
      if (Array.isArray(raw))
        return !raw.some((v) => String(v).toLowerCase() === cmp);
      return String(raw ?? "").toLowerCase() !== cmp;

    case "contains":
      if (Array.isArray(raw))
        return raw.some((v) => String(v).toLowerCase().includes(cmp));
      return String(raw ?? "")
        .toLowerCase()
        .includes(cmp);

    case "not_contains":
      if (Array.isArray(raw))
        return !raw.some((v) => String(v).toLowerCase().includes(cmp));
      return !String(raw ?? "")
        .toLowerCase()
        .includes(cmp);

    case "is_empty":
      if (Array.isArray(raw)) return raw.length === 0;
      return raw === undefined || raw === null || String(raw) === "";

    case "is_not_empty":
      if (Array.isArray(raw)) return raw.length > 0;
      return raw !== undefined && raw !== null && String(raw) !== "";

    case "greater_than":
      return Number(raw) > Number(cond.value);

    case "less_than":
      return Number(raw) < Number(cond.value);

    default:
      return false;
  }
}

function allMet(
  conditions: FieldCondition[],
  values: Record<string, any>,
): boolean {
  return conditions.every((c) => evalOne(c, values));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate all fields against the supplied form values and return the set of
 * visible fields and required fields.
 *
 * @param fields     Full ordered list of form fields (fixed + custom)
 * @param formValues Current form data keyed by fieldName
 */
export function conditionEngine(
  fields: FormFieldSchema[],
  formValues: Record<string, any>,
): ConditionEngineResult {
  const visibleFields = new Set<string>();
  const requiredFields = new Set<string>();

  for (const field of fields) {
    // Fixed fields are always visible; required as defined
    if (field.isFixed) {
      visibleFields.add(field.fieldName);
      if (field.required) requiredFields.add(field.fieldName);
      continue;
    }

    // ── Visibility ──────────────────────────────────────────────────────────
    let isVisible = true;
    if (field.conditions && field.conditions.length > 0) {
      const met = allMet(field.conditions, formValues);
      const action = field.conditionAction ?? "show";
      isVisible = action === "show" ? met : !met;
    }
    if (!isVisible) continue;

    visibleFields.add(field.fieldName);

    // ── Required ────────────────────────────────────────────────────────────
    // Derive mode: explicit requiredMode overrides legacy `required` boolean
    const mode: RequiredMode =
      field.requiredMode ?? (field.required === true ? "always" : "optional");

    if (mode === "always") {
      requiredFields.add(field.fieldName);
    } else if (
      mode === "conditional" &&
      field.requiredConditions &&
      field.requiredConditions.length > 0
    ) {
      if (allMet(field.requiredConditions, formValues)) {
        requiredFields.add(field.fieldName);
      }
    }
    // 'optional' → never added to requiredFields
  }

  return { visibleFields, requiredFields };
}
