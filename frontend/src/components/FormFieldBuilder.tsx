/**
 * FormFieldBuilder — Drag-and-drop form builder for configuring custom form fields.
 *
 * Features (US-1 through US-5):
 * - Drag-and-drop reordering via @hello-pangea/dnd (already installed)
 * - Fixed fields locked at top (Name, Email, Phone)
 * - Per-field config panel with Basic, Conditions, Required-If tabs
 * - Visual rule builder for conditional visibility (show/hide when)
 * - Required-mode selector: always / required-if / optional
 * - Live interactive preview using FormRenderer (same component as student form)
 * - Preview clearly indicates it is a preview
 */

import React, { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  MdAdd,
  MdDelete,
  MdDragIndicator,
  MdExpandMore,
  MdExpandLess,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";
import {
  FormFieldSchema,
  FieldCondition,
  ConditionOperator,
  RequiredMode,
} from "../utils/conditionEngine";
import FormRenderer from "./FormRenderer";
import {
  listMDMSources,
  testMDMSource,
  MDMDataType,
  MDMSource,
} from "../services/mdmService";
import HierarchyCategorySelector, {
  CategoryHierarchyValue,
} from "./HierarchyCategorySelector";

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "Link (URL)" },
  { value: "textarea", label: "Textarea" },
  { value: "dropdown", label: "Dropdown (Single)" },
  { value: "multiselect", label: "Multi-Select" },
  { value: "radio", label: "Radio Buttons" },
  { value: "checkbox", label: "Checkboxes" },
  { value: "file", label: "File Upload" },
];

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  not_contains: "does not contain",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  greater_than: "is greater than",
  less_than: "is less than",
};

const VALUE_LESS_OPS: ConditionOperator[] = ["is_empty", "is_not_empty"];

/** Student-profile fields that are always pre-filled — usable as condition triggers */
const SYSTEM_FIELD_NAMES = ["Name", "Email", "Phone"];

/** Field types that need an options list */
const NEEDS_OPTIONS = new Set(["dropdown", "multiselect", "radio", "checkbox"]);

// ─── Factory ──────────────────────────────────────────────────────────────────

