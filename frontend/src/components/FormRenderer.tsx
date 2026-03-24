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

import React from "react";
import { DocumentArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { conditionEngine, FormFieldSchema } from "../utils/conditionEngine";

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

// ─── Component ────────────────────────────────────────────────────────────────

export const FormRenderer: React.FC<FormRendererProps> = ({
  fields,
  formData,
  onChange,
  onFileChange,
  fieldFiles = {},
  onRemoveFile,
  previewMode = false,
  branding,
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
          <select
            value={value}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            required={isRequired}
            disabled={disabled}
            style={baseStyle}
          >
            <option value="">
              {field.placeholder ||
                `Select ${field.fieldLabel || field.fieldName}`}
            </option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case "multiselect":
        return (
          <select
            multiple
            value={value || []}
            onChange={(e) => {
              const selected = Array.from(
                e.target.selectedOptions,
                (o) => o.value,
              );
              onChange(field.fieldName, selected);
            }}
            required={isRequired}
            disabled={disabled}
            style={{ ...baseStyle, minHeight: "100px" }}
          >
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case "radio":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {field.options?.map((opt) => (
              <label
                key={opt}
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
                  value={opt}
                  checked={value === opt}
                  onChange={(e) => onChange(field.fieldName, e.target.value)}
                  disabled={disabled}
                  style={{ accentColor: primaryColor }}
                />
                <span style={{ fontSize: "14px", color: "#374151" }}>
                  {opt}
                </span>
              </label>
            ))}
          </div>
        );

      case "checkbox":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {field.options?.map((opt) => (
              <label
                key={opt}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  value={opt}
                  checked={(value || []).includes(opt)}
                  onChange={(e) => {
                    const cur: string[] = value || [];
                    onChange(
                      field.fieldName,
                      e.target.checked
                        ? [...cur, opt]
                        : cur.filter((v) => v !== opt),
                    );
                  }}
                  disabled={disabled}
                  style={{ accentColor: primaryColor }}
                />
                <span style={{ fontSize: "14px", color: "#374151" }}>
                  {opt}
                </span>
              </label>
            ))}
          </div>
        );

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
        if (!visibleFields.has(field.fieldName)) return null;
        const isRequired = requiredFields.has(field.fieldName);
        return (
          <div key={field.fieldName} style={WRAPPER_STYLE}>
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
