/**
 * SR Settings — Simplified
 *
 * Step-by-step configuration:
 *   1. Enable ticket types (PSR / ISR)
 *   2. Per-channel form builder — every channel has toggle + configurable fields
 *      • cURL / API import on Prospect Parent: paste → test → discover fields → auto-create
 */

import React, { useEffect, useState } from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CommandLineIcon,
  BeakerIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { serviceRequestApi } from "../../services/serviceRequests";
import { api } from "../../utils/api";
import FormRenderer from "../../components/FormRenderer";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { listTables, testMaster, listMasters } from "../../services/psrBuilderService";
import type { Master } from "../../services/psrBuilderService";
import { useHierarchyConfig } from "../../components/HierarchyCategorySelector";
import type { FormFieldSchema } from "../../utils/conditionEngine";

// ─── cURL parser ──────────────────────────────────────────────────────────────

function splitArgs(input: string): string[] {
  const s = input.replace(/\\\r?\n/g, " ");
  const out: string[] = []; let cur = ""; let q: "" | "'" | '"' = ""; let started = false;
  for (const c of s) {
    if (q) { if (c === q) q = ""; else cur += c; started = true; }
    else if (c === "'" || c === '"') { q = c; started = true; }
    else if (/\s/.test(c)) { if (started) { out.push(cur); cur = ""; started = false; } }
    else { cur += c; started = true; }
  }
  if (started) out.push(cur);
  return out;
}

function parseCurl(raw: string): { url: string; method: "GET" | "POST"; authType: "none" | "bearer" | "apikey"; token: string; notes: string[] } {
  const toks = splitArgs(raw.trim());
  if (toks[0] === "curl") toks.shift();
  let method = ""; let url = ""; const headers: [string, string][] = []; let body = "";
  const vf = new Set(["-X","--request","-H","--header","-u","--user","-d","--data","--data-raw","--url"]);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "-X" || t === "--request") method = (toks[++i] || "").toUpperCase();
    else if (t === "-H" || t === "--header") { const h = toks[++i] || ""; const ci = h.indexOf(":"); if (ci > 0) headers.push([h.slice(0,ci).trim(), h.slice(ci+1).trim()]); }
    else if (["-d","--data","--data-raw"].includes(t)) body = toks[++i] || "";
    else if (t === "--url") url = toks[++i] || "";
    else if (t.startsWith("-")) { if (vf.has(t)) i++; }
    else if (!url) url = t;
  }
  if (!url) throw new Error("No URL found — check the cURL and try again.");
  const notes: string[] = [];
  let authType: "none" | "bearer" | "apikey" = "none";
  let token = "";
  for (const [k, v] of headers) {
    if (/^authorization$/i.test(k)) {
      const b = v.match(/^Bearer\s+(.+)$/i);
      if (b) { authType = "bearer"; token = b[1]; notes.push("Bearer token captured."); }
    } else if (/api[-_ ]?key/i.test(k)) {
      authType = "apikey"; token = v; notes.push(`API key captured from "${k}".`);
    }
  }
  const m: "GET" | "POST" = method === "POST" || (!method && body) ? "POST" : "GET";
  return { url, method: m, authType, token, notes };
}