function createField(order: number): FormFieldSchema {
  return {
    id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fieldName: "",
    fieldLabel: "",
    fieldType: "text",
    required: false,
    requiredMode: "optional",
    placeholder: "",
    options: [],
    optionsSource: "manual",
    mdm: { dataType: "custom", limit: 100 },
    order,
    allowedFileTypes: [],
    maxFileSizeMB: 50,
    allowMultiple: false,
    conditions: [],
    conditionAction: "show",
    requiredConditions: [],
    validation: {},
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HierarchyLevel {
  levelNumber: number;
  displayName: string;
  isRequired: boolean;
}

export interface FormFieldBuilderProps {
  fields: FormFieldSchema[];
  onChange: (fields: FormFieldSchema[]) => void;
  /** Used only for the preview label, not for API calls */
  projectId?: string;
  /** Project hierarchy config — drives the fixed Category / Sub-category chips */
  hierarchyConfig?: { levelCount: number; levels: HierarchyLevel[] };
}

// ─── RuleBuilder ──────────────────────────────────────────────────────────────

interface RuleBuilderProps {
  conditions: FieldCondition[];
  onConditionsChange: (c: FieldCondition[]) => void;
  /** Show the show/hide toggle. Omit for required-if builder. */
  action?: "show" | "hide";
  onActionChange?: (a: "show" | "hide") => void;
  /** All field names available as triggers */
  triggerFieldNames: string[];
  label: string;
}

const RuleBuilder: React.FC<RuleBuilderProps> = ({
  conditions,
  onConditionsChange,
  action,
  onActionChange,
  triggerFieldNames,
  label,
}) => {
  const selectSty: React.CSSProperties = {
    padding: "6px 8px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "13px",
    backgroundColor: "white",
  };

  const add = () =>
    onConditionsChange([
      ...conditions,
      {
        triggerField: triggerFieldNames[0] || "",
        operator: "equals",
        value: "",
      },
    ]);

  const update = (idx: number, patch: Partial<FieldCondition>) => {
    const next = [...conditions];
    next[idx] = { ...next[idx], ...patch };
    onConditionsChange(next);
  };

  const remove = (idx: number) =>
    onConditionsChange(conditions.filter((_, i) => i !== idx));

  const actionOptions: Array<"show" | "hide"> = ["show", "hide"];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>
          {label}
        </span>
        {onActionChange && (
          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
            {actionOptions.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onActionChange(a)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "5px",
                  border: `1px solid ${action === a ? "#3b82f6" : "#d1d5db"}`,
                  background: action === a ? "#dbeafe" : "white",
                  color: action === a ? "#1d4ed8" : "#4b5563",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: action === a ? "600" : "400",
                }}
              >
                {a === "show" ? "Show when" : "Hide when"}
              </button>
            ))}
          </div>
        )}
      </div>

      {conditions.length === 0 ? (
        <div
          style={{
            fontSize: "13px",
            color: "#9ca3af",
            padding: "10px 14px",
            background: "#f9fafb",
            borderRadius: "6px",
          }}
        >
          No conditions — field is{" "}
          {action === "hide"
            ? "always visible"
            : action === "show"
              ? "always visible"
              : "evaluated at submit time"}
          .
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          {conditions.map((cond, idx) => (
            <div
              key={idx}
              style={{ display: "flex", gap: "6px", alignItems: "center" }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  width: "34px",
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {idx === 0 ? "When" : "AND"}
              </span>
              <select
                value={cond.triggerField}
                onChange={(e) => update(idx, { triggerField: e.target.value })}
                style={{ ...selectSty, flex: 2, minWidth: 0 }}
              >
                {triggerFieldNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <select
                value={cond.operator}
                onChange={(e) =>
                  update(idx, { operator: e.target.value as ConditionOperator })
                }
                style={{ ...selectSty, flex: 2, minWidth: 0 }}
              >
                {(Object.keys(OPERATOR_LABELS) as ConditionOperator[]).map(
                  (op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </option>
                  ),
                )}
              </select>
              {!VALUE_LESS_OPS.includes(cond.operator) && (
                <input
                  type="text"
                  value={cond.value}
                  onChange={(e) => update(idx, { value: e.target.value })}
                  placeholder="value"
                  style={{ ...selectSty, flex: 2, minWidth: 0 }}
                />
              )}
              <button
                type="button"
                onClick={() => remove(idx)}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "#ef4444",
                  padding: "4px",
                  flexShrink: 0,
                }}
                title="Remove condition"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {triggerFieldNames.length > 0 ? (
        <button
          type="button"
          onClick={add}
          style={{
            fontSize: "12px",
            color: "#3b82f6",
            background: "none",
            border: "1px dashed #93c5fd",
            borderRadius: "6px",
            padding: "5px 12px",
            cursor: "pointer",
            marginTop: "4px",
          }}
        >
          + Add condition
        </button>
      ) : (
        <div
          style={{ fontSize: "12px", color: "#9ca3af", fontStyle: "italic" }}
        >
          Add more fields to use conditional logic
        </div>
      )}
    </div>
  );
};

// ─── FieldConfigPanel ─────────────────────────────────────────────────────────

interface FieldConfigPanelProps {
  field: FormFieldSchema;
  onUpdate: (patch: Partial<FormFieldSchema>) => void;
  triggerFieldNames: string[];
}

const FieldConfigPanel: React.FC<FieldConfigPanelProps> = ({
  field,
  onUpdate,
  triggerFieldNames,
}) => {
  const [tab, setTab] = useState<"basic" | "conditions" | "required-if">(
    "basic",
  );
  const [mdmSources, setMdmSources] = useState<MDMSource[]>([]);
  const [mdmColumns, setMdmColumns] = useState<string[]>([]);
  const [mdmColumnsLoading, setMdmColumnsLoading] = useState(false);
  const [mdmColumnsError, setMdmColumnsError] = useState("");

  useEffect(() => {
    if (!NEEDS_OPTIONS.has(field.fieldType) || field.optionsSource !== "mdm") {
      return;
    }
    let cancelled = false;
    listMDMSources().then((res) => {
      if (!cancelled && res.success) setMdmSources(res.data || []);
    });
    return () => {
      cancelled = true;
    };
  }, [field.fieldType, field.optionsSource]);

  const flattenColumnNames = (value: any, prefix = ""): string[] => {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(item)) {
        const nested = item
          .filter((entry) => entry && typeof entry === "object")
          .slice(0, 3)
          .flatMap((entry) => flattenColumnNames(entry, path));
        return nested.length ? [path, ...nested] : [path];
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return [path, ...flattenColumnNames(item, path)];
      }
      return [path];
    });
  };

  const loadMdmColumns = async () => {
    if (!field.mdm?.sourceId) {
      setMdmColumns([]);
      setMdmColumnsError("Select an MDM source first.");
      return;
    }
    const source = mdmSources.find((item) => item._id === field.mdm?.sourceId);
    if (!source) {
      setMdmColumns([]);
      setMdmColumnsError("Selected MDM source is not loaded.");
      return;
    }
    const dataType = field.mdm?.dataType || "custom";
    const sourceApis = source.apis.map((api, index) => ({ api, index }));
    const eligibleApis = sourceApis.filter(({ api }) => api.dataType === dataType);
    const selected =
      eligibleApis.find(({ api }) => api.isDefaultForType) ||
      eligibleApis[0] ||
      sourceApis.find(({ api }) => api.isDefaultForType) ||
      sourceApis[0];
    if (!selected) {
      setMdmColumns([]);
      setMdmColumnsError("No API row configured in the selected MDM source.");
      return;
    }
    setMdmColumnsLoading(true);
    setMdmColumnsError("");
    try {
      const res = await testMDMSource(source._id, { apiIndex: selected.index });
      const data: any = res.data;
      const samples: any[] = Array.isArray(data?.sampleData) ? data.sampleData : [];
      const columns: string[] = Array.from(
        new Set<string>(
          samples.flatMap((sample: any) => flattenColumnNames(sample)),
        ),
      ).sort();
      setMdmColumns(columns);
      if (!columns.length) {
        setMdmColumnsError(
          data?.error ||
            "No columns found in the sample response. Check request body and API response shape.",
        );
      }
    } catch (e: any) {
      setMdmColumns([]);
      setMdmColumnsError(e?.message || "Failed to load MDM columns.");
    } finally {
      setMdmColumnsLoading(false);
    }
  };

  useEffect(() => {
    setMdmColumns([]);
    setMdmColumnsError("");
  }, [field.mdm?.sourceId, field.mdm?.dataType]);

  const inputSty: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "13px",
    boxSizing: "border-box",
  };

  const tabBtn = (
    id: "basic" | "conditions" | "required-if",
    label: React.ReactNode,
  ): React.ReactNode => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: "6px 14px",
        fontSize: "13px",
        fontWeight: tab === id ? "600" : "400",
        color: tab === id ? "#3b82f6" : "#6b7280",
        border: "none",
        borderBottom: `2px solid ${tab === id ? "#3b82f6" : "transparent"}`,
        background: "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  const condCount = (field.conditions || []).length;

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "14px",
        background: "#f9fafb",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: "2px",
          borderBottom: "1px solid #e5e7eb",
          marginBottom: "14px",
        }}
      >
        {tabBtn("basic", "Basic")}
        {tabBtn(
          "conditions",
          <>
            Conditions{" "}
            {condCount > 0 && (
              <span
                style={{
                  marginLeft: "4px",
                  fontSize: "11px",
                  background: "#dbeafe",
                  color: "#1d4ed8",
                  borderRadius: "10px",
                  padding: "1px 6px",
                }}
              >
                {condCount}
              </span>
            )}
          </>,
        )}
        {field.requiredMode === "conditional" &&
          tabBtn("required-if", "Required If")}
      </div>

      {/* ── Basic Tab ── */}
      {tab === "basic" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "#4b5563",
                  marginBottom: "4px",
                }}
              >
                Field Name{" "}
                <span style={{ color: "#9ca3af", fontWeight: "400" }}>
                  (key)
                </span>
              </label>
              <input
                type="text"
                value={field.fieldName}
                onChange={(e) => onUpdate({ fieldName: e.target.value })}
                placeholder="e.g. applicationId"
                style={inputSty}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "#4b5563",
                  marginBottom: "4px",
                }}
              >
                Display Label
              </label>
              <input
                type="text"
                value={field.fieldLabel || ""}
                onChange={(e) => onUpdate({ fieldLabel: e.target.value })}
                placeholder="e.g. Application ID"
                style={inputSty}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "#4b5563",
                  marginBottom: "4px",
                }}
              >
                Field Type
              </label>
              <select
                value={field.fieldType}
                onChange={(e) =>
                  onUpdate({
                    fieldType: e.target.value,
                    options: NEEDS_OPTIONS.has(e.target.value)
                      ? field.options || []
                      : [],
                    optionsSource: NEEDS_OPTIONS.has(e.target.value)
                      ? field.optionsSource || "manual"
                      : "manual",
                  })
                }
                style={inputSty}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "#4b5563",
                  marginBottom: "4px",
                }}
              >
                Placeholder
              </label>
              <input
                type="text"
                value={field.placeholder || ""}
                onChange={(e) => onUpdate({ placeholder: e.target.value })}
                placeholder="Hint text for this field…"
                style={inputSty}
              />
            </div>
          </div>

          {/* Required mode */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: "500",
                color: "#4b5563",
                marginBottom: "6px",
              }}
            >
              Required
            </label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(["always", "conditional", "optional"] as RequiredMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      onUpdate({
                        requiredMode: mode,
                        required: mode === "always",
                      })
                    }
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      border: `1px solid ${field.requiredMode === mode ? "#3b82f6" : "#d1d5db"}`,
                      background:
                        field.requiredMode === mode ? "#dbeafe" : "white",
                      color:
                        field.requiredMode === mode ? "#1d4ed8" : "#4b5563",
                      fontSize: "12px",
                      cursor: "pointer",
                      fontWeight: field.requiredMode === mode ? "600" : "400",
                    }}
                  >
                    {mode === "always"
                      ? "Always required"
                      : mode === "conditional"
                        ? "Required if…"
                        : "Optional"}
                  </button>
                ),
              )}
            </div>
            {field.requiredMode === "conditional" && (
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "12px",
                  color: "#6b7280",
                }}
              >
                Open the <strong>Required If</strong> tab to define when this
                field is required.
              </p>
            )}
          </div>

          {/* Options (dropdown / multiselect / radio / checkbox) */}
          {NEEDS_OPTIONS.has(field.fieldType) && (
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "#4b5563",
                  marginBottom: "4px",
                }}
              >
                Options source
              </label>
              <select
                value={field.optionsSource || "manual"}
                onChange={(e) =>
                  onUpdate({
                    optionsSource: e.target.value as "manual" | "mdm",
                    mdm:
                      e.target.value === "mdm"
                        ? { ...(field.mdm || {}), dataType: field.mdm?.dataType || "custom", limit: field.mdm?.limit || 100 }
                        : field.mdm,
                  })
                }
                style={{ ...inputSty, marginBottom: 8 }}
              >
                <option value="manual">Manual list</option>
                <option value="mdm">MDM/API source</option>
              </select>

              {(field.optionsSource || "manual") === "manual" ? (
                <>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "500",
                      color: "#4b5563",
                      marginBottom: "4px",
                    }}
                  >
                    Manual options{" "}
                    <span style={{ color: "#9ca3af", fontWeight: "400" }}>
                      (one per line)
                    </span>
                  </label>
                  <textarea
                    value={(field.options || []).join("\n")}
                    onChange={(e) => {
                      const val = e.target.value;
                      onUpdate({
                        options: val
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      });
                    }}
                    rows={4}
                    placeholder={"Option 1\nOption 2\nOption 3"}
                    style={{
                      ...inputSty,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                </>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 8,
                    padding: 10,
                    border: "1px solid #dbeafe",
                    borderRadius: 8,
                    background: "#eff6ff",
                  }}
                >
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#4b5563", marginBottom: 4 }}>
                      MDM source
                    </label>
                    <select
                      value={field.mdm?.sourceId || ""}
                      onChange={(e) =>
                        onUpdate({
                          mdm: { ...(field.mdm || {}), sourceId: e.target.value },
                        })
                      }
                      style={inputSty}
                    >
                      <option value="">Select MDM source</option>
                      {mdmSources.map((source) => (
                        <option key={source._id} value={source._id}>
                          {source.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#4b5563", marginBottom: 4 }}>
                      API data type
                    </label>
                    <select
                      value={field.mdm?.dataType || "custom"}
                      onChange={(e) =>
                        onUpdate({
                          mdm: {
                            ...(field.mdm || {}),
                            dataType: e.target.value as MDMDataType,
                          },
                        })
                      }
                      style={inputSty}
                    >
                      {(["custom", "schools", "parents", "students", "children", "employees", "principals"] as MDMDataType[]).map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={loadMdmColumns}
                        disabled={mdmColumnsLoading || !field.mdm?.sourceId}
                        style={{
                          padding: "6px 10px",
                          border: "1px solid #bfdbfe",
                          borderRadius: 6,
                          background: "#fff",
                          color: "#2563eb",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor:
                            mdmColumnsLoading || !field.mdm?.sourceId
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            mdmColumnsLoading || !field.mdm?.sourceId ? 0.6 : 1,
                        }}
                      >
                        {mdmColumnsLoading ? "Loading columns..." : "Load columns from MDM"}
                      </button>
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        Loads sample response columns for label, value, and dependency mapping.
                      </span>
                    </div>
                    {mdmColumnsError && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#b91c1c" }}>
                        {mdmColumnsError}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#4b5563", marginBottom: 4 }}>
                      Label field
                    </label>
                    <input
                      list={`mdm-label-columns-${field.id || field.fieldName}`}
                      value={field.mdm?.labelField || ""}
                      onChange={(e) =>
                        onUpdate({
                          mdm: { ...(field.mdm || {}), labelField: e.target.value },
                        })
                      }
                      placeholder="name"
                      style={inputSty}
                    />
                    <datalist id={`mdm-label-columns-${field.id || field.fieldName}`}>
                      {mdmColumns.map((column) => (
                        <option key={column} value={column} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#4b5563", marginBottom: 4 }}>
                      Value field
                    </label>
                    <input
                      list={`mdm-value-columns-${field.id || field.fieldName}`}
                      value={field.mdm?.valueField || ""}
                      onChange={(e) =>
                        onUpdate({
                          mdm: { ...(field.mdm || {}), valueField: e.target.value },
                        })
                      }
                      placeholder="id"
                      style={inputSty}
                    />
                    <datalist id={`mdm-value-columns-${field.id || field.fieldName}`}>
                      {mdmColumns.map((column) => (
                        <option key={column} value={column} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#4b5563", marginBottom: 4 }}>
                      Depends on form field
                    </label>
                    <select
                      value={field.mdm?.dependsOnField || ""}
                      onChange={(e) =>
                        onUpdate({
                          mdm: {
                            ...(field.mdm || {}),
                            dependsOnField: e.target.value || undefined,
                          },
                        })
                      }
                      style={inputSty}
                    >
                      <option value="">No dependency</option>
                      {triggerFieldNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#4b5563", marginBottom: 4 }}>
                      Dependency API param
                    </label>
                    <input
                      value={field.mdm?.dependsOnParam || ""}
                      onChange={(e) =>
                        onUpdate({
                          mdm: { ...(field.mdm || {}), dependsOnParam: e.target.value },
                        })
                      }
                      placeholder="schoolId"
                      style={inputSty}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#4b5563", marginBottom: 4 }}>
                      Dependency response field
                    </label>
                    <input
                      list={`mdm-dependency-columns-${field.id || field.fieldName}`}
                      value={field.mdm?.dependsOnRemoteField || ""}
                      onChange={(e) =>
                        onUpdate({
                          mdm: {
                            ...(field.mdm || {}),
                            dependsOnRemoteField: e.target.value,
                          },
                        })
                      }
                      placeholder="schoolId"
                      style={inputSty}
                    />
                    <datalist id={`mdm-dependency-columns-${field.id || field.fieldName}`}>
                      {mdmColumns.map((column) => (
                        <option key={column} value={column} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#4b5563", marginBottom: 4 }}>
                      Search param / limit
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 6 }}>
                      <input
                        value={field.mdm?.searchParam || ""}
                        onChange={(e) =>
                          onUpdate({
                            mdm: { ...(field.mdm || {}), searchParam: e.target.value },
                          })
                        }
                        placeholder="q"
                        style={inputSty}
                      />
                      <input
                        type="number"
                        value={field.mdm?.limit || 100}
                        min={1}
                        max={500}
                        onChange={(e) =>
                          onUpdate({
                            mdm: {
                              ...(field.mdm || {}),
                              limit: Number(e.target.value) || 100,
                            },
                          })
                        }
                        style={inputSty}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* File upload settings */}
          {field.fieldType === "file" && (
            <div
              style={{
                padding: "12px",
                background: "#fef9c3",
                border: "1px solid #fde047",
                borderRadius: "6px",
              }}
            >
              <div style={{ marginBottom: "10px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "500",
                    color: "#78350f",
                    marginBottom: "6px",
                  }}
                >
                  Allowed File Types
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {[
                    ".pdf",
                    ".doc",
                    ".docx",
                    ".xls",
                    ".xlsx",
                    ".jpg",
                    ".jpeg",
                    ".png",
                    ".gif",
                    ".webp",
                    ".txt",
                    ".zip",
                    ".rar",
                    ".csv",
                    ".mp4",
                    ".mov",
                    ".avi",
                    ".mkv",
                    ".webm",
                  ].map((ext) => {
                    const checked = (field.allowedFileTypes || []).includes(
                      ext,
                    );
                    return (
                      <label
                        key={ext}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "3px 8px",
                          background: checked ? "#dbeafe" : "#f9fafb",
                          border: `1px solid ${checked ? "#3b82f6" : "#e5e7eb"}`,
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const cur = field.allowedFileTypes || [];
                            onUpdate({
                              allowedFileTypes: e.target.checked
                                ? [...cur, ext]
                                : cur.filter((t) => t !== ext),
                            });
                          }}
                          style={{ width: 12, height: 12 }}
                        />
                        {ext}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div
                style={{ display: "flex", gap: "16px", alignItems: "center" }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "500",
                      color: "#78350f",
                      marginBottom: "4px",
                    }}
                  >
                    Max Size (MB)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={field.maxFileSizeMB || 50}
                    onChange={(e) =>
                      onUpdate({
                        maxFileSizeMB: parseInt(e.target.value) || 50,
                      })
                    }
                    style={{
                      width: "80px",
                      padding: "6px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: "#78350f",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!field.allowMultiple}
                    onChange={(e) =>
                      onUpdate({ allowMultiple: e.target.checked })
                    }
                  />
                  Allow multiple files
                </label>
              </div>
            </div>
          )}

          {/* Validation */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: "500",
                color: "#4b5563",
                marginBottom: "6px",
              }}
            >
              Validation{" "}
              <span style={{ color: "#9ca3af", fontWeight: "400" }}>
                (optional)
              </span>
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                type="number"
                placeholder="Min length"
                value={field.validation?.minLength ?? ""}
                onChange={(e) =>
                  onUpdate({
                    validation: {
                      ...field.validation,
                      minLength: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    },
                  })
                }
                style={{
                  width: "110px",
                  padding: "6px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              />
              <input
                type="number"
                placeholder="Max length"
                value={field.validation?.maxLength ?? ""}
                onChange={(e) =>
                  onUpdate({
                    validation: {
                      ...field.validation,
                      maxLength: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    },
                  })
                }
                style={{
                  width: "110px",
                  padding: "6px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              />
              <input
                type="text"
                placeholder="Regex pattern (optional)"
                value={field.validation?.pattern ?? ""}
                onChange={(e) =>
                  onUpdate({
                    validation: {
                      ...field.validation,
                      pattern: e.target.value || undefined,
                    },
                  })
                }
                style={{
                  flex: 1,
                  minWidth: "160px",
                  padding: "6px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              />
            </div>
          </div>

          {/* Expose via External API */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              background: field.includeInPublicApi ? "#f0fdf4" : "#f9fafb",
              border: `1px solid ${field.includeInPublicApi ? "#86efac" : "#e5e7eb"}`,
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
              userSelect: "none",
            }}
            title="When enabled, this field will appear in GET /v1/tickets/form-schema and will be validated in POST /v1/tickets (for online-mode projects)"
          >
            <input
              type="checkbox"
              checked={!!field.includeInPublicApi}
              onChange={(e) =>
                onUpdate({
                  includeInPublicApi: e.target.checked,
                  // Clear isFixed when disabling API exposure
                  ...(!e.target.checked ? { isFixed: false } : {}),
                })
              }
              style={{ width: 15, height: 15, cursor: "pointer" }}
            />
            <div>
              <div
                style={{
                  fontWeight: "600",
                  color: field.includeInPublicApi ? "#15803d" : "#374151",
                }}
              >
                🌐 Expose via External API
              </div>
              <div
                style={{ fontSize: "11px", color: "#6b7280", marginTop: "1px" }}
              >
                Include in{" "}
                <code
                  style={{
                    background: "#f3f4f6",
                    padding: "0 3px",
                    borderRadius: "3px",
                  }}
                >
                  GET /v1/tickets/form-schema
                </code>{" "}
                and validate in{" "}
                <code
                  style={{
                    background: "#f3f4f6",
                    padding: "0 3px",
                    borderRadius: "3px",
                  }}
                >
                  POST /v1/tickets
                </code>
              </div>
            </div>
          </label>

          {/* Fixed Field sub-toggle — only visible when API exposure is on */}
          {field.includeInPublicApi && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                background: field.isFixed ? "#eff6ff" : "#f9fafb",
                border: `1px solid ${field.isFixed ? "#93c5fd" : "#e5e7eb"}`,
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                userSelect: "none",
                marginTop: "-4px",
              }}
              title="Fixed fields are standard required fields (e.g. Name, Email, Category). They always appear in the API schema as 'fixed_fields'."
            >
              <input
                type="checkbox"
                checked={!!field.isFixed}
                onChange={(e) => onUpdate({ isFixed: e.target.checked })}
                style={{ width: 15, height: 15, cursor: "pointer" }}
              />
              <div>
                <div
                  style={{
                    fontWeight: "600",
                    color: field.isFixed ? "#1d4ed8" : "#374151",
                  }}
                >
                  📌 Mark as Fixed Field
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#6b7280",
                    marginTop: "1px",
                  }}
                >
                  Returned under{" "}
                  <code
                    style={{
                      background: "#f3f4f6",
                      padding: "0 3px",
                      borderRadius: "3px",
                    }}
                  >
                    fixed_fields
                  </code>{" "}
                  in the schema (standard form fields like Name, Email,
                  Category)
                </div>
              </div>
            </label>
          )}

          {/* Show value to parent / student */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              background: field.showToParent === false ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${field.showToParent === false ? "#fca5a5" : "#86efac"}`,
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
              userSelect: "none",
            }}
            title="When off, this field's value is hidden from the parent / student view of the request."
          >
            <input
              type="checkbox"
              checked={field.showToParent !== false}
              onChange={(e) => onUpdate({ showToParent: e.target.checked })}
              style={{ width: 15, height: 15, cursor: "pointer" }}
            />
            <div>
              <div
                style={{
                  fontWeight: "600",
                  color: field.showToParent === false ? "#b91c1c" : "#15803d",
                }}
              >
                👁 Show value to parent / student
              </div>
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "1px" }}>
                Off = internal only; the value is stripped from the parent-facing detail.
              </div>
            </div>
          </label>

          {/* Visible at status */}
          <div
            style={{
              padding: "10px 12px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              fontSize: "13px",
            }}
          >
            <div style={{ fontWeight: 600, color: "#374151", marginBottom: 2 }}>
              📅 Visible at status
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: 8 }}>
              Show this field only at the selected statuses. None selected = all statuses.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {[
                { code: 1, label: "Open" },
                { code: 2, label: "WIP" },
                { code: 4, label: "Resolved" },
                { code: 5, label: "Closed" },
                { code: 6, label: "Re-open" },
                { code: 7, label: "Re-Opened WIP" },
              ].map((s) => {
                const selected = (field.visibleAtStatus || []).includes(s.code);
                return (
                  <label
                    key={s.code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 8px",
                      borderRadius: "5px",
                      border: `1px solid ${selected ? "#93c5fd" : "#e5e7eb"}`,
                      background: selected ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                      fontSize: "12px",
                      color: selected ? "#1d4ed8" : "#4b5563",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => {
                        const cur = field.visibleAtStatus || [];
                        const next = e.target.checked
                          ? [...cur, s.code]
                          : cur.filter((c) => c !== s.code);
                        onUpdate({
                          visibleAtStatus: next.length ? next : undefined,
                        });
                      }}
                      style={{ width: 14, height: 14, cursor: "pointer" }}
                    />
                    {s.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Conditions Tab ── */}
      {tab === "conditions" && (
        <RuleBuilder
          conditions={field.conditions || []}
          action={field.conditionAction || "show"}
          onConditionsChange={(c) => onUpdate({ conditions: c })}
          onActionChange={(a) => onUpdate({ conditionAction: a })}
          triggerFieldNames={triggerFieldNames}
          label="Visibility rule (all conditions must match — AND logic)"
        />
      )}

      {/* ── Required-If Tab ── */}
      {tab === "required-if" && (
        <RuleBuilder
          conditions={field.requiredConditions || []}
          onConditionsChange={(c) => onUpdate({ requiredConditions: c })}
          triggerFieldNames={triggerFieldNames}
          label="This field becomes required when all conditions below match"
        />
      )}
    </div>
  );
};

// ─── FormFieldBuilder ─────────────────────────────────────────────────────────

export const FormFieldBuilder: React.FC<FormFieldBuilderProps> = ({
  fields,
  onChange,
  projectId,
  hierarchyConfig,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, any>>({});
  const [categoryHierarchy, setCategoryHierarchy] =
    useState<CategoryHierarchyValue>({});
  const [showPreview, setShowPreview] = useState(true);

  // Build the hierarchy-based fixed fields from project config.
  // Falls back to a single "Category" chip when no config is available.
  const hierarchyFixedFields: FormFieldSchema[] = React.useMemo(() => {
    if (hierarchyConfig?.levels && hierarchyConfig.levels.length > 0) {
      return [...hierarchyConfig.levels]
        .sort((a, b) => a.levelNumber - b.levelNumber)
        .map((level) => ({
          id: `hierarchy-level-${level.levelNumber}`,
          fieldName: level.displayName,
          fieldLabel: level.displayName,
          fieldType: "dropdown",
          required: level.isRequired,
          requiredMode: level.isRequired
            ? ("always" as const)
            : ("optional" as const),
          isFixed: true,
          placeholder: `Select ${level.displayName.toLowerCase()}`,
          options: [],
          order: level.levelNumber,
        }));
    }
    // Default: single Category chip
    return [
      {
        id: "category-fixed",
        fieldName: "Category",
        fieldLabel: "Category",
        fieldType: "dropdown",
        isFixed: true,
        placeholder: "Select category",
        options: [],
        order: 0,
      },
    ];
  }, [hierarchyConfig]);

  // All field names available as condition triggers: hierarchy fixed + custom fields
  const allFieldNames: string[] = [
    ...SYSTEM_FIELD_NAMES,
    ...hierarchyFixedFields.map((f) => f.fieldName),
    ...fields.map((f) => f.fieldName).filter(Boolean),
  ].filter((n, i, a) => a.indexOf(n) === i);

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    const next = Array.from(fields);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onChange(next.map((f, i) => ({ ...f, order: i })));
  };

  const addField = () => {
    const f = createField(fields.length);
    onChange([...fields, f]);
    setExpandedId(f.id!);
  };

  const updateField = (id: string, patch: Partial<FormFieldSchema>) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const typeBadge = (type: string): React.CSSProperties => ({
    fontSize: "11px",
    padding: "2px 8px",
    borderRadius: "10px",
    background: "#f3f4f6",
    color: "#6b7280",
    fontWeight: "500",
    flexShrink: 0,
  });

  const condBadge: React.CSSProperties = {
    fontSize: "11px",
    padding: "2px 8px",
    borderRadius: "10px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontWeight: "600",
    cursor: "pointer",
    flexShrink: 0,
  };

  // Preview fields: only user-defined custom fields.
  // Hierarchy fixed fields (Category/Subcategory/Topic) are rendered separately via HierarchyCategorySelector.
  const previewFields: FormFieldSchema[] = [...fields];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: showPreview ? "1fr 360px" : "1fr",
        gap: "20px",
        alignItems: "start",
      }}
    >
      {/* ── Builder Canvas ── */}
      <div>
        {/* Fixed-fields info */}
        <div
          style={{
            padding: "10px 14px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#1e40af",
            marginBottom: "14px",
          }}
        >
          <strong>Student profile fields</strong> (Name, Email, Phone) are
          always pre-filled from the student's account.
          {hierarchyFixedFields.length > 0 ? (
            <>
              {" "}
              The{" "}
              <strong>
                {hierarchyFixedFields
                  .map((f) => f.fieldLabel || f.fieldName)
                  .join(" → ")}
              </strong>{" "}
              field{hierarchyFixedFields.length > 1 ? "s are" : " is"} fixed by
              the project hierarchy and cannot be removed. Category options come
              from the <strong>Categories</strong> tab.
            </>
          ) : (
            <> Add custom fields below to extend the submission form.</>
          )}
        </div>

        {/* Fixed field chips — student-profile fields (always pre-filled, not configurable) */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "8px",
            flexWrap: "wrap",
          }}
        >
          {["Name", "Email", "Phone"].map((n) => (
            <div
              key={n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 12px",
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "13px",
                color: "#475569",
              }}
            >
              🔒 {n}
            </div>
          ))}
        </div>

        {/* Hierarchy fixed field chips — project-specific, cannot be removed */}
        {hierarchyFixedFields.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            {hierarchyFixedFields.map((f) => (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 12px",
                  background: "#ecfdf5",
                  border: "1px solid #6ee7b7",
                  borderRadius: "6px",
                  fontSize: "13px",
                  color: "#065f46",
                }}
                title={`Fixed by project hierarchy — ${f.required ? "required" : "optional"}`}
              >
                🔒 {f.fieldLabel || f.fieldName}
                {f.required && (
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#ef4444",
                      marginLeft: "2px",
                    }}
                  >
                    *
                  </span>
                )}
                <span
                  style={{
                    fontSize: "10px",
                    padding: "1px 5px",
                    borderRadius: "8px",
                    background: "#d1fae5",
                    color: "#065f46",
                    fontWeight: "600",
                    marginLeft: "4px",
                  }}
                >
                  FIXED
                </span>
              </div>
            ))}
          </div>
        )}

        {/* DnD field list */}
        {fields.length === 0 ? (
          <div
            style={{
              padding: "32px",
              textAlign: "center",
              background: "#f9fafb",
              borderRadius: "8px",
              border: "2px dashed #e5e7eb",
              color: "#9ca3af",
              fontSize: "14px",
              marginBottom: "16px",
            }}
          >
            No custom fields yet. Click <strong>+ Add Field</strong> to begin.
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="form-field-builder">
              {(provided: any) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginBottom: "16px",
                  }}
                >
                  {fields.map((field, index) => {
                    const isExpanded = expandedId === field.id;
                    const condCount = (field.conditions || []).length;
                    const label =
                      field.fieldLabel ||
                      field.fieldName ||
                      `Field ${index + 1}`;

                    // Trigger field names for this specific field (exclude itself)
                    const fieldTriggers = allFieldNames.filter(
                      (n) => n !== field.fieldName,
                    );

                    return (
                      <Draggable
                        key={field.id || String(index)}
                        draggableId={field.id || String(index)}
                        index={index}
                      >
                        {(prov: any, snap: any) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            style={{
                              ...prov.draggableProps.style,
                              background: snap.isDragging ? "#eff6ff" : "white",
                              border: `1px solid ${isExpanded ? "#3b82f6" : "#e5e7eb"}`,
                              borderRadius: "8px",
                              overflow: "hidden",
                              boxShadow: snap.isDragging
                                ? "0 4px 12px rgba(0,0,0,0.12)"
                                : undefined,
                            }}
                          >
                            {/* Row header */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "11px 14px",
                              }}
                            >
                              <span
                                {...prov.dragHandleProps}
                                style={{
                                  cursor: "grab",
                                  color: "#9ca3af",
                                  display: "flex",
                                  flexShrink: 0,
                                }}
                                title="Drag to reorder"
                              >
                                <MdDragIndicator size={20} />
                              </span>

                              {/* Label + badges */}
                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  overflow: "hidden",
                                  minWidth: 0,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: "500",
                                    color: field.fieldName
                                      ? "#1f2937"
                                      : "#9ca3af",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    minWidth: 0,
                                  }}
                                >
                                  {label}
                                </span>
                                <span style={typeBadge(field.fieldType)}>
                                  {FIELD_TYPES.find(
                                    (t) => t.value === field.fieldType,
                                  )?.label || field.fieldType}
                                </span>
                                {field.requiredMode === "always" && (
                                  <span
                                    style={{
                                      ...typeBadge(field.fieldType),
                                      background: "#fef2f2",
                                      color: "#ef4444",
                                    }}
                                  >
                                    required
                                  </span>
                                )}
                                {condCount > 0 && (
                                  <span
                                    style={condBadge}
                                    onClick={() => {
                                      setExpandedId(
                                        isExpanded ? null : field.id || null,
                                      );
                                    }}
                                    title="Click to edit conditions"
                                  >
                                    {condCount} rule{condCount !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {field.isFixed && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      padding: "2px 6px",
                                      borderRadius: "10px",
                                      background: "#dbeafe",
                                      color: "#1d4ed8",
                                      fontWeight: "600",
                                      flexShrink: 0,
                                    }}
                                    title="Fixed Field — always in API schema as fixed_fields"
                                  >
                                    📌 Fixed
                                  </span>
                                )}
                                {!field.isFixed && field.includeInPublicApi && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      padding: "2px 6px",
                                      borderRadius: "10px",
                                      background: "#dcfce7",
                                      color: "#15803d",
                                      fontWeight: "600",
                                      flexShrink: 0,
                                    }}
                                    title="Custom Field — exposed via External API as custom_fields"
                                  >
                                    🌐 API
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedId(
                                    isExpanded ? null : field.id || null,
                                  )
                                }
                                style={{
                                  border: "none",
                                  background: "none",
                                  cursor: "pointer",
                                  color: isExpanded ? "#3b82f6" : "#6b7280",
                                  display: "flex",
                                  flexShrink: 0,
                                  padding: "2px",
                                }}
                                title={
                                  isExpanded ? "Collapse" : "Configure field"
                                }
                              >
                                {isExpanded ? (
                                  <MdExpandLess size={20} />
                                ) : (
                                  <MdExpandMore size={20} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeField(field.id!)}
                                style={{
                                  border: "none",
                                  background: "none",
                                  cursor: "pointer",
                                  color: "#ef4444",
                                  display: "flex",
                                  flexShrink: 0,
                                  padding: "2px",
                                }}
                                title="Remove field"
                              >
                                <MdDelete size={18} />
                              </button>
                            </div>

                            {/* Inline config panel */}
                            {isExpanded && (
                              <div style={{ padding: "0 14px 14px" }}>
                                <FieldConfigPanel
                                  field={field}
                                  onUpdate={(patch) =>
                                    updateField(field.id!, patch)
                                  }
                                  triggerFieldNames={fieldTriggers}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        <button
          type="button"
          onClick={addField}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer",
          }}
        >
          <MdAdd size={18} /> Add Field
        </button>
      </div>

      {/* ── Preview Panel ── */}
      {showPreview && (
        <div>
          <div
            style={{
              position: "sticky",
              top: "24px",
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "11px 16px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f9fafb",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#374151",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <MdVisibility size={16} /> Live Preview
              </span>
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <button
                  type="button"
                  onClick={() => setPreviewData({})}
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  style={{
                    fontSize: "12px",
                    color: "#9ca3af",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                  }}
                  title="Hide preview"
                >
                  <MdVisibilityOff size={16} />
                </button>
              </div>
            </div>
            <div
              style={{ padding: "16px", maxHeight: "72vh", overflowY: "auto" }}
            >
              {/* Fixed fields stub */}
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "8px",
                  }}
                >
                  Always-present fields (read-only)
                </div>
                {["Name *", "Email *", "Phone *"].map((n) => (
                  <div
                    key={n}
                    style={{
                      padding: "8px 12px",
                      background: "#f1f5f9",
                      borderRadius: "6px",
                      fontSize: "13px",
                      color: "#64748b",
                      marginBottom: "6px",
                    }}
                  >
                    {n}
                  </div>
                ))}
              </div>

              {/* Hierarchy selector — shown directly so all levels render with real data */}
              {projectId &&
                hierarchyConfig &&
                hierarchyConfig.levelCount >= 1 && (
                  <div style={{ marginBottom: "14px" }}>
                    <HierarchyCategorySelector
                      projectId={projectId}
                      value={categoryHierarchy}
                      onChange={(val) => {
                        setCategoryHierarchy(val);
                        // Push every selected level NAME into previewData so
                        // condition rules (written as display names) evaluate correctly.
                        const updates: Record<string, string> = {};
                        hierarchyConfig.levels.forEach((l) => {
                          const nameKey =
                            `level${l.levelNumber}Name` as keyof CategoryHierarchyValue;
                          updates[l.displayName] =
                            (val[nameKey] as string) || "";
                        });
                        setPreviewData((prev) => ({ ...prev, ...updates }));
                      }}
                      mode="online"
                      showValidation={false}
                    />
                  </div>
                )}

              <FormRenderer
                fields={previewFields}
                formData={previewData}
                onChange={(name, val) =>
                  setPreviewData((prev) => ({ ...prev, [name]: val }))
                }
                previewMode={false}
                showAllFields={true}
                projectId={projectId}
              />

              {fields.length === 0 && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#9ca3af",
                    textAlign: "center",
                    padding: "8px",
                  }}
                >
                  Add custom fields above to see them here. Interact to test
                  conditional visibility.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Show preview button when hidden */}
      {!showPreview && (
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#6b7280",
            cursor: "pointer",
            alignSelf: "start",
          }}
        >
          <MdVisibility size={16} /> Show Preview
        </button>
      )}
    </div>
  );
};

export default FormFieldBuilder;
