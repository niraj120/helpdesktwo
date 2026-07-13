/**
 * FormRenderer — Shared, unified form renderer for both the student-facing
 * submission form and the admin live-preview panel.
 *
 * Key guarantees:
 * - Uses conditionEngine for real-time visibility / required evaluation.
 * - previewMode={true}  →  fields are non-interactive, a "Preview" banner is shown,
 *                          no data is submitted.
 * - Hidden fields never appear in the DOM and their values are excluded from
 *   submission (caller gathers only visibleFields from the engine result).
 * - Identical render path for both contexts — zero duplication.
 */

import React, { useEffect, useMemo, useState } from "react";
import { DocumentArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { conditionEngine, FormFieldSchema } from "../utils/conditionEngine";
import { serviceRequestApi } from "../services/serviceRequests";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FormRendererProps {
  fields: FormFieldSchema[];
  formData: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  /** File inputs (separate from text formData) */
  onFileChange?: (fieldName: string, files: FileList | null) => void;
  fieldFiles?: Record<string, File[]>;
  onRemoveFile?: (fieldName: string, index: number) => void;
  /** When true: fields are read-only, a Preview banner is shown, submit is disabled */
  previewMode?: boolean;
  /**
   * When true (admin builder preview): ALL fields are always rendered regardless
   * of condition state. Fields whose condition is not currently met are shown with
   * a subtle "Conditional — not triggered" indicator so the admin can see the full
   * form layout. Does not affect the live student form (default: false).
   */
  showAllFields?: boolean;
  branding?: { primaryColor?: string };
  /** For hierarchical category selector — pass projectId from project context */
  projectId?: string;
  /** Pass a rendered alternative for the Category field if hierarchy is configured */
  categoryFieldOverride?: React.ReactNode;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: "14px",
  fontWeight: "500",
  color: "#374151",
  marginBottom: "6px",
};

const WRAPPER_STYLE: React.CSSProperties = { marginBottom: "20px" };

type RenderOption = { label: string; value: string; raw?: any };

const scalarFromConfiguredField = (raw: any, configuredField?: string) => {
  if (!raw || typeof raw !== "object" || !configuredField?.trim()) return "";
  const field = configuredField.trim();
  const candidates = [
    field,
    field.includes(".") ? field.split(".").pop() || field : field,
  ];
  for (const key of candidates) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== "" && typeof value !== "object") {
      return String(value);
    }
  }
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedCandidates = candidates.map(normalize);
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null || value === "" || typeof value === "object") continue;
    if (normalizedCandidates.includes(normalize(key))) return String(value);
  }
  return "";
};

const normalizeOptions = (field: FormFieldSchema): RenderOption[] =>
  (field.options || []).map((option) => ({
    label: String(option),
    value: String(option),
  }));

interface DynamicOptionsSelectProps {
  field: FormFieldSchema;
  value: any;
  formData: Record<string, any>;
  projectId?: string;
  disabled: boolean;
  required: boolean;
  multiple?: boolean;
  style: React.CSSProperties;
  onChange: (value: any, selected?: RenderOption | RenderOption[]) => void;
}