function parseCrmCurl(raw: string): {
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  authHeaderName?: string;
  authHeaderValue?: string;
  headers: Record<string, string>;
  bodyTemplate?: string;
} {
  const toks = splitArgs(raw.trim());
  if (toks[0] === "curl") toks.shift();
  let method = "";
  let endpoint = "";
  let bodyTemplate = "";
  const headers: Record<string, string> = {};
  let authHeaderName = "";
  let authHeaderValue = "";

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "-X" || t === "--request") {
      method = (toks[++i] || "").toUpperCase();
    } else if (t === "-H" || t === "--header") {
      const rawHeader = toks[++i] || "";
      const idx = rawHeader.indexOf(":");
      if (idx > 0) {
        const name = rawHeader.slice(0, idx).trim();
        const value = rawHeader.slice(idx + 1).trim();
        if (name.toLowerCase() === "authorization") {
          authHeaderName = "Authorization";
          authHeaderValue = value;
        } else {
          headers[name] = value;
        }
      }
    } else if (["-d", "--data", "--data-raw", "--data-binary"].includes(t)) {
      bodyTemplate = toks[++i] || "";
    } else if (t === "--url") {
      endpoint = toks[++i] || "";
    } else if (!t.startsWith("-") && !endpoint) {
      endpoint = t;
    }
  }

  if (!endpoint) throw new Error("No CRM endpoint found in the cURL.");
  const normalizedMethod =
    method === "PUT" || method === "PATCH" || method === "POST"
      ? method
      : "POST";
  return {
    endpoint,
    method: normalizedMethod,
    authHeaderName,
    authHeaderValue,
    headers,
    bodyTemplate,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChannelField {
  id: string;
  label: string;
  type: "search" | "dropdown" | "text" | "textarea" | "date" | "mobile" | "email";
  required: boolean;
  dataSource: "psr_table" | "mdm" | "static" | "none" | "category";
  psrTableId?: string;
  psrTableColumn?: string;
  mdmMasterId?: string;     // PSR Builder master to call live
  mdmDataType?: string;
  mdmLabelField?: string;
  mdmValueField?: string;
  mdmSearchParam?: string;
  mdmDependsOnField?: string;
  mdmDependsOnParam?: string;
  mdmDependsOnRemoteField?: string;
  mdmLimit?: number;
  staticOptions?: string[];
  categoryMaxLevel?: number; // limit cascade to N levels (undefined = full hierarchy)
  /** Which category tree the cascade uses (categories differ per interaction type). */
  categoryScope?: "normal" | "PSR" | "ISR";
  schemaField?: FormFieldSchema;
  /**
   * Self-service auto-fill role (parent app). Resolved from the logged-in
   * parent's identity + selected student — the parent does not type these.
   *  - parent        → the logged-in parent (read-only)
   *  - student       → dropdown of the parent's children (parent picks)
   *  - student_attr  → auto-filled from the selected student (read-only),
   *                    e.g. grade / school / location (see studentAttr)
   */
  autoRole?: "none" | "parent" | "student" | "student_attr";
  /** Student attribute key to auto-fill when autoRole = "student_attr". */
  studentAttr?: string;
  /**
   * Explicit column mapping for the PSR Builder master (self-service). Maps
   * master column names to the fields we need, so lookups don't guess.
   */
  studentCols?: {
    mobile?: string;
    parentName?: string;
    parentNameLast?: string;
    name?: string;
    nameLast?: string;
    grade?: string;
    school?: string;
    id?: string;
    location?: string;
  };
}

interface ChannelConfig {
  enabled: boolean;
  fields: ChannelField[];
  junkMode?: boolean;
}

interface LeadSyncConfig {
  enabled: boolean;
  endpoint?: string;
  method?: "POST" | "PUT" | "PATCH";
  timeoutMs?: number;
  authHeaderName?: string;
  authHeaderValue?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
}

interface SrNumberingConfig {
  prefix: string;
  format: string;
  resetPeriod: "daily" | "monthly" | "yearly" | "never";
  startingNumber: number;
}

interface SrMessages {
  duplicate: string;
  closureDefault: string;
  responseDefault: string;
}

interface SimpleConfig {
  psrEnabled: boolean;
  isrEnabled: boolean;
  numbering: {
    PSR: SrNumberingConfig;
    ISR: SrNumberingConfig;
  };
  messages: SrMessages;
  feedback: {
    notifyManagerOnNegative: boolean;
    ratingThreshold: number;
    notifyUserId: string;
    notifyRoleId: string;
  };
  emailJunkSenders: string;
  crm: { leadSync: LeadSyncConfig };
  existingParent: ChannelConfig;
  prospectParent: ChannelConfig;
  junk: ChannelConfig;
  vendor: ChannelConfig;
  job: ChannelConfig;
  others: ChannelConfig;
  studentPortal: ChannelConfig;
  isr: ChannelConfig;
}

interface SrFormSchema {
  id?: string;
  _id?: string;
  name: string;
  interactionType: "PSR" | "ISR";
  channel: string;
  isActive?: boolean;
  fields: FormFieldSchema[];
}

const uid = () => `f_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
const mkField = (label: string, type: ChannelField["type"] = "text", required = false): ChannelField =>
  ({ id: uid(), label, type, required, dataSource: "none" });

const slugFieldName = (label: string) =>
  String(label || "field")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+([a-zA-Z0-9])/g, (_, char) => String(char).toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase()) || uid();

// Device presets for the mobile preview frame.
const PREVIEW_DEVICES: Array<{ id: string; label: string; w: number; h: number }> = [
  { id: "iphone_se", label: "iPhone SE", w: 375, h: 667 },
  { id: "iphone_13", label: "iPhone 13/14", w: 390, h: 844 },
  { id: "pixel_7", label: "Pixel 7", w: 412, h: 915 },
  { id: "galaxy_s", label: "Galaxy S", w: 360, h: 800 },
];

/**
 * Right-hand mobile preview for the Student-Portal (parent self-service) form,
 * plus a copy-paste webview embed for the app team. The app only opens our
 * hosted webview in a modal — it renders raise / my-requests / detail + reply.
 */
const PortalMobilePreview: React.FC<{ fields: ChannelField[]; projectId: string }> = ({
  fields,
  projectId,
}) => {
  const [deviceId, setDeviceId] = useState("iphone_13");
  const [copied, setCopied] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const device = PREVIEW_DEVICES.find((d) => d.id === deviceId) || PREVIEW_DEVICES[1];

  // Convert the builder's ChannelField[] into the renderer's schema. Annotate
  // auto-fill roles so the preview shows which fields the parent won't type.
  // ALL fields are shown (search → renders as text via the converter).
  const roleLabel = (r?: string) =>
    r === "parent"
      ? " · auto (logged-in parent)"
      : r === "student"
        ? " · select child"
        : r === "student_attr"
          ? " · auto from student"
          : "";
  const schemaFields: FormFieldSchema[] = (fields || []).map((f, i) => {
    const s = channelFieldToSchemaField(f, i);
    if (f.autoRole && f.autoRole !== "none") {
      s.fieldLabel = `${s.fieldLabel || s.fieldName}${roleLabel(f.autoRole)}`;
      if (f.autoRole !== "student") s.placeholder = "Auto-filled";
    }
    return s;
  });

  const webviewUrl = `${window.location.origin}/portal/service-requests?token=<PARENT_SSO_TOKEN>`;
  const embed = [
    "// Mobile app: open our hosted self-service webview inside a modal.",
    "// We render Raise request · My requests · Request detail + reply.",
    "// Pass the parent's SSO session token so we can identify them.",
    `const url = "${window.location.origin}/portal/service-requests?token=" + parentSsoToken;`,
    "openModalWebView(url); // your app's modal + WebView container",
  ].join("\n");

  const copy = (text: string, which: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };
  const codeBox: React.CSSProperties = {
    background: "#0f172a",
    color: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    fontSize: 11.5,
    fontFamily: "monospace",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    marginTop: 6,
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-800">Mobile preview</p>
        <div className="flex items-center gap-2">
          {/* Preview (read-only) ↔ Test (interactive) */}
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setTestMode(false)}
              className={`px-2 py-1 ${!testMode ? "bg-indigo-600 text-white" : "bg-white text-gray-600"}`}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => setTestMode(true)}
              className={`px-2 py-1 ${testMode ? "bg-indigo-600 text-white" : "bg-white text-gray-600"}`}
            >
              Test
            </button>
          </div>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          >
            {PREVIEW_DEVICES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · {d.w}×{d.h}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Phone frame */}
      <div className="flex justify-center">
        <div
          style={{
            width: device.w * 0.82 + 16,
            border: "10px solid #0f172a",
            borderRadius: 34,
            background: "#0f172a",
            boxShadow: "0 12px 30px rgba(15,23,42,0.25)",
          }}
        >
          {/* notch */}
          <div style={{ height: 18, display: "flex", justifyContent: "center" }}>
            <div style={{ width: 90, height: 6, borderRadius: 6, background: "#334155", marginTop: 6 }} />
          </div>
          <div
            style={{
              width: device.w * 0.82,
              height: device.h * 0.82,
              background: "#f8fafc",
              borderRadius: 20,
              overflow: "auto",
              margin: "0 auto",
            }}
          >
            <div style={{ padding: 12, transform: "scale(0.82)", transformOrigin: "top left", width: "122%" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", marginBottom: 8 }}>
                Raise a request
              </div>
              {schemaFields.length === 0 ? (
                <p style={{ fontSize: 12, color: "#9ca3af" }}>
                  Add fields to the form to preview them here.
                </p>
              ) : (
                <FormRenderer
                  fields={schemaFields}
                  formData={formData}
                  onChange={(name, value) =>
                    setFormData((prev) => ({ ...prev, [name]: value }))
                  }
                  previewMode={!testMode}
                  showAllFields={!testMode}
                  projectId={projectId}
                />
              )}
            </div>
          </div>
          <div style={{ height: 14 }} />
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-gray-400">
        Read-only preview of how the parent sees the form in the app webview.
      </p>

      {/* Copy code for the app team */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold text-slate-700">Webview embed (share with app team)</p>
          <button
            type="button"
            onClick={() => copy(embed, "embed")}
            className="rounded border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-bold text-indigo-700"
          >
            {copied === "embed" ? "Copied ✓" : "Copy code"}
          </button>
        </div>
        <div style={codeBox}>{embed}</div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          The app only adds an icon that opens this URL in a modal WebView. The{" "}
          <code>token</code> is the parent's SSO session token; the webview lets
          them raise a request, view their requests, and reply — no other app work.
        </p>
      </div>
    </div>
  );
};

const schemaTypeToChannelType = (fieldType: string): ChannelField["type"] => {
  const type = String(fieldType || "").toLowerCase();
  if (["select", "dropdown", "radio"].includes(type)) return "dropdown";
  if (type === "textarea") return "textarea";
  if (["phone", "mobile"].includes(type)) return "mobile";
  if (type === "email") return "email";
  if (type === "date") return "date";
  return "text";
};

const channelTypeToSchemaType = (type: ChannelField["type"]) => {
  if (type === "dropdown") return "dropdown";
  if (type === "mobile") return "phone";
  return type === "search" ? "text" : type;
};

const schemaFieldToChannelField = (field: FormFieldSchema): ChannelField => {
  const dataSource: ChannelField["dataSource"] =
    field.optionsSource === "mdm"
      ? "mdm"
      : Array.isArray(field.options) && field.options.length > 0
        ? "static"
        : "none";
  return {
    id: field.id || field.fieldName || uid(),
    label: field.fieldLabel || field.fieldName,
    type: schemaTypeToChannelType(field.fieldType),
    required: field.requiredMode === "always" || field.required === true,
    dataSource,
    staticOptions: field.options || [],
    mdmMasterId: field.mdm?.sourceId,
    mdmDataType: field.mdm?.dataType,
    mdmLabelField: field.mdm?.labelField,
    mdmValueField: field.mdm?.valueField,
    mdmSearchParam: field.mdm?.searchParam,
    mdmDependsOnField: field.mdm?.dependsOnField,
    mdmDependsOnParam: field.mdm?.dependsOnParam,
    mdmDependsOnRemoteField: field.mdm?.dependsOnRemoteField,
    mdmLimit: field.mdm?.limit,
    schemaField: field,
  };
};

const channelFieldToSchemaField = (
  field: ChannelField,
  index: number,
): FormFieldSchema => {
  const base = field.schemaField || ({} as FormFieldSchema);
  const fieldName = base.fieldName || slugFieldName(field.label);
  const next: FormFieldSchema = {
    ...base,
    id: base.id || field.id,
    fieldName,
    fieldLabel: field.label || base.fieldLabel || fieldName,
    fieldType: channelTypeToSchemaType(field.type),
    required: field.required,
    requiredMode: field.required ? "always" : base.requiredMode || "optional",
    order: index + 1,
    ...(field.dataSource === "category"
      ? { categoryScope: field.categoryScope || "normal" }
      : {}),
  };

  if (field.dataSource === "static") {
    next.optionsSource = "manual";
    next.options = field.staticOptions || base.options || [];
  } else if (field.dataSource === "mdm") {
    next.optionsSource = "mdm";
    next.mdm = {
      ...(base.mdm || {}),
      sourceId: field.mdmMasterId || base.mdm?.sourceId,
      dataType: field.mdmDataType || base.mdm?.dataType || "custom",
      labelField: field.mdmLabelField || base.mdm?.labelField,
      valueField: field.mdmValueField || base.mdm?.valueField,
      searchParam: field.mdmSearchParam || base.mdm?.searchParam,
      dependsOnField: field.mdmDependsOnField || undefined,
      dependsOnParam: field.mdmDependsOnParam || undefined,
      dependsOnRemoteField: field.mdmDependsOnRemoteField || undefined,
      limit: field.mdmLimit || base.mdm?.limit || 100,
    };
  }

  return next;
};

const makeSchemaField = (
  fieldName: string,
  patch: Partial<FormFieldSchema> = {},
): FormFieldSchema => ({
  id: patch.id || `${fieldName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  fieldName,
  fieldLabel:
    patch.fieldLabel ||
    fieldName
      .replace(/Raw$|Label$|Labels$/g, "")
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]+/g, " ")
      .replace(/^./, (char) => char.toUpperCase()),
  fieldType: patch.fieldType || "text",
  required: patch.required ?? false,
  requiredMode: patch.requiredMode || (patch.required ? "always" : "optional"),
  optionsSource: patch.optionsSource || "manual",
  options: patch.options || [],
  ...patch,
});

const crmPathToFieldName = (path: string) => {
  const normalized = path
    .replace(/^data\./, "")
    .replace(/^parent_details\.father_details\./, "parent.")
    .replace(/^parent_details\.mother_details\./, "parent.")
    .replace(/^parent_details\.guardian_details\./, "parent.")
    .replace(/^student_details\./, "student.")
    .replace(/\.value$/, "")
    .replace(/\.id$/, "");
  const exact: Record<string, string> = {
    parent_type: "parent_type",
    "parent.first_name": "firstName",
    "parent.last_name": "lastName",
    "parent.mobile": "contactNumber",
    "parent.email": "email",
    enquiry_type: "enquiry_type",
    enquiry_date: "enquiry_date",
    academic_year: "academicYear",
    school_location: "schoolLocation",
    "student.grade": "grade",
    "student.first_name": "studentFirstName",
    "student.last_name": "studentLastName",
    "student.dob": "dob",
    enquiry_mode: "enquiryMode",
    enquiry_source_type: "enquirySourceType",
    enquiry_source: "enquirySource",
    enquiry_sub_source: "enquirySubSource",
    utm_source: "utm_source",
    utm_medium: "utm_medium",
    utm_campaign: "utm_campaign",
    gcl_id: "gcl_id",
    query: "query",
  };
  if (exact[normalized]) return exact[normalized];
  return normalized
    .split(".")
    .filter(Boolean)
    .map((part, index) => {
      const clean = part.replace(/[^a-zA-Z0-9]+/g, " ");
      const words = clean
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const joined = words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
      return index === 0
        ? joined.charAt(0).toLowerCase() + joined.slice(1)
        : joined;
    })
    .join("") || slugFieldName(path);
};