const DynamicOptionsSelect: React.FC<DynamicOptionsSelectProps> = ({
  field,
  value,
  formData,
  projectId,
  disabled,
  required,
  multiple,
  style,
  onChange,
}) => {
  const [remoteOptions, setRemoteOptions] = useState<RenderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mdm = field.mdm || {};
  const dependencyRaw = mdm.dependsOnField
    ? formData[`${mdm.dependsOnField}Raw`]
    : undefined;
  const dependencyRawValue =
    dependencyRaw && mdm.dependsOnRemoteField
      ? scalarFromConfiguredField(dependencyRaw, mdm.dependsOnRemoteField)
      : "";
  const dependencyValue = mdm.dependsOnField
    ? dependencyRawValue || formData[mdm.dependsOnField]
    : undefined;
  const dependencyMissing =
    field.optionsSource === "mdm" &&
    Boolean(mdm.dependsOnField) &&
    (dependencyValue === undefined || dependencyValue === null || dependencyValue === "");

  useEffect(() => {
    if (field.optionsSource !== "mdm") {
      setRemoteOptions([]);
      setError("");
      return;
    }
    if (!mdm.sourceId || dependencyMissing) {
      setRemoteOptions([]);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    serviceRequestApi
      .formMdmOptions({
        projectId,
        sourceId: mdm.sourceId,
        dataType: mdm.dataType || "custom",
        labelField: mdm.labelField,
        valueField: mdm.valueField,
        searchParam: mdm.searchParam,
        dependsOnValue: dependencyValue,
        dependsOnParam: mdm.dependsOnParam,
        dependsOnRemoteField: mdm.dependsOnRemoteField,
        limit: mdm.limit || 100,
      })
      .then((res) => {
        if (cancelled) return;
        const options = Array.isArray(res?.data)
          ? res.data.map((item: any) => ({
              label: String(item.label ?? item.value ?? ""),
              value: String(item.value ?? item.label ?? ""),
              raw: item.raw ?? item,
            }))
          : [];
        setRemoteOptions(
          options.filter((option: RenderOption) => option.label && option.value),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setRemoteOptions([]);
        setError(err?.response?.data?.message || "Failed to load MDM options");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    field.optionsSource,
    mdm.sourceId,
    mdm.dataType,
    mdm.labelField,
    mdm.valueField,
    mdm.searchParam,
    mdm.dependsOnField,
    mdm.dependsOnParam,
    mdm.dependsOnRemoteField,
    mdm.limit,
    dependencyMissing,
    dependencyValue,
    projectId,
  ]);

  const options = useMemo(
    () => (field.optionsSource === "mdm" ? remoteOptions : normalizeOptions(field)),
    [field, remoteOptions],
  );
  const isDisabled = disabled || loading || dependencyMissing;

  // Auto-select when there's exactly one option (and nothing chosen yet);
  // multi-option dropdowns are left for the user to pick.
  useEffect(() => {
    if (
      !multiple &&
      !disabled &&
      options.length === 1 &&
      (value === undefined || value === null || value === "")
    ) {
      onChange(options[0].value, options[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, multiple, disabled, value]);

  return (
    <>
      <select
        multiple={multiple}
        value={multiple ? value || [] : value}
        onChange={(e) => {
          if (multiple) {
            const values = Array.from(e.target.selectedOptions, (o) => o.value);
            onChange(
              values,
              options.filter((option) => values.includes(option.value)),
            );
          } else {
            const selected = options.find((option) => option.value === e.target.value);
            onChange(e.target.value, selected);
          }
        }}
        required={required}
        disabled={isDisabled}
        style={multiple ? { ...style, minHeight: "100px" } : style}
      >
        {!multiple && (
          <option value="">
            {dependencyMissing
              ? `Select ${mdm.dependsOnField} first`
              : loading
                ? "Loading options..."
                : field.placeholder || `Select ${field.fieldLabel || field.fieldName}`}
          </option>
        )}
        {options.map((opt) => (
          <option key={`${opt.value}-${opt.label}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <div style={{ marginTop: 4, color: "#b91c1c", fontSize: 12 }}>
          {error}
        </div>
      )}
    </>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const FormRenderer: React.FC<FormRendererProps> = ({
  fields,
  formData,
  onChange,
  onFileChange,
  fieldFiles = {},
  onRemoveFile,
  previewMode = false,
  showAllFields = false,
  branding,
  projectId,
  categoryFieldOverride,
}) => {
  const primaryColor = branding?.primaryColor || "#3b82f6";
  const { visibleFields, requiredFields } = conditionEngine(fields, formData);

  const renderControl = (field: FormFieldSchema): React.ReactNode => {
    const value = formData[field.fieldName] ?? "";
    const isRequired = requiredFields.has(field.fieldName);
    const disabled = previewMode;

    const baseStyle: React.CSSProperties = {
      ...INPUT_STYLE,
      backgroundColor: disabled ? "#f3f4f6" : "white",
      cursor: disabled ? "not-allowed" : undefined,
    };

    switch (field.fieldType) {
      case "textarea":
        return (
          <textarea
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            required={isRequired}
            readOnly={disabled}
            rows={4}
            style={{ ...baseStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        );

      case "dropdown":
        // Allow caller to inject an override (e.g. HierarchyCategorySelector)
        if (
          field.fieldName.toLowerCase() === "category" &&
          categoryFieldOverride
        ) {
          return categoryFieldOverride;
        }
        return (
          <DynamicOptionsSelect
            field={field}
            value={value}
            formData={formData}
            projectId={projectId}
            disabled={disabled}
            required={isRequired}
            style={baseStyle}
            onChange={(next, selected) => {
              onChange(field.fieldName, next);
              const opt = Array.isArray(selected) ? undefined : selected;
              if (opt) {
                onChange(`${field.fieldName}Label`, opt.label);
                onChange(`${field.fieldName}Raw`, opt.raw ?? opt);
              }
            }}
          />
        );

      case "multiselect":
        return (
          <DynamicOptionsSelect
            field={field}
            value={value || []}
            formData={formData}
            projectId={projectId}
            disabled={disabled}
            required={isRequired}
            multiple
            style={baseStyle}
            onChange={(next, selected) => {
              const opts = Array.isArray(selected) ? selected : [];
              onChange(field.fieldName, next);
              onChange(`${field.fieldName}Labels`, opts.map((opt) => opt.label));
              onChange(`${field.fieldName}Raws`, opts.map((opt) => opt.raw ?? opt));
            }}
          />
        );

      case "radio": {
        const options =
          field.optionsSource === "mdm" ? [] : normalizeOptions(field);
        if (field.optionsSource === "mdm") {
          return (
            <DynamicOptionsSelect
              field={field}
              value={value}
              formData={formData}
              projectId={projectId}
              disabled={disabled}
              required={isRequired}
              style={baseStyle}
              onChange={(next, selected) => {
                onChange(field.fieldName, next);
                const opt = Array.isArray(selected) ? undefined : selected;
                if (opt) {
                  onChange(`${field.fieldName}Label`, opt.label);
                  onChange(`${field.fieldName}Raw`, opt.raw ?? opt);
                }
              }}
            />
          );
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {options.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="radio"
                  name={field.fieldName}
                  value={opt.value}
                  checked={value === opt.value}
                  onChange={(e) => onChange(field.fieldName, e.target.value)}
                  disabled={disabled}
                  style={{ accentColor: primaryColor }}
                />
                <span style={{ fontSize: "14px", color: "#374151" }}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        );
      }

      case "checkbox": {
        const options =
          field.optionsSource === "mdm" ? [] : normalizeOptions(field);
        if (field.optionsSource === "mdm") {
          return (
            <DynamicOptionsSelect
              field={field}
              value={value || []}
              formData={formData}
              projectId={projectId}
              disabled={disabled}
              required={isRequired}
              multiple
              style={baseStyle}
              onChange={(next) => onChange(field.fieldName, next)}
            />
          );
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {options.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  value={opt.value}
                  checked={(value || []).includes(opt.value)}
                  onChange={(e) => {
                    const cur: string[] = value || [];
                    onChange(
                      field.fieldName,
                      e.target.checked
                        ? [...cur, opt.value]
                        : cur.filter((v) => v !== opt.value),
                    );
                  }}
                  disabled={disabled}
                  style={{ accentColor: primaryColor }}
                />
                <span style={{ fontSize: "14px", color: "#374151" }}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        );
      }

      case "file":
        if (disabled) {
          return (
            <div
              style={{
                padding: "20px",
                border: "2px dashed #d1d5db",
                borderRadius: "8px",
                textAlign: "center",
                color: "#9ca3af",
                background: "#f9fafb",
              }}
            >
              <DocumentArrowUpIcon
                style={{
                  width: 28,
                  height: 28,
                  margin: "0 auto 6px",
                  color: "#d1d5db",
                }}
              />
              <div style={{ fontSize: "13px" }}>File upload (preview only)</div>
              {(field.allowedFileTypes?.length ?? 0) > 0 && (
                <div style={{ fontSize: "12px", marginTop: "4px" }}>
                  Allowed: {field.allowedFileTypes!.join(", ")}
                  {field.maxFileSizeMB
                    ? ` · max ${field.maxFileSizeMB} MB`
                    : ""}
                </div>
              )}
            </div>
          );
        }

        const files = fieldFiles[field.fieldName] || [];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                border: "2px dashed #d1d5db",
                borderRadius: "8px",
                cursor: "pointer",
                textAlign: "center",
                transition: "border-color 0.15s",
              }}
            >
              <DocumentArrowUpIcon
                style={{
                  width: 28,
                  height: 28,
                  color: "#9ca3af",
                  marginBottom: 6,
                }}
              />
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                Click to upload
              </span>
              {(field.allowedFileTypes?.length ?? 0) > 0 && (
                <span
                  style={{ fontSize: "12px", color: "#9ca3af", marginTop: 4 }}
                >
                  Allowed: {field.allowedFileTypes!.join(", ")}
                </span>
              )}
              {field.maxFileSizeMB && (
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                  Max: {field.maxFileSizeMB} MB
                </span>
              )}
              <input
                type="file"
                multiple={field.allowMultiple}
                accept={field.allowedFileTypes?.join(",")}
                onChange={(e) =>
                  onFileChange?.(field.fieldName, e.target.files)
                }
                style={{ display: "none" }}
              />
            </label>
            {files.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  background: "#f0f9ff",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile?.(field.fieldName, i)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#ef4444",
                    display: "flex",
                  }}
                >
                  <XMarkIcon style={{ width: 15, height: 15 }} />
                </button>
              </div>
            ))}
          </div>
        );

      default:
        // text, number, date, email, phone, url
        return (
          <input
            type={field.fieldType === "phone" ? "tel" : field.fieldType}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            required={isRequired}
            readOnly={disabled}
            style={baseStyle}
          />
        );
    }
  };

  return (
    <div>
      {previewMode && (
        <div
          style={{
            padding: "8px 14px",
            background: "#fef3c7",
            border: "1px solid #fbbf24",
            borderRadius: "8px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#92400e",
            fontWeight: "500",
          }}
        >
          ⚠️ Preview mode — interactions are for testing conditions only. No
          data will be submitted.
        </div>
      )}

      {fields.map((field) => {
        const isCurrentlyVisible = visibleFields.has(field.fieldName);
        // In showAllFields mode (admin preview), render all fields;
        // otherwise skip hidden ones as usual.
        if (!isCurrentlyVisible && !showAllFields) return null;
        const isRequired = requiredFields.has(field.fieldName);
        const isConditionHidden =
          showAllFields && !isCurrentlyVisible && !field.isFixed;
        return (
          <div
            key={field.fieldName}
            style={{
              ...WRAPPER_STYLE,
              ...(isConditionHidden ? { opacity: 0.55 } : {}),
            }}
          >
            {isConditionHidden && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "2px 8px",
                  marginBottom: "4px",
                  background: "#fef9c3",
                  border: "1px solid #fde047",
                  borderRadius: "5px",
                  fontSize: "11px",
                  color: "#854d0e",
                  fontWeight: 500,
                }}
              >
                ⚡ Conditional — condition not yet triggered
              </div>
            )}
            <label style={LABEL_STYLE}>
              {field.fieldLabel || field.fieldName}
              {isRequired && (
                <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>
              )}
            </label>
            {renderControl(field)}
          </div>
        );
      })}
    </div>
  );
};

export default FormRenderer;

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Filter formData to only include values from visible fields.
 * Call this before submission to ensure hidden fields don't submit values.
 */
export function filterFormDataToVisible(
  formData: Record<string, any>,
  visibleFields: Set<string>,
): Record<string, any> {
  const result: Record<string, any> = {};
  visibleFields.forEach((name) => {
    if (name in formData) result[name] = formData[name];
  });
  return result;
}