const crmPathToLabel = (path: string) =>
  path
    .replace(/^data\./, "")
    .replace(/^parent_details\.(father_details|mother_details|guardian_details)\./, "Parent ")
    .replace(/^student_details\./, "Student ")
    .replace(/\.value$/, "")
    .replace(/\.id$/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const fieldDefaultsForCrmPath = (
  path: string,
  fieldName: string,
  value: any,
): Partial<FormFieldSchema> => {
  const lower = `${path}.${fieldName}`.toLowerCase();
  const required =
    lower.includes("first_name") ||
    lower.includes("mobile") ||
    lower.includes("email") ||
    ["parent_type", "academicYear", "schoolLocation", "grade"].includes(fieldName);
  const fieldType =
    lower.includes("email")
      ? "email"
      : lower.includes("mobile") || lower.includes("phone")
        ? "phone"
        : lower.includes("date") || lower.includes("dob")
          ? "date"
          : lower.includes("query") || lower.includes("enquiry")
            ? "textarea"
            : typeof value === "object" || lower.includes("type") || lower.includes("mode") || lower.includes("source") || lower.includes("year") || lower.includes("school") || lower.includes("grade")
              ? "dropdown"
              : "text";
  return {
    fieldLabel: crmPathToLabel(path),
    fieldType,
    required,
    requiredMode: required ? "always" : "optional",
    options: fieldName === "parent_type" ? ["Father", "Mother", "Guardian"] : [],
  };
};

const generateProspectFieldsFromCrmBody = (
  rawBody: string,
): { fields: ChannelField[]; bodyTemplate: string } => {
  const parsed = JSON.parse(rawBody || "{}");
  const byName = new Map<string, FormFieldSchema>();

  const addField = (path: string, value: any) => {
    const fieldName = crmPathToFieldName(path);
    if (!byName.has(fieldName)) {
      byName.set(
        fieldName,
        makeSchemaField(fieldName, fieldDefaultsForCrmPath(path, fieldName, value)),
      );
    }
    return fieldName;
  };

  const walk = (value: any, path: string): any => {
    if (path && !path.startsWith("data")) return value;
    if (Array.isArray(value)) return value.map((item, index) => walk(item, `${path}.${index}`));
    if (value && typeof value === "object") {
      const keys = Object.keys(value);
      const isLookupObject =
        keys.includes("id") &&
        keys.includes("value") &&
        keys.every((key) => ["id", "value"].includes(key));
      if (isLookupObject) {
        const fieldName = addField(path, value);
        return {
          id: `{{lead.${fieldName}}}`,
          value: `{{lead.${fieldName}Label}}`,
        };
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          walk(item, path ? `${path}.${key}` : key),
        ]),
      );
    }
    const fieldName = addField(path, value);
    return `{{lead.${fieldName}}}`;
  };

  const template = walk(parsed, "");
  const fields = Array.from(byName.values()).map((field, index) =>
    schemaFieldToChannelField({ ...field, order: index + 1 }),
  );

  return {
    fields,
    bodyTemplate: JSON.stringify(template, null, 2),
  };
};

const isProspectParentSchema = (schema: SrFormSchema) => {
  const interactionType = String(schema.interactionType || "").toLowerCase();
  const channel = String(schema.channel || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const name = String(schema.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return (
    schema.isActive !== false &&
    interactionType === "psr" &&
    (channel === "prospectparent" ||
      channel === "crmlead" ||
      channel === "lead" ||
      name.includes("prospectparent") ||
      name.includes("crmlead"))
  );
};

const DEFAULT_EXISTING: ChannelField[] = [
  { id: uid(), label: "Search parent / guardian", type: "search", required: true, dataSource: "psr_table" },
];

function fromBackend(cfg: any, forms: SrFormSchema[] = []): SimpleConfig {
  const lookup = cfg?.psr?.intake?.lookup;
  const ccf = (cfg?.customChannelFields || {}) as Record<string, ChannelField[]>;
  const prospectForm = forms.find(isProspectParentSchema) || null;
  const searchField: ChannelField[] = lookup?.psrBuilderTableId
    ? [{ id: uid(), label: "Search parent / guardian", type: "search" as const, required: true, dataSource: "psr_table" as const, psrTableId: lookup.psrBuilderTableId }]
    : DEFAULT_EXISTING.map(f => ({ ...f, id: uid() }));
  const loadFields = (key: string, defaults: ChannelField[]) => {
    const saved = ccf[key];
    if (saved?.length) return saved.map(f => ({ ...f, id: uid() }));
    return defaults.map(f => ({ ...f, id: uid() }));
  };
  return {
    psrEnabled: !!cfg?.psr?.enabled,
    isrEnabled: !!cfg?.isr?.enabled,
    numbering: {
      PSR: {
        prefix: cfg?.numbering?.PSR?.prefix || "PSR",
        format: cfg?.numbering?.PSR?.format || "{PREFIX}-{YYYY}-{NNNN}",
        resetPeriod: cfg?.numbering?.PSR?.resetPeriod || "yearly",
        startingNumber: Number(cfg?.numbering?.PSR?.startingNumber || 1),
      },
      ISR: {
        prefix: cfg?.numbering?.ISR?.prefix || "ISR",
        format: cfg?.numbering?.ISR?.format || "{PREFIX}-{YYYY}-{NNNN}",
        resetPeriod: cfg?.numbering?.ISR?.resetPeriod || "yearly",
        startingNumber: Number(cfg?.numbering?.ISR?.startingNumber || 1),
      },
    },
    messages: {
      duplicate: cfg?.messages?.duplicate || "",
      closureDefault: cfg?.messages?.closureDefault || "",
      responseDefault: cfg?.messages?.responseDefault || "",
    },
    feedback: {
      notifyManagerOnNegative: cfg?.feedback?.notifyManagerOnNegative === true,
      ratingThreshold: Number(cfg?.feedback?.ratingThreshold ?? 2),
      notifyUserId: cfg?.feedback?.notifyUserId || "",
      notifyRoleId: cfg?.feedback?.notifyRoleId || "",
    },
    emailJunkSenders: Array.isArray(cfg?.emailJunk?.senders)
      ? cfg.emailJunk.senders.join("\n")
      : "",
    crm: {
      leadSync: {
        enabled: cfg?.crm?.leadSync?.enabled === true,
        endpoint: cfg?.crm?.leadSync?.endpoint || "",
        method: cfg?.crm?.leadSync?.method || "POST",
        timeoutMs: cfg?.crm?.leadSync?.timeoutMs || 30000,
        authHeaderName: cfg?.crm?.leadSync?.authHeaderName || "",
        authHeaderValue: cfg?.crm?.leadSync?.authHeaderValue || "",
        headers:
          cfg?.crm?.leadSync?.headers &&
          typeof cfg.crm.leadSync.headers === "object"
            ? cfg.crm.leadSync.headers
            : {},
        bodyTemplate: cfg?.crm?.leadSync?.bodyTemplate || "",
      },
    },
    existingParent: { enabled: true, fields: [...searchField, ...loadFields("existing_parent", [])] },
    prospectParent: {
      enabled: true,
      fields: prospectForm?.fields?.length
        ? prospectForm.fields.map(schemaFieldToChannelField)
        : loadFields("prospect_parent", []),
    },
    junk:   { enabled: true,  fields: [], junkMode: true },
    vendor: { enabled: false, fields: loadFields("vendor", [mkField("Company name","text",true), mkField("Contact email","email")]) },
    job:    { enabled: false, fields: loadFields("job", [mkField("Candidate name","text",true), mkField("Position applied for","text"), mkField("Mobile","mobile")]) },
    others: { enabled: true,  fields: loadFields("others", [mkField("Subject","text",true), mkField("Details","text")]) },
    studentPortal: { enabled: true, fields: loadFields("student_portal", [
      { id: uid(), label: "Category",    type: "dropdown" as const, required: false, dataSource: "category" as const },
      mkField("Subject",     "text",     true),
      mkField("Description", "textarea",  false),
    ]) },
    isr: { enabled: true, fields: loadFields("isr", [
      { id: uid(), label: "Category",    type: "dropdown" as const, required: true, dataSource: "category" as const },
      mkField("Subject",     "text",     true),
      mkField("Description", "textarea",  false),
    ]) },
  };
}

function toBackendPatch(s: SimpleConfig, existing: any): any {
  const sf = s.existingParent.fields.find(f => f.type === "search");
  const nonSearch = (fields: ChannelField[]) => fields.filter(f => f.type !== "search");
  return {
    numbering: s.numbering,
    messages: {
      duplicate: s.messages.duplicate || "",
      closureDefault: s.messages.closureDefault || "",
      responseDefault: s.messages.responseDefault || "",
    },
    feedback: {
      notifyManagerOnNegative: s.feedback.notifyManagerOnNegative,
      ratingThreshold: Number(s.feedback.ratingThreshold) || 2,
      notifyUserId: s.feedback.notifyUserId || undefined,
      notifyRoleId: s.feedback.notifyRoleId || undefined,
    },
    emailJunk: {
      senders: (s.emailJunkSenders || "")
        .split("\n")
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean),
    },
    psr: { ...existing?.psr, enabled: s.psrEnabled, intake: { ...(existing?.psr?.intake||{}), lookup: { ...(existing?.psr?.intake?.lookup||{}), source: sf?.psrTableId ? "psr_builder" : "auto", psrBuilderTableId: sf?.psrTableId||undefined } } },
    isr: { ...existing?.isr, enabled: s.isrEnabled },
    crm: {
      ...(existing?.crm || {}),
      leadSync: {
        ...(existing?.crm?.leadSync || {}),
        ...s.crm.leadSync,
        method: s.crm.leadSync.method || "POST",
        timeoutMs: Number(s.crm.leadSync.timeoutMs || 30000),
        headers: s.crm.leadSync.headers || {},
      },
    },
    customChannelFields: {
      existing_parent: nonSearch(s.existingParent.fields),
      prospect_parent: existing?.customChannelFields?.prospect_parent || [],
      vendor:          nonSearch(s.vendor.fields),
      job:             nonSearch(s.job.fields),
      others:          nonSearch(s.others.fields),
      // Self-service form: keep ALL fields (search-type fields are valid here,
      // e.g. an auto-identified parent field) so nothing is dropped on save.
      student_portal:  s.studentPortal.fields,
      isr:             s.isr.fields,
    },
  };
}

// ─── UI primitives ────────────────────────────────────────────────────────────

const Card = ({ children, className="" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-gray-200 bg-white overflow-hidden ${className}`}>{children}</div>
);

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <label className="flex cursor-pointer items-center gap-2">
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-gray-200"}`}>
      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
    <span className="text-sm font-medium text-gray-700">{label}</span>
  </label>
);

// ─── Field row ────────────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: "search",   icon: "🔍", label: "Search" },
  { value: "dropdown", icon: "▾",  label: "Dropdown" },
  { value: "text",     icon: "T",  label: "Text" },
  { value: "textarea", icon: "¶",  label: "Textarea" },
  { value: "mobile",   icon: "📱", label: "Mobile" },
  { value: "email",    icon: "✉",  label: "Email" },
  { value: "date",     icon: "📅", label: "Date" },
] as const;

function FieldRow({ field, fields, tables, masters, projectId, onChange, onDelete, canDelete }: {
  field: ChannelField; fields: ChannelField[]; tables: any[]; masters: Master[]; projectId: string; onChange: (f: ChannelField) => void; onDelete: () => void; canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const icon = FIELD_TYPES.find(t => t.value === field.type)?.icon ?? "•";
  const selectedTable = tables.find(t => t._id === field.psrTableId);
  const fieldNameForDependency = (candidate: ChannelField) =>
    candidate.schemaField?.fieldName || slugFieldName(candidate.label);
  const dependencyFields = fields
    .filter((candidate) => candidate.id !== field.id && candidate.type !== "search")
    .map((candidate) => ({
      label: candidate.label,
      value: fieldNameForDependency(candidate),
    }));
  // Only fetch hierarchy config when this field uses the Category Master data source
  const { config: hierConfig, loading: hierLoading } = useHierarchyConfig(
    field.dataSource === "category" ? projectId : ""
  );

  return (
    <div className={`rounded-lg border transition-colors ${open ? "border-indigo-300 bg-indigo-50/20" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <span className="text-sm">{icon}</span>
        <div className="flex-1 min-w-0">
          <input className="w-full bg-transparent text-sm font-semibold text-gray-800 focus:outline-none placeholder-gray-400"
            value={field.label} onChange={e => onChange({ ...field, label: e.target.value })} placeholder="Field label…" />
          <p className="text-[10px] text-gray-400">
            {FIELD_TYPES.find(t => t.value === field.type)?.label}
            {field.dataSource === "psr_table" && selectedTable ? ` · ${selectedTable.name}` : field.dataSource !== "none" ? ` · ${field.dataSource}` : ""}
            {field.required && " · required"}
          </p>
        </div>
        <button onClick={() => setOpen(o => !o)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
          {open ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
        </button>
        {canDelete && (
          <button onClick={onDelete} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500">
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-indigo-100 bg-white px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Type</p>
              <select className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                value={field.type} onChange={e => onChange({ ...field, type: e.target.value as ChannelField["type"] })}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon}  {t.label}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={field.required} onChange={e => onChange({ ...field, required: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                <span className="text-sm text-gray-700">Required</span>
              </label>
            </div>
          </div>

          {/* Self-service auto-fill role (parent app) */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              Auto-fill from login (parent self-service)
            </p>
            <select
              className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
              value={field.autoRole || "none"}
              onChange={(e) =>
                onChange({ ...field, autoRole: e.target.value as ChannelField["autoRole"] })
              }
            >
              <option value="none">Not auto — parent fills / selects</option>
              <option value="parent">Logged-in parent (auto-identified)</option>
              <option value="student">Select student (parent's children)</option>
              <option value="student_attr">Auto from selected student…</option>
            </select>
            {field.autoRole === "student_attr" && (
              <input
                className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                value={field.studentAttr || ""}
                onChange={(e) => onChange({ ...field, studentAttr: e.target.value })}
                placeholder="Student attribute key — e.g. grade, school, city"
              />
            )}
            {field.autoRole && field.autoRole !== "none" && (
              <p className="mt-1 text-[10px] text-emerald-600">
                Resolved from the parent's login + selected student — the parent does not type this.
              </p>
            )}
          </div>

          {field.autoRole !== "student_attr" &&
            (field.type === "search" ||
              field.type === "dropdown" ||
              field.autoRole === "parent" ||
              field.autoRole === "student") && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">Data source</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: "psr_table", l: "PSR Builder table",  d: "Fast — from synced MongoDB" },
                  { v: "mdm",       l: "MDM Master (live)",  d: "Calls the MDM API directly" },
                  { v: "category",  l: "Category Master",    d: "Cascading hierarchy levels" },
                  { v: "static",    l: "Static list",        d: "You define the options" },
                  { v: "none",      l: "Free text",          d: "Agent types freely" },
                ].map(ds => (
                  <label key={ds.v} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${field.dataSource === ds.v ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                    <input type="radio" name={`ds-${field.id}`} value={ds.v} checked={field.dataSource === ds.v} onChange={() => onChange({ ...field, dataSource: ds.v as ChannelField["dataSource"] })} className="mt-0.5 text-indigo-600" />
                    <span>{ds.l}<br /><span className="font-normal text-gray-400">{ds.d}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {field.dataSource === "psr_table" && (
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">PSR Builder table</p>
              <select className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                value={field.psrTableId || ""} onChange={e => onChange({ ...field, psrTableId: e.target.value || undefined, psrTableColumn: undefined })}>
                <option value="">— Select a table —</option>
                {tables.map(t => <option key={t._id} value={t._id}>{t.name}{t.rowCount ? ` · ${t.rowCount.toLocaleString()} rows` : ""}</option>)}
              </select>
              {!tables.length && <p className="text-[10px] text-indigo-500">No tables yet — go to Integrations → PSR Builder first.</p>}
              {selectedTable && field.type === "dropdown" && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Use column as options</p>
                  <select className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                    value={field.psrTableColumn || ""} onChange={e => onChange({ ...field, psrTableColumn: e.target.value || undefined })}>
                    <option value="">— All searchable columns —</option>
                    {selectedTable.columns?.map((c: any) => <option key={c.as} value={c.as}>{c.as}{c.searchable ? " 🔍" : ""}</option>)}
                  </select>
                </>
              )}

              {/* Self-service column mapping — tell us which master columns hold
                  the parent mobile, student name, grade, school, etc. */}
              {selectedTable &&
                (field.autoRole === "parent" || field.autoRole === "student") && (
                <div className="rounded-md border border-indigo-200 bg-white p-2.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                    Map master columns
                  </p>
                  {([
                    ["mobile", "Parent mobile (search key) *"],
                    ["parentName", "Parent first name"],
                    ["parentNameLast", "Parent last name"],
                    ["name", "Student first name"],
                    ["nameLast", "Student last name"],
                    ["grade", "Grade"],
                    ["school", "School"],
                    ["id", "Student ID"],
                    ["location", "Location / City"],
                  ] as const).map(([key, lbl]) => (
                    <div key={key} className="mb-1.5">
                      <label className="text-[10px] font-semibold text-gray-500">{lbl}</label>
                      <select
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
                        value={(field.studentCols as any)?.[key] || ""}
                        onChange={(e) =>
                          onChange({
                            ...field,
                            studentCols: {
                              ...(field.studentCols || {}),
                              [key]: e.target.value || undefined,
                            },
                          })
                        }
                      >
                        <option value="">— Select column —</option>
                        {selectedTable.columns?.map((c: any) => (
                          <option key={c.as} value={c.as}>{c.as}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-400">
                    We look up the parent by the mapped mobile column, then read
                    student name / grade / school from these columns.
                  </p>
                </div>
              )}
            </div>
          )}

          {field.dataSource === "static" && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Options (one per line)</p>
              <textarea className="w-full rounded-lg border border-gray-200 px-2.5 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none" rows={3}
                value={(field.staticOptions || []).join("\n")} onChange={e => onChange({ ...field, staticOptions: e.target.value.split("\n").filter(Boolean) })}
                placeholder={"Option A\nOption B\nOption C"} />
            </div>
          )}

          {field.dataSource === "mdm" && (
            <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-purple-700">MDM Master</p>
              <select
                className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
                value={field.mdmMasterId || ""}
                onChange={e => onChange({
                  ...field,
                  mdmMasterId: e.target.value || undefined,
                  mdmLabelField: undefined,
                  mdmValueField: undefined,
                  mdmDependsOnRemoteField: undefined,
                })}
              >
                <option value="">— Select a master —</option>
                {masters.map((m: Master) => (
                  <option key={m._id} value={m._id}>
                    {m.name}{m.discoveredColumns?.length ? ` · ${m.discoveredColumns.length} columns` : ""}
                  </option>
                ))}
              </select>
              {!masters.length && (
                <p className="text-[10px] text-purple-500">
                  No masters yet — go to Integrations → PSR Builder → Tab 1 to add one.
                </p>
              )}
              {field.mdmMasterId && (() => {
                const selectedMaster = masters.find((m: Master) => m._id === field.mdmMasterId);
                const cols = selectedMaster?.discoveredColumns || [];
                const columnsListId = `mdm-columns-${field.id}`;
                return (
                  <div className="space-y-3">
                    <datalist id={columnsListId}>
                      {cols.map((c: string) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-purple-700 mb-1">
                          Label field shown in dropdown
                        </p>
                        <input
                          list={columnsListId}
                          className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
                          value={field.mdmLabelField || ""}
                          onChange={e => onChange({ ...field, mdmLabelField: e.target.value || undefined })}
                          placeholder="e.g. academic_year_name"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-purple-700 mb-1">
                          Value/id field saved
                        </p>
                        <input
                          list={columnsListId}
                          className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
                          value={field.mdmValueField || ""}
                          onChange={e => onChange({ ...field, mdmValueField: e.target.value || undefined })}
                          placeholder="e.g. academic_year_id"
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-purple-100 bg-white/70 p-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-purple-700">
                        Dependent dropdown
                      </p>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <div>
                          <p className="mb-1 text-[10px] font-semibold text-purple-700">
                            Depends on previous field
                          </p>
                          <select
                            className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
                            value={field.mdmDependsOnField || ""}
                            onChange={e => onChange({ ...field, mdmDependsOnField: e.target.value || undefined })}
                          >
                            <option value="">No dependency</option>
                            {dependencyFields.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label} ({option.value})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-semibold text-purple-700">
                            Send value as API param
                          </p>
                          <input
                            className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
                            value={field.mdmDependsOnParam || ""}
                            onChange={e => onChange({ ...field, mdmDependsOnParam: e.target.value || undefined })}
                            placeholder="academic_year_id"
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-semibold text-purple-700">
                            Match response field
                          </p>
                          <input
                            list={columnsListId}
                            className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
                            value={field.mdmDependsOnRemoteField || ""}
                            onChange={e => onChange({ ...field, mdmDependsOnRemoteField: e.target.value || undefined })}
                            placeholder="e.g. academic_year_id"
                          />
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-purple-500">
                        Configure this when one dropdown should filter another. Select the previous field, enter the API parameter to send, and enter the response field to match.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_100px]">
                      <input
                        className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
                        value={field.mdmSearchParam || ""}
                        onChange={e => onChange({ ...field, mdmSearchParam: e.target.value || undefined })}
                        placeholder="Search param, e.g. q"
                      />
                      <input
                        type="number"
                        className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none"
                        value={field.mdmLimit || 100}
                        onChange={e => onChange({ ...field, mdmLimit: Number(e.target.value) || 100 })}
                        placeholder="Limit"
                      />
                    </div>
                    <p className="text-[10px] text-purple-500">
                      {cols.length
                        ? `Columns discovered from the last "Test" run on this master. You can also type a key manually.`
                        : `No columns discovered yet. You can type keys manually, or go to PSR Builder -> Tab 1 -> Edit this master -> Test to load suggestions.`}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {field.dataSource === "category" && (
            <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">Category Master</p>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700 mb-1">Category type</p>
                <select
                  className="w-full rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
                  value={field.categoryScope || "normal"}
                  onChange={e => onChange({ ...field, categoryScope: e.target.value as ChannelField["categoryScope"] })}
                >
                  <option value="normal">Normal ticket categories</option>
                  <option value="PSR">PSR categories</option>
                  <option value="ISR">ISR categories</option>
                </select>
                <p className="text-[10px] text-teal-500 mt-1">
                  Categories/sub-categories differ per type — the cascade shows only this type's tree.
                </p>
              </div>
              {hierLoading ? (
                <p className="text-xs text-teal-500">Loading hierarchy levels…</p>
              ) : hierConfig?.levels?.length ? (
                <>
                  <p className="text-[10px] text-teal-600">
                    Levels configured: {hierConfig.levels.map(l => l.displayName).join(" → ")}
                  </p>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700 mb-1">Show levels up to</p>
                    <select
                      className="w-full rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
                      value={field.categoryMaxLevel ?? ""}
                      onChange={e => onChange({ ...field, categoryMaxLevel: e.target.value ? Number(e.target.value) : undefined })}
                    >
                      <option value="">Full hierarchy ({hierConfig.levelCount} level{hierConfig.levelCount !== 1 ? "s" : ""})</option>
                      {hierConfig.levels.map(l => (
                        <option key={l.levelNumber} value={l.levelNumber}>
                          Level {l.levelNumber} — {l.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[10px] text-teal-500 mt-1">
                    ℹ️ One Category Master field is enough — it cascades through all levels automatically (Category → Subcategory → Topic…). Adding a second one will be ignored.
                  </p>
                </>
              ) : (
                <p className="text-xs text-teal-600">
                  Renders the project’s configured category hierarchy — cascading Level 1 → Level 2 → Topic…
                  Configure levels in Ticket Settings → Query Config.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── API / cURL field importer ────────────────────────────────────────────────

function ApiImport({ onImport }: { onImport: (fields: ChannelField[]) => void }) {
  const [open, setOpen] = useState(false);
  const [curl, setCurl] = useState("");
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<"none" | "bearer" | "apikey">("none");
  const [token, setToken] = useState("");
  const [responsePath, setResponsePath] = useState("");
  const [testing, setTesting] = useState(false);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [sample, setSample] = useState<any>(null);
  const [curlMsg, setCurlMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState("");

  const applyCurl = () => {
    try {
      const p = parseCurl(curl);
      setUrl(p.url);
      setAuthType(p.authType);
      setToken(p.token);
      setCurlMsg({ ok: true, text: "Filled ✓" + (p.notes.length ? " — " + p.notes[0] : "") });
    } catch (e: any) {
      setCurlMsg({ ok: false, text: e.message });
    }
  };

  const runTest = async () => {
    if (!url.trim()) { setError("Enter a URL first."); return; }
    setTesting(true); setDiscovered([]); setSample(null); setError("");
    try {
      const master: Partial<Master> = {
        name: "import_test", url: url.trim(), method: "GET",
        auth: authType === "bearer" ? { type: "bearer" as const, secretRef: token }
            : authType === "apikey" ? { type: "apikey" as const, secretRef: token, headerName: "X-API-Key" }
            : { type: "none" as const },
        headers: {}, responsePath: responsePath.trim(), primaryKey: "id",
        discoveredColumns: [],
      };
      const res = await testMaster(master);
      if (res.success && res.data.success) {
        setDiscovered(res.data.columns);
        setSample(res.data.sample?.[0] || null);
      } else {
        setError(res.success ? (res.data.error || "API returned an error — check URL and auth") : res.error);
      }
    } catch (e: any) { setError(e.message || "Request failed"); }
    finally { setTesting(false); }
  };

  const createAllFields = () => {
    if (!discovered.length) return;
    const fields: ChannelField[] = discovered.map(col => {
      const c = col.split(".").pop()!.toLowerCase();
      const type: ChannelField["type"] =
        c.includes("mobile") || c.includes("phone") ? "mobile" :
        c.includes("email") ? "email" :
        c.includes("date") || c.includes("dob") ? "date" :
        "text";
      const label = (col.split(".").pop() || col).replace(/[_-]/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      const required = ["name", "mobile", "phone", "first_name", "firstname"].some(k => c.includes(k));
      return { id: uid(), label, type, required, dataSource: "none" };
    });
    onImport(fields);
    setOpen(false); setCurl(""); setUrl(""); setToken(""); setDiscovered([]); setSample(null); setError("");
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-amber-800">
        <CommandLineIcon className="h-4 w-4 shrink-0" />
        Import fields from API / cURL
        {open ? <ChevronUpIcon className="ml-auto h-4 w-4" /> : <ChevronDownIcon className="ml-auto h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-amber-200 px-4 pb-4 pt-3 space-y-4">
          <p className="text-xs text-amber-700">
            Paste a cURL <em>or</em> enter an API URL → click <strong>Test & Discover</strong> →
            the system fetches one record, reads all the response fields, and creates form fields automatically.
          </p>

          {/* cURL */}
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Paste cURL (optional — fills URL + auth)</p>
            <textarea rows={3} value={curl} onChange={e => { setCurl(e.target.value); setCurlMsg(null); }}
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs focus:border-amber-500 focus:outline-none"
              placeholder={"curl 'https://api.example.com/v1/prospects' \\\n  -H 'Authorization: Bearer your-token-here'"} />
            <div className="mt-1.5 flex items-center gap-3">
              <button onClick={applyCurl} disabled={!curl.trim()}
                className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-40">
                Parse cURL
              </button>
              {curlMsg && (
                <span className={`flex items-center gap-1 text-xs ${curlMsg.ok ? "text-emerald-600" : "text-red-600"}`}>
                  {curlMsg.ok ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <ExclamationTriangleIcon className="h-3.5 w-3.5" />}
                  {curlMsg.text}
                </span>
              )}
            </div>
          </div>

          {/* URL + auth */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">API URL *</p>
              <input className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
                value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.example.com/v1/prospects" />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Auth</p>
              <select className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
                value={authType} onChange={e => setAuthType(e.target.value as any)}>
                <option value="none">None</option>
                <option value="bearer">Bearer</option>
                <option value="apikey">API Key</option>
              </select>
            </div>
          </div>

          {authType !== "none" && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Token / key (used for test only)</p>
              <input type="password" className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
                value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your token here" />
            </div>
          )}

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Response path <span className="font-normal text-gray-400">(dot-path to records array, e.g. data.results)</span></p>
            <input className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
              value={responsePath} onChange={e => setResponsePath(e.target.value)} placeholder="data  (leave blank to auto-detect)" />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={runTest} disabled={testing || !url.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
              <BeakerIcon className="h-3.5 w-3.5" />
              {testing ? "Fetching…" : "Test & Discover fields"}
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>

          {discovered.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700">
                  <CheckCircleIcon className="inline h-3.5 w-3.5 mr-1" />
                  {discovered.length} fields found
                </p>
                <button onClick={createAllFields}
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700">
                  ✓ Add all as form fields
                </button>
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {discovered.map(c => <span key={c} className="rounded border border-emerald-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-emerald-800">{c}</span>)}
              </div>
              {sample && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] text-emerald-600 hover:underline">Show sample record</summary>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-900 p-2 text-[10px] text-emerald-200 font-mono">{JSON.stringify(sample, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProspectCrmPanel({
  projectId,
  value,
  onChange,
  onCreateFieldsFromBody,
}: {
  projectId: string;
  value: LeadSyncConfig;
  onChange: (next: LeadSyncConfig) => void;
  onCreateFieldsFromBody: (fields: ChannelField[], bodyTemplate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [curl, setCurl] = useState("");
  const [curlMsg, setCurlMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [headersText, setHeadersText] = useState(
    JSON.stringify(value.headers || {}, null, 2),
  );
  const [headersError, setHeadersError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    text: string;
    detail?: string;
  } | null>(null);

  useEffect(() => {
    setHeadersText(JSON.stringify(value.headers || {}, null, 2));
  }, [value.headers]);

  const patch = (patchValue: Partial<LeadSyncConfig>) =>
    onChange({ ...value, ...patchValue });

  const applyCurl = () => {
    try {
      const parsed = parseCrmCurl(curl);
      patch({
        enabled: true,
        endpoint: parsed.endpoint,
        method: parsed.method,
        authHeaderName:
          parsed.authHeaderName || value.authHeaderName || "Authorization",
        authHeaderValue: parsed.authHeaderValue || value.authHeaderValue || "",
        headers: { ...(value.headers || {}), ...parsed.headers },
        bodyTemplate: parsed.bodyTemplate || value.bodyTemplate || "",
      });
      setCurlMsg({ ok: true, text: "Filled API, auth, headers and body from cURL." });
      setTestResult(null);
    } catch (e: any) {
      setCurlMsg({ ok: false, text: e?.message || "Could not parse cURL." });
    }
  };

  const commitHeaders = () => {
    try {
      const parsed = JSON.parse(headersText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Headers must be a JSON object.");
      }
      setHeadersError("");
      patch({ headers: parsed });
    } catch (e: any) {
      setHeadersError(e?.message || "Invalid headers JSON.");
    }
  };

  const runTest = async () => {
    if (!projectId || !value.endpoint) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await serviceRequestApi.testLeadCrmConfig(projectId, value);
      setTestResult({
        ok: true,
        text: `${res.message || "CRM API test succeeded."} HTTP ${res.status || ""}`.trim(),
        detail: res.response ? JSON.stringify(res.response, null, 2) : undefined,
      });
    } catch (e: any) {
      const data = e?.response?.data;
      setTestResult({
        ok: false,
        text:
          data?.message ||
          e?.message ||
          "CRM API test failed. Check endpoint, auth and request body.",
        detail: data?.response
          ? JSON.stringify(data.response, null, 2)
          : data?.error
            ? String(data.error)
            : undefined,
      });
    } finally {
      setTesting(false);
    }
  };

  const createFormFields = () => {
    try {
      const generated = generateProspectFieldsFromCrmBody(value.bodyTemplate || "");
      if (!generated.fields.length) {
        setTestResult({
          ok: false,
          text: "No form fields found in CRM body. Add a JSON body under data first.",
        });
        return;
      }
      onCreateFieldsFromBody(generated.fields, generated.bodyTemplate);
      setTestResult({
        ok: true,
        text: `${generated.fields.length} Prospect Parent fields created from CRM body.`,
      });
    } catch (e: any) {
      setTestResult({
        ok: false,
        text: e?.message || "CRM body must be valid JSON before fields can be created.",
      });
    }
  };

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/50">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-orange-800"
      >
        <CommandLineIcon className="h-4 w-4 shrink-0" />
        CRM sync API
        <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-orange-700">
          {value.enabled ? "Enabled" : "Off"}
        </span>
        {open ? <ChevronUpIcon className="ml-auto h-4 w-4" /> : <ChevronDownIcon className="ml-auto h-4 w-4" />}
      </button>

      {open && (
        <div className="space-y-4 border-t border-orange-200 px-4 pb-4 pt-3">
          <Toggle
            checked={value.enabled === true}
            onChange={(enabled) => patch({ enabled })}
            label="Push Prospect Parent lead to CRM after submit"
          />

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Paste CRM cURL
            </p>
            <textarea
              rows={3}
              value={curl}
              onChange={(e) => {
                setCurl(e.target.value);
                setCurlMsg(null);
              }}
              className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 font-mono text-xs focus:border-orange-500 focus:outline-none"
              placeholder="curl --location 'https://crm.example.com/leads' -H 'Authorization: Bearer ...' --data-raw '{...}'"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={applyCurl}
                disabled={!curl.trim()}
                className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-40"
              >
                Parse cURL
              </button>
              {curlMsg && (
                <span className={`flex items-center gap-1 text-xs ${curlMsg.ok ? "text-emerald-600" : "text-red-600"}`}>
                  {curlMsg.ok ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <ExclamationTriangleIcon className="h-3.5 w-3.5" />}
                  {curlMsg.text}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_1fr_130px]">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Method</p>
              <select
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                value={value.method || "POST"}
                onChange={(e) => patch({ method: e.target.value as any })}
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">CRM endpoint</p>
              <input
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                value={value.endpoint || ""}
                onChange={(e) => patch({ endpoint: e.target.value })}
                placeholder="https://crm.example.com/api/leads"
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Timeout ms</p>
              <input
                type="number"
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                value={value.timeoutMs || 30000}
                onChange={(e) => patch({ timeoutMs: Number(e.target.value) || 30000 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr]">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Auth header</p>
              <input
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                value={value.authHeaderName || ""}
                onChange={(e) => patch({ authHeaderName: e.target.value })}
                placeholder="Authorization"
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Auth value</p>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                value={value.authHeaderValue || ""}
                onChange={(e) => patch({ authHeaderValue: e.target.value })}
                placeholder="Bearer token-or-api-key"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Additional headers JSON</p>
            <textarea
              rows={3}
              value={headersText}
              onChange={(e) => {
                setHeadersText(e.target.value);
                setHeadersError("");
              }}
              onBlur={commitHeaders}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 font-mono text-xs focus:border-orange-500 focus:outline-none"
              placeholder='{"Content-Type":"application/json"}'
            />
            {headersError && <p className="mt-1 text-xs text-red-600">{headersError}</p>}
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Request body JSON</p>
            <textarea
              rows={8}
              value={value.bodyTemplate || ""}
              onChange={(e) => patch({ bodyTemplate: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 font-mono text-xs leading-relaxed focus:border-orange-500 focus:outline-none"
              placeholder='{"data":{"parent_details":{"father_details":{"email":"{{lead.email}}"}}}}'
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Use placeholders like {"{{lead.email}}"}, {"{{lead.contactNumber}}"}, {"{{lead.firstName}}"}, {"{{lead.grade}}"} and {"{{now}}"}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={createFormFields}
              disabled={!value.bodyTemplate}
              className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-40"
            >
              <CommandLineIcon className="h-3.5 w-3.5" />
              Create form from CRM body
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !value.endpoint}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <BeakerIcon className="h-3.5 w-3.5" />
              {testing ? "Testing..." : "Test CRM API"}
            </button>
            <span className="text-xs text-gray-500">
              Sends a sample Prospect Parent lead from backend using this config.
            </span>
          </div>

          {testResult && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${testResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              <strong>{testResult.text}</strong>
              {testResult.detail && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                  {testResult.detail}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Channel section ──────────────────────────────────────────────────────────

const ADD_BUTTONS = [
  { type: "search",   icon: "🔍", label: "Search" },
  { type: "dropdown", icon: "▾",  label: "Dropdown" },
  { type: "text",     icon: "T",  label: "Text" },
  { type: "textarea", icon: "¶",  label: "Textarea" },
  { type: "mobile",   icon: "📱", label: "Mobile" },
  { type: "email",    icon: "✉",  label: "Email" },
  { type: "date",     icon: "📅", label: "Date" },
] as const;

function ChannelSection({ title, icon, desc, config, tables, masters, projectId, onChange, showApiImport=false, crmPanel }: {
  title: string; icon: string; desc: string; config: ChannelConfig; tables: any[]; masters: Master[]; projectId: string;
  onChange: (c: ChannelConfig) => void; showApiImport?: boolean; crmPanel?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const addField = (type: ChannelField["type"]) =>
    onChange({ ...config, fields: [...config.fields, mkField("New field", type)] });
  const updateField = (i: number, f: ChannelField) => {
    const fields = [...config.fields]; fields[i] = f; onChange({ ...config, fields });
  };
  const deleteField = (i: number) => onChange({ ...config, fields: config.fields.filter((_,j)=>j!==i) });
  const handleDragEnd = (result: any) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const fields = [...config.fields];
    const [moved] = fields.splice(result.source.index, 1);
    fields.splice(result.destination.index, 0, moved);
    onChange({ ...config, fields });
  };

  return (
    <div className={`rounded-xl border-2 overflow-hidden bg-white transition-all ${config.enabled ? "border-indigo-300" : "border-gray-200"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl leading-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800">{title}</p>
          <p className="text-[10px] text-gray-400">{config.junkMode ? "No form — interaction archived as junk" : desc}</p>
        </div>
        <Toggle checked={config.enabled} onChange={v => { onChange({ ...config, enabled: v }); if (v && !config.junkMode) setOpen(true); if (!v) setOpen(false); }} label={config.enabled ? "On" : "Off"} />
        {config.enabled && !config.junkMode && (
          <button onClick={() => setOpen(o=>!o)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            {open ? <ChevronUpIcon className="h-4 w-4" /> : <Cog6ToothIcon className="h-4 w-4" />}
          </button>
        )}
      </div>

      {config.enabled && open && !config.junkMode && (
        <div className="border-t border-gray-100 bg-indigo-50/20 px-4 py-4 space-y-3">
          {showApiImport && <ApiImport onImport={fields => onChange({ ...config, fields })} />}
          {crmPanel}

          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Form fields <span className="font-normal normal-case tracking-normal text-gray-300">· drag ⠿ to reorder</span>
          </p>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="student-portal-fields">
              {(dropProv: any) => (
                <div ref={dropProv.innerRef} {...dropProv.droppableProps} className="space-y-3">
                  {config.fields.map((f, i) => (
                    <Draggable key={f.id} draggableId={f.id} index={i}>
                      {(prov: any, snap: any) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          style={prov.draggableProps.style}
                          className={`flex items-start gap-1.5 ${snap.isDragging ? "opacity-90" : ""}`}
                        >
                          <span
                            {...prov.dragHandleProps}
                            title="Drag to reorder"
                            className="mt-3 shrink-0 cursor-grab select-none rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-indigo-500 active:cursor-grabbing"
                            style={{ lineHeight: 1, fontSize: 16 }}
                          >
                            ⠿
                          </span>
                          <div className="min-w-0 flex-1">
                            <FieldRow
                              field={f}
                              fields={config.fields}
                              tables={tables}
                              masters={masters}
                              projectId={projectId}
                              onChange={updated => updateField(i, updated)}
                              onDelete={() => deleteField(i)}
                              canDelete={config.fields.length > 1} />
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {dropProv.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {ADD_BUTTONS.map(({ type, icon: ic, label }) => (
              <button key={type} onClick={() => addField(type)}
                className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600">
                <PlusIcon className="h-3 w-3" /> {ic} {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SRSettingsNew: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [backendCfg, setBackendCfg] = useState<any>(null);
  const [cfg, setCfg] = useState<SimpleConfig>({
    psrEnabled: false, isrEnabled: false,
    numbering: {
      PSR: {
        prefix: "PSR",
        format: "{PREFIX}-{YYYY}-{NNNN}",
        resetPeriod: "yearly",
        startingNumber: 1,
      },
      ISR: {
        prefix: "ISR",
        format: "{PREFIX}-{YYYY}-{NNNN}",
        resetPeriod: "yearly",
        startingNumber: 1,
      },
    },
    messages: { duplicate: "", closureDefault: "", responseDefault: "" },
    feedback: {
      notifyManagerOnNegative: false,
      ratingThreshold: 2,
      notifyUserId: "",
      notifyRoleId: "",
    },
    emailJunkSenders: "",
    crm: {
      leadSync: {
        enabled: false,
        endpoint: "",
        method: "POST",
        timeoutMs: 30000,
        authHeaderName: "",
        authHeaderValue: "",
        headers: {},
        bodyTemplate: "",
      },
    },
    existingParent: { enabled: true,  fields: DEFAULT_EXISTING.map(f=>({...f,id:uid()})) },
    prospectParent: { enabled: true,  fields: [] },
    junk:   { enabled: true,  fields: [], junkMode: true },
    vendor: { enabled: false, fields: [mkField("Company name","text",true), mkField("Contact email","email")] },
    job:    { enabled: false, fields: [mkField("Candidate name","text",true), mkField("Position","text"), mkField("Mobile","mobile")] },
    others: { enabled: true,  fields: [mkField("Subject","text",true), mkField("Details","text")] },
    studentPortal: { enabled: true, fields: [
      { id: uid(), label: "Category",    type: "dropdown" as const, required: false, dataSource: "category" as const },
      mkField("Subject",     "text",     true),
      mkField("Description", "textarea",  false),
    ]},
    isr: { enabled: true, fields: [
      { id: uid(), label: "Category",    type: "dropdown" as const, required: true, dataSource: "category" as const },
      mkField("Subject",     "text",     true),
      mkField("Description", "textarea",  false),
    ]},
  });
  const [tables, setTables] = useState<any[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [forms, setForms] = useState<SrFormSchema[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [managerUsers, setManagerUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      serviceRequestApi.getConfig(projectId),
      listTables(),
      listMasters(),
      serviceRequestApi.listForms(projectId),
      api.get("/roles", { params: { projectId } }).catch(() => ({ data: {} })),
      api
        .get("/users", { params: { project: projectId, isActive: true, limit: 1000 } })
        .catch(() => ({ data: {} })),
    ])
      .then(([r, t, m, f, rr, ur]) => {
        const formList = f?.data || f?.forms || f || [];
        const safeForms = Array.isArray(formList) ? formList : [];
        setBackendCfg(r.data||{});
        setForms(safeForms);
        setCfg(fromBackend(r.data||{}, safeForms));
        if (t.success) setTables(t.data);
        if (m.success) setMasters(m.data);
        setRoles((rr as any).data?.data || []);
        setManagerUsers((ur as any).data?.data || []);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const prospectForm = forms.find(isProspectParentSchema) || null;
  const buildProspectFormSchema = (): SrFormSchema => ({
    id: prospectForm?.id || prospectForm?._id,
    name: prospectForm?.name || "Prospect Parent CRM Lead Form",
    interactionType: "PSR",
    channel: "prospect_parent",
    isActive: true,
    fields: cfg.prospectParent.fields
      .filter((field) => field.type !== "search")
      .map(channelFieldToSchemaField),
  });

  const save = async () => {
    if (!projectId) return;
    setSaving(true); setMsg(null);
    try {
      await serviceRequestApi.updateConfig(projectId, toBackendPatch(cfg, backendCfg));
      const prospectSchema = buildProspectFormSchema();
      if (prospectSchema.fields.length > 0) {
        const saved = await serviceRequestApi.saveForm(projectId, prospectSchema);
        const savedSchema = saved.data || prospectSchema;
        setForms((prev) => [
          savedSchema,
          ...prev.filter(
            (form) =>
              String(form._id || form.id || "") !==
                String(savedSchema._id || savedSchema.id || "") &&
              !(
                form.interactionType === "PSR" &&
                form.channel === "prospect_parent"
              ),
          ),
        ]);
      }
      setMsg({ ok: true, text: "Saved existing SR config ✓" });
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || "Save failed" }); }
    finally { setSaving(false); }
  };

  if (!projectId) return <div className="py-12 text-center text-sm text-gray-400">Select a project above to configure.</div>;
  if (loading) return <div className="py-8 text-center text-sm text-gray-400">Loading…</div>;

  const set = <K extends keyof SimpleConfig>(k: K) => (v: SimpleConfig[K]) => setCfg(c => ({ ...c, [k]: v }));
  const setNumbering =
    (type: "PSR" | "ISR", key: keyof SrNumberingConfig) =>
    (value: string | number) =>
      setCfg((current) => ({
        ...current,
        numbering: {
          ...current.numbering,
          [type]: {
            ...current.numbering[type],
            [key]: key === "startingNumber" ? Number(value) || 1 : value,
          },
        },
      }));

  return (
    <div className="max-w-2xl space-y-5 px-4 py-5">

      {/* Step 1 */}
      <Card>
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-sm font-bold text-gray-800">Step 1 — Enable ticket types</p>
          <p className="text-xs text-gray-500">Which service request types are active for this project?</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Toggle checked={cfg.psrEnabled} onChange={set("psrEnabled")} label="PSR — Parent Service Request (parent / student enquiries)" />
          <Toggle checked={cfg.isrEnabled} onChange={set("isrEnabled")} label="ISR — Internal Service Request (vendor, HR, admin, etc.)" />
        </div>
      </Card>

      <Card>
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-sm font-bold text-gray-800">Ticket numbering</p>
          <p className="text-xs text-gray-500">
            Configure separate numbers for Parent Service Requests and Internal Service Requests.
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          {(["PSR", "ISR"] as const).map((type) => (
            <div key={type} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-800">{type} numbering</p>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-gray-500">
                  Example: {cfg.numbering[type].format.replace("{PREFIX}", cfg.numbering[type].prefix).replace("{YYYY}", "2026").replace("{MM}", "07").replace("{DD}", "08").replace("{NNNN}", "0001")}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-gray-600">
                  Prefix
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={cfg.numbering[type].prefix}
                    onChange={(event) => setNumbering(type, "prefix")(event.target.value)}
                    placeholder={type}
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Starting number
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={cfg.numbering[type].startingNumber}
                    onChange={(event) => setNumbering(type, "startingNumber")(event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600 sm:col-span-2">
                  Format
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={cfg.numbering[type].format}
                    onChange={(event) => setNumbering(type, "format")(event.target.value)}
                    placeholder="{PREFIX}-{YYYY}-{NNNN}"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Reset period
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={cfg.numbering[type].resetPeriod}
                    onChange={(event) => setNumbering(type, "resetPeriod")(event.target.value)}
                  >
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="never">Never</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Editable messages — duplicate / closure / response */}
      <Card>
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-sm font-bold text-gray-800">Messages</p>
          <p className="text-xs text-gray-500">
            Editable text shown to staff / parents. Leave blank to use the system default.
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="block text-xs font-semibold text-gray-600">
            Duplicate request warning
            <textarea
              rows={2}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              value={cfg.messages.duplicate}
              onChange={(e) =>
                setCfg((c) => ({ ...c, messages: { ...c.messages, duplicate: e.target.value } }))
              }
              placeholder="Shown when a similar request already exists…"
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Default closure remark
            <textarea
              rows={2}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              value={cfg.messages.closureDefault}
              onChange={(e) =>
                setCfg((c) => ({ ...c, messages: { ...c.messages, closureDefault: e.target.value } }))
              }
              placeholder="Pre-filled remark when an SR is closed…"
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Default response / resolved remark
            <textarea
              rows={2}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              value={cfg.messages.responseDefault}
              onChange={(e) =>
                setCfg((c) => ({ ...c, messages: { ...c.messages, responseDefault: e.target.value } }))
              }
              placeholder="Pre-filled remark when an SR is resolved…"
            />
          </label>
        </div>
      </Card>

      {/* Not-happy escalation (#10) */}
      <Card>
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-800">Not-happy escalation</p>
            <p className="text-xs text-gray-500">
              Notify a manager when a parent closes unsatisfied or rates low, and
              the request is not re-opened.
            </p>
          </div>
          <Toggle
            checked={cfg.feedback.notifyManagerOnNegative}
            onChange={(v) =>
              setCfg((c) => ({
                ...c,
                feedback: { ...c.feedback, notifyManagerOnNegative: v },
              }))
            }
            label=""
          />
        </div>
        {cfg.feedback.notifyManagerOnNegative && (
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
            <label className="text-xs font-semibold text-gray-600">
              Rating threshold (≤)
              <input
                type="number"
                min={1}
                max={5}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
                value={cfg.feedback.ratingThreshold}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    feedback: {
                      ...c.feedback,
                      ratingThreshold: Number(e.target.value) || 2,
                    },
                  }))
                }
              />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Notify user
              <select
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
                value={cfg.feedback.notifyUserId}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    feedback: {
                      ...c.feedback,
                      notifyUserId: e.target.value,
                      notifyRoleId: e.target.value ? "" : c.feedback.notifyRoleId,
                    },
                  }))
                }
              >
                <option value="">None</option>
                {managerUsers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">
              or Notify role
              <select
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
                value={cfg.feedback.notifyRoleId}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    feedback: {
                      ...c.feedback,
                      notifyRoleId: e.target.value,
                      notifyUserId: e.target.value ? "" : c.feedback.notifyUserId,
                    },
                  }))
                }
              >
                <option value="">None</option>
                {roles.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name || r.code}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </Card>

      {/* Permanent junk senders (#11) */}
      <Card>
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-sm font-bold text-gray-800">Permanent junk senders</p>
          <p className="text-xs text-gray-500">
            Inbound email from these addresses is auto-marked junk on arrival and
            kept out of the triage inbox. One address per line.
          </p>
        </div>
        <div className="px-5 py-4">
          <textarea
            rows={4}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
            value={cfg.emailJunkSenders}
            onChange={(e) =>
              setCfg((c) => ({ ...c, emailJunkSenders: e.target.value }))
            }
            placeholder={"spam@example.com\nnoreply@marketing.co"}
          />
        </div>
      </Card>

      {/* PSR channels */}
      {cfg.psrEnabled && (
        <>
          <div className="flex items-center gap-2 px-1">
            <span className="h-px flex-1 bg-gray-200" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Step 2 — PSR channels &amp; form fields</p>
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <p className="text-xs text-gray-500 px-1">
            Each channel can be enabled or disabled. Expand (⚙) to configure the form fields agents fill in.
            <br />For <strong>Prospect Parent</strong>, use "Import from API" to auto-discover fields from your CRM or data source.
          </p>

          <ChannelSection title="Existing Parent" icon="👪"
            desc="Parent already registered — agent searches and links them"
            config={cfg.existingParent} tables={tables} masters={masters} projectId={projectId} onChange={set("existingParent")} />

          <ChannelSection title="Prospect Parent" icon="🌱"
            desc="New / prospective parent — agent captures their details"
            config={cfg.prospectParent} tables={tables} masters={masters} projectId={projectId} onChange={set("prospectParent")} showApiImport
            crmPanel={
              <ProspectCrmPanel
                projectId={projectId}
                value={cfg.crm.leadSync}
                onChange={(leadSync) =>
                  setCfg((current) => ({
                    ...current,
                    crm: { ...current.crm, leadSync },
                  }))
                }
                onCreateFieldsFromBody={(fields, bodyTemplate) =>
                  setCfg((current) => ({
                    ...current,
                    prospectParent: { ...current.prospectParent, fields },
                    crm: {
                      ...current.crm,
                      leadSync: {
                        ...current.crm.leadSync,
                        bodyTemplate,
                      },
                    },
                  }))
                }
              />
            } />

          <ChannelSection title="Junk / Telemarketing" icon="🗑"
            desc="Spam or wrong number — archived automatically, no form needed"
            config={cfg.junk} tables={tables} masters={masters} projectId={projectId} onChange={set("junk")} />

          <ChannelSection title="Vendor / Business" icon="📦"
            desc="Supplies, licensing or services — routes to Procurement"
            config={cfg.vendor} tables={tables} masters={masters} projectId={projectId} onChange={set("vendor")} />

          <ChannelSection title="Job Application" icon="💼"
            desc="Careers or teaching openings — routes to HR"
            config={cfg.job} tables={tables} masters={masters} projectId={projectId} onChange={set("job")} />

          <ChannelSection title="Others / General" icon="🗂"
            desc="General feedback or questions — standard service request"
            config={cfg.others} tables={tables} masters={masters} projectId={projectId} onChange={set("others")} />
        </>
      )}

      {cfg.isrEnabled && (
        <>
          <div className="flex items-center gap-2 px-1">
            <span className="h-px flex-1 bg-gray-200" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">ISR</p>
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <p className="text-xs text-gray-500 px-1">
            The internal service request form staff fill when raising an ISR
            (procurement, HR, admin, etc.). Supports Category Master, dropdowns,
            text, textarea, mobile, email, date.
          </p>
          <ChannelSection title="Internal Service Request (ISR) Form" icon="🏢"
            desc="Staff fill this to raise an internal service request"
            config={cfg.isr} tables={tables} masters={masters} projectId={projectId} onChange={set("isr")} />
        </>
      )}

      {/* Student Portal online form */}
      <div className="flex items-center gap-2 px-1">
        <span className="h-px flex-1 bg-gray-200" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Student Portal</p>
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <p className="text-xs text-gray-500 px-1">
        These fields appear on the self-service portal (/portal/service-requests). They replace the old static online form.
        Supports: Category Master (cascading levels), static dropdowns, text, textarea, mobile, email, date.
      </p>
      <ChannelSection title="Student / Parent Self-Service Form" icon="🎓"
        desc="Student or parent fills this form directly on the portal URL"
        config={cfg.studentPortal} tables={tables} masters={masters} projectId={projectId} onChange={set("studentPortal")} />

      {/* Phone preview: docked to the right whitespace on wide screens, inline below the form otherwise. */}
      {cfg.studentPortal.enabled && (
        <div className="mt-4 xl:mt-0 xl:fixed xl:right-6 xl:top-24 xl:z-10 xl:w-[360px] xl:max-h-[calc(100vh-140px)] xl:overflow-auto">
          <PortalMobilePreview fields={cfg.studentPortal.fields} projectId={projectId} />
        </div>
      )}

      {/* Save bar */}
      <div className="sticky bottom-0 flex items-center gap-4 -mx-4 border-t border-gray-100 bg-white/90 px-4 py-3 backdrop-blur">
        <button onClick={save} disabled={saving || !projectId}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
          {saving ? "Saving…" : "Save settings"}
        </button>
        {msg && (
          <span className={`flex items-center gap-1.5 text-sm font-medium ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
            {msg.ok ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
};

export default SRSettingsNew;
