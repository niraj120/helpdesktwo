import React, { useEffect, useState, useCallback } from "react";
import {
  XMarkIcon,
  CommandLineIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  BeakerIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import DashboardLayout from "../../components/DashboardLayout";
import ModuleHeader from "../../components/ModuleHeader";
import {
  Pipeline,
  PsrSource,
  PsrStep,
  LookupStep,
  SyncRun,
  TestSourceResult,
  listPipelines,
  getPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  clonePipeline,
  testSource,
  dryRunPipeline,
  triggerRun,
  listRuns,
  getRun,
} from "../../services/psrPipelineService";

// ---------------------------------------------------------------------------
// PSR Pipelines Page
// Route: /integrations/psr-pipelines
// Implements: E1 (source registry), E2 (pipeline builder), E3 minimal,
//             E4.1 (search config), E5.1 (run logs)
// ---------------------------------------------------------------------------

// ─── Blank defaults ──────────────────────────────────────────────────────────

const blankSource = (): Omit<PsrSource, "discoveredColumns"> & {
  discoveredColumns: string[];
} => ({
  key: "",
  name: "",
  method: "GET",
  baseUrl: "",
  path: "",
  requestBody: "",
  auth: { type: "none" },
  pagination: { type: "none" },
  responsePath: "",
  primaryKey: "id",
  bulkLookup: { supported: false },
  discoveredColumns: [],
});

// ─── Small UI primitives ─────────────────────────────────────────────────────

const Badge = ({ label, color }: { label: string; color: string }) => (
  <span
    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}
  >
    {label}
  </span>
);

const statusColor: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  partial: "bg-yellow-100 text-yellow-800",
  running: "bg-blue-100 text-blue-800",
  pending: "bg-slate-100 text-slate-600",
};

const fmtDuration = (ms?: number) => {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString() : "—");

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type ActiveTab =
  | "pipelines"
  | "sources"
  | "builder"
  | "output"
  | "schedule"
  | "runs";

const TAB_LABELS: Record<ActiveTab, string> = {
  pipelines: "Pipelines",
  sources: "API Sources",
  builder: "Step Builder",
  output: "Output & Indexes",
  schedule: "Schedule",
  runs: "Run History",
};

// ─── cURL parser (mirrors MDMConfigModal logic) ───────────────────────────────

function splitCurlArgs(input: string): string[] {
  const s = input.replace(/\\\r?\n/g, " ");
  const out: string[] = [];
  let cur = "";
  let q: "" | "'" | '"' = "";
  let started = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = "";
      else cur += c;
      started = true;
    } else if (c === "'" || c === '"') { q = c; started = true; }
    else if (/\s/.test(c)) {
      if (started) { out.push(cur); cur = ""; started = false; }
    } else { cur += c; started = true; }
  }
  if (started) out.push(cur);
  return out;
}

interface ParsedCurlResult {
  method: "GET" | "POST";
  baseUrl: string;
  path: string;
  authType: "none" | "bearer" | "apikey" | "basic";
  secretRef: string;
  headerName: string;
  username: string;
  extraHeaders: Record<string, string>;
  body: string;
  notes: string[];
}

function parseCurlCommand(raw: string): ParsedCurlResult {
  const toks = splitCurlArgs(raw.trim());
  if (toks[0] === "curl") toks.shift();
  if (!toks.length) throw new Error("Nothing to parse.");

  let method = ""; let url = ""; let user = ""; let body = "";
  const headers: Array<[string, string]> = [];
  const notes: string[] = [];
  const valFlags = new Set(["-X","--request","-H","--header","-u","--user","-d","--data","--data-raw","--data-binary","--url"]);

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "-X" || t === "--request") method = (toks[++i] || "").toUpperCase();
    else if (t === "-H" || t === "--header") {
      const h = toks[++i] || "";
      const ci = h.indexOf(":");
      if (ci > 0) headers.push([h.slice(0, ci).trim(), h.slice(ci + 1).trim()]);
    } else if (t === "-u" || t === "--user") user = toks[++i] || "";
    else if (["-d","--data","--data-raw","--data-binary"].includes(t)) body = toks[++i] || "";
    else if (t === "--url") url = toks[++i] || "";
    else if (t.startsWith("-")) { if (valFlags.has(t)) i++; }
    else if (!url) url = t;
  }

  if (!url) throw new Error("No URL found in the curl command.");

  let baseUrl = url; let path = "";
  try {
    const u = new URL(url);
    baseUrl = u.origin;
    path = u.pathname + (u.search || "");
  } catch {
    const m = url.match(/^(https?:\/\/[^/]+)(.*)$/i);
    if (m) { baseUrl = m[1]; path = m[2]; }
  }

  let authType: ParsedCurlResult["authType"] = "none";
  let secretRef = ""; let headerName = "X-API-Key"; let username = "";
  const extraHeaders: Record<string, string> = {};

  for (const [k, v] of headers) {
    if (/^authorization$/i.test(k)) {
      const bearer = v.match(/^Bearer\s+(.+)$/i);
      const basic = v.match(/^Basic\s+(.+)$/i);
      if (bearer) {
        authType = "bearer";
        secretRef = `env:BEARER_TOKEN`;
        notes.push(`Bearer token detected — store it as env var and set secretRef to "env:YOUR_VAR_NAME".`);
      } else if (basic) {
        authType = "basic";
        notes.push("Basic auth detected — set username and store password as secretRef.");
      } else extraHeaders[k] = v;
    } else if (/api[-_ ]?key/i.test(k)) {
      authType = "apikey"; headerName = k;
      secretRef = `env:API_KEY`;
      notes.push(`API key detected in header "${k}" — store value as env var and set secretRef.`);
    } else if (!/^content-type$/i.test(k)) {
      extraHeaders[k] = v;
    }
  }

  if (user) {
    const ci = user.indexOf(":");
    authType = "basic";
    username = ci < 0 ? user : user.slice(0, ci);
    secretRef = `env:BASIC_PASSWORD`;
    notes.push("Basic auth -u detected — set username above and store password as secretRef.");
  }

  const m: "GET" | "POST" = method === "POST" || (!method && body) ? "POST" : "GET";
  if (method && method !== "GET" && method !== "POST")
    notes.push(`Method ${method} mapped to ${m}.`);

  return { method: m, baseUrl, path, authType, secretRef, headerName, username, extraHeaders, body, notes };
}

// ─── Input + label primitives matching portal style ──────────────────────────

const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="mb-1 block text-xs font-semibold text-gray-600">
    {children}{required && <span className="ml-0.5 text-red-500">*</span>}
  </label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 ${props.className || ""}`}
  />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${props.className || ""}`}
  />
);

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
    {children}
  </div>
);

// ─── Source Editor modal ─────────────────────────────────────────────────────

function SourceModal({
  initial,
  existingKeys,
  onSave,
  onClose,
}: {
  initial?: PsrSource | null;
  existingKeys: string[];
  onSave: (s: PsrSource) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<PsrSource>(
    initial ?? (blankSource() as PsrSource),
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestSourceResult | null>(null);
  const [error, setError] = useState("");
  const [curlOpen, setCurlOpen] = useState(false);
  const [curlText, setCurlText] = useState("");
  const [curlMsg, setCurlMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (partial: Partial<PsrSource>) =>
    setForm((f) => ({ ...f, ...partial }));

  // ── cURL import ────────────────────────────────────────────────────────────
  const applyCurl = () => {
    try {
      const p = parseCurlCommand(curlText);
      set({
        method: p.method,
        baseUrl: p.baseUrl,
        path: p.path,
        ...(p.body ? { requestBody: p.body } : {}),
        auth: {
          ...form.auth,
          type: p.authType,
          secretRef: p.secretRef || form.auth.secretRef,
          headerName: p.headerName || form.auth.headerName,
          username: p.username || form.auth.username,
          extraHeaders: { ...(form.auth.extraHeaders || {}), ...p.extraHeaders },
        },
      });
      setCurlMsg({
        ok: true,
        text: ["Imported ✓ — URL, method and auth filled.", ...p.notes].join(" "),
      });
    } catch (e: any) {
      setCurlMsg({ ok: false, text: e?.message || "Could not parse curl." });
    }
  };

  // Build an example curl from current form state for copy
  const buildExampleCurl = (): string => {
    const url = `${(form.baseUrl || "").replace(/\/$/, "")}${form.path || ""}`;
    const parts = [`curl -X ${form.method || "GET"} '${url || "<URL>"}'`];
    const a = form.auth;
    if (a.type === "bearer") parts.push(`  -H 'Authorization: Bearer <TOKEN>'`);
    else if (a.type === "apikey") parts.push(`  -H '${a.headerName || "X-API-Key"}: <API_KEY>'`);
    else if (a.type === "basic") parts.push(`  -u '${a.username || "<USER>"}:<PASSWORD>'`);
    for (const [k, v] of Object.entries(a.extraHeaders || {})) {
      if (k) parts.push(`  -H '${k}: ${v}'`);
    }
    if (form.method === "POST") {
      parts.push(`  -H 'Content-Type: application/json'`);
      parts.push(`  -d '${form.requestBody || "{}"}'`);
    }
    return parts.join(" \\\n");
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError("");
    const res = await testSource(form);
    setTesting(false);
    if (res.success) {
      // Always render the result in the Test section — even on 4xx from the
      // external API (e.g. 403 = add auth token, 404 = wrong path).
      setTestResult(res.data);
      if (res.data.success && res.data.columns.length) {
        set({ discoveredColumns: res.data.columns });
      }
    } else {
      // Network / server error — show in banner
      setError(res.error || "Test request failed");
    }
  };

  const handleSave = () => {
    if (!form.key.trim()) { setError("Admin key is required"); return; }
    if (!/^[a-z][a-z0-9_]*$/.test(form.key)) { setError("Key must match ^[a-z][a-z0-9_]*$"); return; }
    if (!isEdit && existingKeys.includes(form.key)) { setError(`Key "${form.key}" is already used`); return; }
    if (!form.name.trim()) { setError("Display name is required"); return; }
    if (!form.baseUrl.trim()) { setError("Base URL is required"); return; }
    setError("");
    onSave(form);
  };

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(buildExampleCurl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* blocked */ }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {isEdit ? "Edit API Source" : "Add API Source"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isEdit ? "Update the connection details for this source." : "Register an external REST endpoint to pull data from."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── Import from cURL ── */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60">
            <button
              type="button"
              onClick={() => setCurlOpen((o) => !o)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50/80"
            >
              <CommandLineIcon className="h-4 w-4 shrink-0" />
              Import from cURL
              {curlOpen
                ? <ChevronUpIcon className="ml-auto h-4 w-4" />
                : <ChevronDownIcon className="ml-auto h-4 w-4" />}
            </button>
            {curlOpen && (
              <div className="border-t border-indigo-200 px-4 pb-4 pt-3 space-y-3">
                <p className="text-xs text-indigo-600">
                  Paste a curl command — URL, method, headers, and auth will be auto-filled.
                  Secrets are never stored raw; a placeholder <code className="rounded bg-indigo-100 px-1">env:VAR_NAME</code> will be suggested.
                </p>
                <textarea
                  rows={4}
                  value={curlText}
                  onChange={(e) => { setCurlText(e.target.value); setCurlMsg(null); }}
                  className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 font-mono text-xs text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder={`curl -X GET 'https://api.example.com/v1/parents' \\\n  -H 'X-API-Key: your-key-here'`}
                />
                {curlMsg && (
                  <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${curlMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                    {curlMsg.ok
                      ? <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      : <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    {curlMsg.text}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={applyCurl}
                    disabled={!curlText.trim()}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCurlText(""); setCurlMsg(null); }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Identity ── */}
          <SectionCard title="Identity">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Admin Key</FieldLabel>
                <Input
                  value={form.key}
                  onChange={(e) => set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                  placeholder="s1"
                  disabled={isEdit}
                />
                <p className="mt-1 text-[10px] text-gray-400">Unique handle used in steps — ^[a-z][a-z0-9_]*$</p>
              </div>
              <div>
                <FieldLabel required>Display Name</FieldLabel>
                <Input
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="e.g. Parent Directory"
                />
              </div>
            </div>
          </SectionCard>

          {/* ── Endpoint ── */}
          <SectionCard title="Endpoint">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="col-span-2">
                <FieldLabel required>Base URL</FieldLabel>
                <Input
                  value={form.baseUrl}
                  onChange={(e) => set({ baseUrl: e.target.value.trim() })}
                  placeholder="https://api.example.com"
                />
              </div>
              <div>
                <FieldLabel>Path</FieldLabel>
                <Input
                  value={form.path || ""}
                  onChange={(e) => set({ path: e.target.value })}
                  placeholder="/v1/parents"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Method</FieldLabel>
                <Select value={form.method} onChange={(e) => set({ method: e.target.value as "GET" | "POST" })}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </Select>
              </div>
              <div>
                <FieldLabel>Primary Key Field</FieldLabel>
                <Input
                  value={form.primaryKey}
                  onChange={(e) => set({ primaryKey: e.target.value })}
                  placeholder="id"
                />
              </div>
            </div>
            <div className="mt-3">
              <FieldLabel>Response Path <span className="font-normal text-gray-400">(dot-notation to the rows array)</span></FieldLabel>
              <Input
                value={form.responsePath}
                onChange={(e) => set({ responsePath: e.target.value })}
                placeholder="data.results"
              />
            </div>
            {form.method === "POST" && (
              <div className="mt-3">
                <FieldLabel>Request Body (JSON)</FieldLabel>
                <textarea
                  rows={3}
                  value={form.requestBody || ""}
                  onChange={(e) => set({ requestBody: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="{}"
                />
              </div>
            )}
          </SectionCard>

          {/* ── Authentication ── */}
          <SectionCard title="Authentication">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Auth Type</FieldLabel>
                <Select value={form.auth.type} onChange={(e) => set({ auth: { ...form.auth, type: e.target.value as any } })}>
                  <option value="none">None</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="apikey">API Key (header)</option>
                  <option value="basic">Basic Auth (username / password)</option>
                </Select>
              </div>
              {form.auth.type !== "none" && (
                <div>
                  <FieldLabel>
                    Secret Reference
                    {form.auth.type === "basic" ? " (password)" : ""}
                  </FieldLabel>
                  <Input
                    value={form.auth.secretRef || ""}
                    onChange={(e) => set({ auth: { ...form.auth, secretRef: e.target.value } })}
                    placeholder="env:MY_API_KEY  or  vault:secret/path"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    For production: use <code className="rounded bg-gray-100 px-1">env:VAR_NAME</code> or <code className="rounded bg-gray-100 px-1">vault:path</code>.<br />
                    For testing: you can paste the raw token here — it won't be stored.
                  </p>
                </div>
              )}
            </div>
            {form.auth.type === "apikey" && (
              <div className="mt-3">
                <FieldLabel>Header Name</FieldLabel>
                <Input
                  className="w-48"
                  value={form.auth.headerName || ""}
                  onChange={(e) => set({ auth: { ...form.auth, headerName: e.target.value } })}
                  placeholder="X-API-Key"
                />
              </div>
            )}
            {form.auth.type === "basic" && (
              <div className="mt-3">
                <FieldLabel>Username</FieldLabel>
                <Input
                  className="w-48"
                  value={form.auth.username || ""}
                  onChange={(e) => set({ auth: { ...form.auth, username: e.target.value } })}
                />
              </div>
            )}

            {/* Static headers */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">Static Headers</p>
                <button
                  type="button"
                  onClick={() => {
                    const h = { ...(form.auth.extraHeaders || {}) };
                    h[`X-Custom-${Object.keys(h).length + 1}`] = "";
                    set({ auth: { ...form.auth, extraHeaders: h } });
                  }}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                >
                  <PlusIcon className="h-3 w-3" /> Add Header
                </button>
              </div>
              {Object.keys(form.auth.extraHeaders || {}).length === 0
                ? <p className="text-xs text-gray-400">No static headers configured.</p>
                : Object.entries(form.auth.extraHeaders || {}).map(([k, v], idx) => (
                  <div key={idx} className="mb-2 flex items-center gap-2">
                    <Input
                      defaultValue={k}
                      placeholder="Header-Name"
                      className="flex-1"
                      onBlur={(e) => {
                        const entries = Object.entries(form.auth.extraHeaders || {});
                        const h: Record<string, string> = {};
                        entries.forEach(([ek, ev], i) => { h[i === idx ? e.target.value : ek] = ev; });
                        set({ auth: { ...form.auth, extraHeaders: h } });
                      }}
                    />
                    <Input
                      value={v}
                      placeholder="Value"
                      className="flex-1"
                      onChange={(e) => {
                        const h = { ...(form.auth.extraHeaders || {}), [k]: e.target.value };
                        set({ auth: { ...form.auth, extraHeaders: h } });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const h = { ...(form.auth.extraHeaders || {}) };
                        delete h[k];
                        set({ auth: { ...form.auth, extraHeaders: h } });
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))
              }
            </div>
          </SectionCard>

          {/* ── Pagination ── */}
          <SectionCard title="Pagination">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Pagination Type</FieldLabel>
                <Select value={form.pagination.type} onChange={(e) => set({ pagination: { ...form.pagination, type: e.target.value as any } })}>
                  <option value="none">None (single response)</option>
                  <option value="page">Page number</option>
                  <option value="offset">Offset / skip</option>
                  <option value="cursor">Cursor / next-token</option>
                </Select>
              </div>
              <div>
                <FieldLabel>Page Size</FieldLabel>
                <Input
                  type="number"
                  value={form.pagination.pageSize ?? ""}
                  onChange={(e) => set({ pagination: { ...form.pagination, pageSize: Number(e.target.value) || undefined } })}
                  placeholder="100"
                />
              </div>
            </div>
            {form.pagination.type !== "none" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {form.pagination.type === "page" && (
                  <div>
                    <FieldLabel>Page Param</FieldLabel>
                    <Input value={form.pagination.pageParam || ""} onChange={(e) => set({ pagination: { ...form.pagination, pageParam: e.target.value } })} placeholder="page" />
                  </div>
                )}
                {form.pagination.type === "offset" && (
                  <div>
                    <FieldLabel>Offset Param</FieldLabel>
                    <Input value={form.pagination.offsetParam || ""} onChange={(e) => set({ pagination: { ...form.pagination, offsetParam: e.target.value } })} placeholder="offset" />
                  </div>
                )}
                {(form.pagination.type === "page" || form.pagination.type === "offset") && (
                  <div>
                    <FieldLabel>Page Size Param</FieldLabel>
                    <Input value={form.pagination.pageSizeParam || ""} onChange={(e) => set({ pagination: { ...form.pagination, pageSizeParam: e.target.value } })} placeholder="limit" />
                  </div>
                )}
                {form.pagination.type === "page" && (
                  <div>
                    <FieldLabel>Total Count Path</FieldLabel>
                    <Input value={form.pagination.totalPath || ""} onChange={(e) => set({ pagination: { ...form.pagination, totalPath: e.target.value } })} placeholder="meta.total" />
                  </div>
                )}
                {form.pagination.type === "cursor" && (
                  <>
                    <div>
                      <FieldLabel>Cursor Param</FieldLabel>
                      <Input value={form.pagination.cursorParam || ""} onChange={(e) => set({ pagination: { ...form.pagination, cursorParam: e.target.value } })} placeholder="cursor" />
                    </div>
                    <div>
                      <FieldLabel>Next Cursor Path</FieldLabel>
                      <Input value={form.pagination.nextCursorPath || ""} onChange={(e) => set({ pagination: { ...form.pagination, nextCursorPath: e.target.value } })} placeholder="pagination.nextCursor" />
                    </div>
                  </>
                )}
                {(form.pagination.type === "page" || form.pagination.type === "offset") && (
                  <div>
                    <FieldLabel>Modified-Since Param <span className="text-gray-400 font-normal">(for incremental)</span></FieldLabel>
                    <Input value={form.pagination.modifiedSinceParam || ""} onChange={(e) => set({ pagination: { ...form.pagination, modifiedSinceParam: e.target.value } })} placeholder="updatedAfter" />
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* ── Bulk Lookup ── */}
          <SectionCard title="Bulk Lookup (US-1.2)">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={form.bulkLookup.supported}
                onChange={(e) => set({ bulkLookup: { ...form.bulkLookup, supported: e.target.checked } })}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">This source supports bulk ID lookups (multiple IDs in one request)</span>
            </label>
            {form.bulkLookup.supported && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <FieldLabel>Param Name</FieldLabel>
                  <Input value={form.bulkLookup.param || ""} onChange={(e) => set({ bulkLookup: { ...form.bulkLookup, param: e.target.value } })} placeholder="ids" />
                </div>
                <div>
                  <FieldLabel>Style</FieldLabel>
                  <Select value={form.bulkLookup.style || ""} onChange={(e) => set({ bulkLookup: { ...form.bulkLookup, style: e.target.value as any } })}>
                    <option value="">Select…</option>
                    <option value="query-csv">query-csv (?ids=1,2,3)</option>
                    <option value="body-array">body-array (POST)</option>
                    <option value="repeat-param">repeat-param (?id=1&id=2)</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Max IDs / batch</FieldLabel>
                  <Input type="number" value={form.bulkLookup.maxIds ?? ""} onChange={(e) => set({ bulkLookup: { ...form.bulkLookup, maxIds: Number(e.target.value) || undefined } })} placeholder="100" />
                </div>
              </div>
            )}
          </SectionCard>

          {/* ── Test & Discover ── */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60">
            <div className="flex items-center gap-3 px-4 py-3">
              <BeakerIcon className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700">Test & Discover Columns</span>
              <div className="ml-auto flex items-center gap-2">
                {form.baseUrl && (
                  <button
                    type="button"
                    onClick={copyCurl}
                    title="Copy example curl"
                    className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    {copied
                      ? <><ClipboardDocumentCheckIcon className="h-3.5 w-3.5 text-emerald-600" /> Copied</>
                      : <><ClipboardDocumentIcon className="h-3.5 w-3.5" /> Copy curl</>}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !form.baseUrl.trim()}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {testing ? "Testing…" : "Run Test"}
                </button>
              </div>
            </div>

            {testResult && (
              <div className="border-t border-emerald-200 px-4 pb-4 pt-3">
                {testResult.success ? (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-700">
                        HTTP {testResult.httpStatus} — {testResult.columns.length} columns discovered
                      </span>
                    </div>
                    {testResult.columns.length > 0 && (
                      <div className="flex flex-wrap gap-1 rounded-lg bg-white p-2 border border-emerald-100 max-h-28 overflow-y-auto">
                        {testResult.columns.map((c) => (
                          <span key={c} className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800">{c}</span>
                        ))}
                      </div>
                    )}
                    {testResult.sample?.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-emerald-700 hover:underline">Show sample record</summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-emerald-200 font-mono">
                          {JSON.stringify(testResult.sample[0], null, 2)}
                        </pre>
                      </details>
                    )}
                  </>
                ) : (
                  <div className="flex items-start gap-2 text-xs text-red-700">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    {testResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {isEdit ? "Save Changes" : "Add Source"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step Builder ─────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  sources,
  onDelete,
  onMoveUp,
  onMoveDown,
  onChange,
}: {
  step: PsrStep;
  index: number;
  sources: PsrSource[];
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: (s: PsrStep) => void;
}) {
  const allCols = sources.flatMap((s) =>
    s.discoveredColumns.map((c) => `${s.key}.${c}`),
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-600">
            {index}
          </span>
          <Badge
            label={step.op.toUpperCase()}
            color={
              step.op === "root"
                ? "bg-purple-100 text-purple-700"
                : step.op === "lookup"
                  ? "bg-blue-100 text-blue-700"
                  : step.op === "filter"
                    ? "bg-orange-100 text-orange-700"
                    : step.op === "map"
                      ? "bg-teal-100 text-teal-700"
                      : "bg-slate-100 text-slate-600"
            }
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            ↓
          </button>
          {step.op !== "root" && (
            <button
              onClick={onDelete}
              className="rounded p-1 text-red-400 hover:bg-red-50"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {step.op === "root" && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Root Source
          </label>
          <select
            className="input-base w-full"
            value={step.source}
            onChange={(e) => onChange({ ...step, source: e.target.value })}
          >
            <option value="">Select source…</option>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name} ({s.key})
              </option>
            ))}
          </select>
        </div>
      )}

      {step.op === "lookup" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Join Source
              </label>
              <select
                className="input-base w-full"
                value={(step as LookupStep).source}
                onChange={(e) =>
                  onChange({ ...step, source: e.target.value } as PsrStep)
                }
              >
                <option value="">Select…</option>
                {sources.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name} ({s.key})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Cardinality
              </label>
              <select
                className="input-base w-full"
                value={(step as LookupStep).cardinality}
                onChange={(e) =>
                  onChange({
                    ...step,
                    cardinality: e.target.value as "one" | "many",
                  } as PsrStep)
                }
              >
                <option value="one">one (merge columns)</option>
                <option value="many">many (embed array)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Match Left (current row field)
              </label>
              <input
                className="input-base w-full"
                list={`left-cols-${index}`}
                value={(step as LookupStep).matchLeft}
                onChange={(e) =>
                  onChange({ ...step, matchLeft: e.target.value } as PsrStep)
                }
                placeholder="e.g. s1.parentId"
              />
              <datalist id={`left-cols-${index}`}>
                {allCols.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Match Right (join source field)
              </label>
              <input
                className="input-base w-full"
                value={(step as LookupStep).matchRight}
                onChange={(e) =>
                  onChange({ ...step, matchRight: e.target.value } as PsrStep)
                }
                placeholder="e.g. parentId"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Fields to Pick (comma-separated)
            </label>
            <input
              className="input-base w-full"
              value={(step as LookupStep).pick?.join(", ") || ""}
              onChange={(e) =>
                onChange({
                  ...step,
                  pick: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                } as PsrStep)
              }
              placeholder="e.g. name, email, mobile"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Embed As (array field name — only for cardinality=many)
            </label>
            <input
              className="input-base w-full"
              value={(step as LookupStep).embedAs || ""}
              onChange={(e) =>
                onChange({
                  ...step,
                  embedAs: e.target.value || undefined,
                } as PsrStep)
              }
              placeholder="e.g. students"
            />
          </div>
        </div>
      )}

      {step.op === "filter" && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Condition Expression
          </label>
          <textarea
            className="input-base w-full font-mono text-sm"
            rows={2}
            value={(step as any).condition}
            onChange={(e) =>
              onChange({ ...step, condition: e.target.value } as PsrStep)
            }
            placeholder='status == "active" and gradeYear >= 1'
          />
          <p className="mt-1 text-xs text-slate-400">
            Supported: == != &gt; &gt;= &lt; &lt;= and or not in — sandboxed
            evaluator, no eval()
          </p>
        </div>
      )}

      {step.op === "map" && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Field Expressions (one per line: outputField = expression)
          </label>
          <textarea
            className="input-base w-full font-mono text-sm"
            rows={4}
            value={Object.entries((step as any).set || {})
              .map(([k, v]) => `${k} = ${v}`)
              .join("\n")}
            onChange={(e) => {
              const set: Record<string, string> = {};
              for (const line of e.target.value.split("\n")) {
                const eq = line.indexOf("=");
                if (eq > 0) {
                  const k = line.slice(0, eq).trim();
                  const v = line.slice(eq + 1).trim();
                  if (k) set[k] = v;
                }
              }
              onChange({ ...step, set } as PsrStep);
            }}
            placeholder={
              'mobileNorm = replace(mobile, "+91", "")\nfullName = concat(firstName, " ", lastName)'
            }
          />
          <p className="mt-1 text-xs text-slate-400">
            Allowlisted functions: lower upper trim concat coalesce substr
            replace toString
          </p>
        </div>
      )}

      {step.op === "rename" && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Rename Mappings (one per line: sourceField = outputField)
          </label>
          <textarea
            className="input-base w-full font-mono text-sm"
            rows={3}
            value={Object.entries((step as any).map || {})
              .map(([k, v]) => `${k} = ${v}`)
              .join("\n")}
            onChange={(e) => {
              const map: Record<string, string> = {};
              for (const line of e.target.value.split("\n")) {
                const eq = line.indexOf("=");
                if (eq > 0) {
                  const k = line.slice(0, eq).trim();
                  const v = line.slice(eq + 1).trim();
                  if (k) map[k] = v;
                }
              }
              onChange({ ...step, map } as PsrStep);
            }}
            placeholder="fname = firstName"
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PSRPipelinesPage = () => {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>("pipelines");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Create pipeline form
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineCollection, setNewPipelineCollection] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Clone pipeline
  const [cloneTarget, setCloneTarget] = useState<Pipeline | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneCollection, setCloneCollection] = useState("");

  // Source modal
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<PsrSource | null>(null);

  // Runs
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedRunDetail, setExpandedRunDetail] = useState<SyncRun | null>(
    null,
  );

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // ── Load pipelines ──────────────────────────────────────────────────────────
  const loadPipelines = useCallback(async () => {
    setLoading(true);
    const res = await listPipelines();
    if (res.success) setPipelines(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  // ── Select pipeline — load full detail ─────────────────────────────────────
  const selectPipeline = async (p: Pipeline) => {
    setLoading(true);
    const res = await getPipeline(p._id);
    if (res.success) {
      setSelectedPipeline(res.data);
      setActiveTab("sources");
    } else {
      showMsg("error", res.error);
    }
    setLoading(false);
  };

  // ── Create pipeline ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newPipelineName.trim() || !newPipelineCollection.trim()) {
      showMsg("error", "Name and collection are required");
      return;
    }
    setSaving(true);
    const res = await createPipeline({
      name: newPipelineName.trim(),
      targetCollection: newPipelineCollection.trim(),
    });
    setSaving(false);
    if (res.success) {
      showMsg("success", "Pipeline created");
      setShowCreateForm(false);
      setNewPipelineName("");
      setNewPipelineCollection("");
      await loadPipelines();
    } else {
      showMsg("error", res.error);
    }
  };

  // ── Save pipeline changes ───────────────────────────────────────────────────
  const savePipeline = async (updates: Partial<Pipeline>) => {
    if (!selectedPipeline) return;
    setSaving(true);
    const res = await updatePipeline(selectedPipeline._id, updates);
    setSaving(false);
    if (res.success) {
      setSelectedPipeline(res.data);
      showMsg("success", "Saved");
      loadPipelines();
    } else {
      showMsg("error", res.error);
    }
  };

  // ── Source management ────────────────────────────────────────────────────────
  const handleAddSource = (source: PsrSource) => {
    if (!selectedPipeline) return;
    const sources = [...(selectedPipeline.sources || []), source];
    setSelectedPipeline({ ...selectedPipeline, sources });
    savePipeline({ sources });
    setSourceModalOpen(false);
  };

  const handleEditSource = (source: PsrSource) => {
    if (!selectedPipeline) return;
    const sources = selectedPipeline.sources.map((s) =>
      s.key === source.key ? source : s,
    );
    setSelectedPipeline({ ...selectedPipeline, sources });
    savePipeline({ sources });
    setSourceModalOpen(false);
    setEditingSource(null);
  };

  const handleDeleteSource = (key: string) => {
    if (!selectedPipeline) return;
    if (!confirm(`Remove source "${key}"? Steps referencing it will break.`))
      return;
    const sources = selectedPipeline.sources.filter((s) => s.key !== key);
    setSelectedPipeline({ ...selectedPipeline, sources });
    savePipeline({ sources });
  };

  // ── Step management ──────────────────────────────────────────────────────────
  const updateStep = (index: number, step: PsrStep) => {
    if (!selectedPipeline) return;
    const steps = [...selectedPipeline.steps];
    steps[index] = step;
    setSelectedPipeline({ ...selectedPipeline, steps });
  };

  const addStep = (op: PsrStep["op"]) => {
    if (!selectedPipeline) return;
    const newStep: PsrStep =
      op === "root"
        ? { op: "root", source: "" }
        : op === "lookup"
          ? {
              op: "lookup",
              source: "",
              matchLeft: "",
              matchRight: "",
              pick: [],
              cardinality: "many",
            }
          : op === "filter"
            ? { op: "filter", condition: "" }
            : op === "map"
              ? { op: "map", set: {} }
              : { op: "rename", map: {} };
    const steps = [...selectedPipeline.steps, newStep];
    setSelectedPipeline({ ...selectedPipeline, steps });
  };

  const deleteStep = (index: number) => {
    if (!selectedPipeline) return;
    const steps = selectedPipeline.steps.filter((_, i) => i !== index);
    setSelectedPipeline({ ...selectedPipeline, steps });
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    if (!selectedPipeline) return;
    const steps = [...selectedPipeline.steps];
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setSelectedPipeline({ ...selectedPipeline, steps });
  };

  // ── Runs ─────────────────────────────────────────────────────────────────────
  const loadRuns = useCallback(async (id: string) => {
    setRunsLoading(true);
    const res = await listRuns(id);
    if (res.success) setRuns(res.data);
    setRunsLoading(false);
  }, []);

  const handleTriggerRun = async (mode: "full" | "incremental") => {
    if (!selectedPipeline) return;
    const res = await triggerRun(selectedPipeline._id, mode);
    if (res.success) {
      showMsg("success", `Run started (${mode}) — id: ${res.data.runId}`);
      loadRuns(selectedPipeline._id);
    } else {
      showMsg("error", res.error);
    }
  };

  const handleDryRun = async () => {
    if (!selectedPipeline) return;
    showMsg("success", "Dry run started — check Run History tab");
    const res = await dryRunPipeline(selectedPipeline._id, 25);
    if (res.success) {
      showMsg(
        "success",
        `Dry run complete — ${res.data.counts.read} rows read`,
      );
      loadRuns(selectedPipeline._id);
    } else {
      showMsg("error", res.error);
    }
  };

  // ── When switching to Runs tab ───────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === "runs" && selectedPipeline) {
      loadRuns(selectedPipeline._id);
    }
  }, [activeTab, selectedPipeline, loadRuns]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <ModuleHeader
        title="PSR Pipelines"
        subtitle="Compose data from external APIs into searchable MongoDB collections — no redeploy required"
      />

      {/* Global message bar */}
      {message && (
        <div
          className={`mx-6 mb-4 rounded-lg px-4 py-3 text-sm font-medium ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}

      {/* Top nav — tab bar when a pipeline is selected */}
      {selectedPipeline && (
        <div className="mx-6 mb-4 flex items-center gap-1 border-b border-slate-200 pb-0">
          {/* Back to list */}
          <button
            onClick={() => {
              setSelectedPipeline(null);
              setActiveTab("pipelines");
            }}
            className="mr-3 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            ← All Pipelines
          </button>
          <span className="mr-4 text-sm font-semibold text-slate-800">
            {selectedPipeline.name}
          </span>
          {(
            ["sources", "builder", "output", "schedule", "runs"] as ActiveTab[]
          ).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}

          {/* Quick actions */}
          <div className="ml-auto flex items-center gap-2">
            {saving && <span className="text-xs text-slate-400">Saving…</span>}
            <button
              onClick={handleDryRun}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Dry Run
            </button>
            <button
              onClick={() => handleTriggerRun("full")}
              disabled={!selectedPipeline.isRunnable}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              ▶ Run Full Sync
            </button>
          </div>
        </div>
      )}

      <div className="px-6">
        {/* ── Pipelines list tab ─────────────────────────────────────────────── */}
        {activeTab === "pipelines" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">
                All Pipelines
              </h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                + New Pipeline
              </button>
            </div>

            {showCreateForm && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="mb-3 text-sm font-semibold text-blue-800">
                  Create New Pipeline
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Pipeline Name
                    </label>
                    <input
                      className="input-base w-full"
                      value={newPipelineName}
                      onChange={(e) => setNewPipelineName(e.target.value)}
                      placeholder="e.g. Parent + Student Directory"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Target Collection
                    </label>
                    <input
                      className="input-base w-full"
                      value={newPipelineCollection}
                      onChange={(e) =>
                        setNewPipelineCollection(
                          e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
                        )
                      }
                      placeholder="e.g. psr_parent_directory"
                    />
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Creating…" : "Create"}
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="rounded-lg border px-4 py-2 text-sm text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="py-16 text-center text-slate-400">Loading…</div>
            ) : pipelines.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-slate-400 text-sm">No pipelines yet.</p>
                <p className="text-slate-400 text-xs mt-1">
                  Create your first pipeline to start composing data from
                  external APIs.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Collection</th>
                      <th className="px-4 py-3 text-left">Sources</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Last Sync</th>
                      <th className="px-4 py-3 text-left">Records</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pipelines.map((p) => (
                      <tr key={p._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {p.targetCollection}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {(p.sources as any)?.length ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            label={
                              p.isRunnable
                                ? p.enabled
                                  ? "Ready"
                                  : "Disabled"
                                : "Incomplete"
                            }
                            color={
                              p.isRunnable
                                ? p.enabled
                                  ? "bg-green-100 text-green-700"
                                  : "bg-slate-100 text-slate-600"
                                : "bg-yellow-100 text-yellow-700"
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {fmtDate(p.lastSyncedAt)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {p.lastSyncedCount ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => selectPipeline(p)}
                              className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              Configure
                            </button>
                            <button
                              onClick={() => {
                                setCloneTarget(p);
                                setCloneName(`${p.name} (copy)`);
                                setCloneCollection(
                                  `${p.targetCollection}_copy`,
                                );
                              }}
                              className="rounded-lg bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Clone
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── API Sources tab ───────────────────────────────────────────────── */}
        {activeTab === "sources" && selectedPipeline && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">
                  API Sources
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Register external REST endpoints that this pipeline will pull
                  data from
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingSource(null);
                  setSourceModalOpen(true);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                + Add Source
              </button>
            </div>

            {selectedPipeline.sources.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
                <p className="text-slate-400 text-sm">
                  No sources registered yet.
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  Add at least one source to start building your pipeline.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedPipeline.sources.map((s) => (
                  <div
                    key={s.key}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-mono font-bold text-purple-700">
                          {s.key}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-800">
                            {s.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {s.method} {s.baseUrl}
                            {s.path}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          label={s.bulkLookup.supported ? "Bulk" : "Single"}
                          color={
                            s.bulkLookup.supported
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }
                        />
                        <Badge
                          label={s.auth.type}
                          color="bg-slate-100 text-slate-600"
                        />
                        <button
                          onClick={() => {
                            setEditingSource(s);
                            setSourceModalOpen(true);
                          }}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteSource(s.key)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {s.discoveredColumns.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                        {s.discoveredColumns.map((c) => (
                          <span
                            key={c}
                            className="rounded bg-slate-50 border border-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step Builder tab ─────────────────────────────────────────────── */}
        {activeTab === "builder" && selectedPipeline && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">
                  Step Builder
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Compose steps: root → lookup → filter → map → rename
                </p>
              </div>
              <div className="flex gap-2">
                {!selectedPipeline.steps.some((s) => s.op === "root") && (
                  <button
                    onClick={() => addStep("root")}
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
                  >
                    + Root
                  </button>
                )}
                <button
                  onClick={() => addStep("lookup")}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  + Lookup
                </button>
                <button
                  onClick={() => addStep("filter")}
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
                >
                  + Filter
                </button>
                <button
                  onClick={() => addStep("map")}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  + Map
                </button>
                <button
                  onClick={() => addStep("rename")}
                  className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  + Rename
                </button>
                <button
                  onClick={() =>
                    savePipeline({ steps: selectedPipeline.steps })
                  }
                  disabled={saving}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Steps"}
                </button>
              </div>
            </div>

            {selectedPipeline.steps.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
                <p className="text-slate-400 text-sm">No steps yet.</p>
                <p className="text-slate-400 text-xs mt-1">
                  Start with a Root step to choose which source feeds the
                  pipeline.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedPipeline.steps.map((step, index) => (
                  <StepCard
                    key={index}
                    step={step}
                    index={index}
                    sources={selectedPipeline.sources}
                    onChange={(s) => updateStep(index, s)}
                    onDelete={() => deleteStep(index)}
                    onMoveUp={() => moveStep(index, -1)}
                    onMoveDown={() => moveStep(index, 1)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Output & Indexes tab ────────────────────────────────────────── */}
        {activeTab === "output" && selectedPipeline && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-1">
                Output Configuration
              </h2>
              <p className="text-xs text-slate-500">
                Define which fields are stored and how the collection is indexed
              </p>
            </div>

            {/* Key field */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Key Field (unique upsert key) *
              </label>
              <input
                className="input-base w-80"
                value={selectedPipeline.output?.keyField || ""}
                onChange={(e) =>
                  setSelectedPipeline({
                    ...selectedPipeline,
                    output: {
                      ...selectedPipeline.output,
                      keyField: e.target.value,
                    },
                  })
                }
                placeholder="e.g. parentId"
              />
            </div>

            {/* Columns */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-600">
                  Output Columns
                </label>
                <button
                  onClick={() =>
                    setSelectedPipeline({
                      ...selectedPipeline,
                      output: {
                        ...selectedPipeline.output,
                        columns: [
                          ...(selectedPipeline.output?.columns || []),
                          { field: "" },
                        ],
                      },
                    })
                  }
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Add Column
                </button>
              </div>
              <div className="space-y-2">
                {(selectedPipeline.output?.columns || []).map((col, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      className="input-base flex-1"
                      value={col.field}
                      onChange={(e) => {
                        const columns = [
                          ...(selectedPipeline.output?.columns || []),
                        ];
                        columns[i] = { ...columns[i], field: e.target.value };
                        setSelectedPipeline({
                          ...selectedPipeline,
                          output: { ...selectedPipeline.output, columns },
                        });
                      }}
                      placeholder="Field path (e.g. name)"
                    />
                    <span className="text-slate-400 text-xs">as</span>
                    <input
                      className="input-base flex-1"
                      value={col.as || ""}
                      onChange={(e) => {
                        const columns = [
                          ...(selectedPipeline.output?.columns || []),
                        ];
                        columns[i] = {
                          ...columns[i],
                          as: e.target.value || undefined,
                        };
                        setSelectedPipeline({
                          ...selectedPipeline,
                          output: { ...selectedPipeline.output, columns },
                        });
                      }}
                      placeholder="Output name (optional)"
                    />
                    <button
                      onClick={() => {
                        const columns = (
                          selectedPipeline.output?.columns || []
                        ).filter((_, j) => j !== i);
                        setSelectedPipeline({
                          ...selectedPipeline,
                          output: { ...selectedPipeline.output, columns },
                        });
                      }}
                      className="text-red-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Search indexes */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-600">
                  Search Indexes
                </label>
                <button
                  onClick={() =>
                    setSelectedPipeline({
                      ...selectedPipeline,
                      output: {
                        ...selectedPipeline.output,
                        searchIndexes: [
                          ...(selectedPipeline.output?.searchIndexes || []),
                          { field: "", type: "plain" },
                        ],
                      },
                    })
                  }
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Add Index
                </button>
              </div>
              <div className="space-y-2">
                {(selectedPipeline.output?.searchIndexes || []).map((si, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      className="input-base flex-1"
                      value={si.field}
                      onChange={(e) => {
                        const searchIndexes = [
                          ...(selectedPipeline.output?.searchIndexes || []),
                        ];
                        searchIndexes[i] = {
                          ...searchIndexes[i],
                          field: e.target.value,
                        };
                        setSelectedPipeline({
                          ...selectedPipeline,
                          output: { ...selectedPipeline.output, searchIndexes },
                        });
                      }}
                      placeholder="Field name (e.g. name)"
                    />
                    <select
                      className="input-base w-40"
                      value={si.type}
                      onChange={(e) => {
                        const searchIndexes = [
                          ...(selectedPipeline.output?.searchIndexes || []),
                        ];
                        searchIndexes[i] = {
                          ...searchIndexes[i],
                          type: e.target.value as "plain" | "text",
                        };
                        setSelectedPipeline({
                          ...selectedPipeline,
                          output: { ...selectedPipeline.output, searchIndexes },
                        });
                      }}
                    >
                      <option value="plain">plain (exact/regex)</option>
                      <option value="text">text (full-text $text)</option>
                    </select>
                    <button
                      onClick={() => {
                        const searchIndexes = (
                          selectedPipeline.output?.searchIndexes || []
                        ).filter((_, j) => j !== i);
                        setSelectedPipeline({
                          ...selectedPipeline,
                          output: { ...selectedPipeline.output, searchIndexes },
                        });
                      }}
                      className="text-red-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => savePipeline({ output: selectedPipeline.output })}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Output Config"}
            </button>
          </div>
        )}

        {/* ── Schedule tab (US-3.6) ─────────────────────────────────────────── */}
        {activeTab === "schedule" && selectedPipeline && (
          <div className="max-w-lg space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-1">
                Sync Schedule
              </h2>
              <p className="text-xs text-slate-500">
                Configure when and how this pipeline syncs automatically
              </p>
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                checked={selectedPipeline.schedule?.enabled ?? false}
                onChange={(e) =>
                  setSelectedPipeline({
                    ...selectedPipeline,
                    schedule: {
                      ...selectedPipeline.schedule,
                      enabled: e.target.checked,
                    },
                  })
                }
              />
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  Enable automatic sync
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  When off, the pipeline only runs on manual trigger
                </p>
              </div>
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Sync Mode
              </label>
              <select
                className="input-base w-full"
                value={selectedPipeline.schedule?.mode || "full"}
                onChange={(e) =>
                  setSelectedPipeline({
                    ...selectedPipeline,
                    schedule: {
                      ...selectedPipeline.schedule,
                      mode: e.target.value as "incremental" | "full",
                    },
                  })
                }
              >
                <option value="full">Full (re-sync all records)</option>
                <option value="incremental">
                  Incremental (only changed records via watermark)
                </option>
              </select>
              {selectedPipeline.schedule?.mode === "incremental" && (
                <p className="mt-1 text-xs text-amber-600">
                  ⚠ Incremental requires sources with a modified-since param
                  configured (see Pagination → Modified-Since Param)
                </p>
              )}
            </div>

            {selectedPipeline.schedule?.mode === "incremental" && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Incremental Interval (minutes)
                </label>
                <input
                  type="number"
                  className="input-base w-40"
                  min={1}
                  value={
                    selectedPipeline.schedule?.incrementalEveryMinutes ?? ""
                  }
                  onChange={(e) =>
                    setSelectedPipeline({
                      ...selectedPipeline,
                      schedule: {
                        ...selectedPipeline.schedule,
                        incrementalEveryMinutes:
                          Number(e.target.value) || undefined,
                      },
                    })
                  }
                  placeholder="5"
                />
                <p className="mt-1 text-xs text-slate-400">
                  How often to run incremental syncs. Min recommended: 5
                  minutes.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Full Reconcile Cron
              </label>
              <input
                className="input-base w-full"
                value={selectedPipeline.schedule?.fullCron || ""}
                onChange={(e) =>
                  setSelectedPipeline({
                    ...selectedPipeline,
                    schedule: {
                      ...selectedPipeline.schedule,
                      fullCron: e.target.value,
                    },
                  })
                }
                placeholder="0 2 * * * (daily at 2 AM)"
              />
              <p className="mt-1 text-xs text-slate-400">
                Standard cron expression. Full reconcile catches deletes and
                missed incremental updates.
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700">
                Current effective schedule
              </p>
              <p>
                Mode:{" "}
                <span className="font-mono">
                  {selectedPipeline.schedule?.mode || "full"}
                </span>
              </p>
              {selectedPipeline.schedule?.mode === "incremental" &&
                selectedPipeline.schedule?.incrementalEveryMinutes && (
                  <p>
                    Incremental every:{" "}
                    <span className="font-mono">
                      {selectedPipeline.schedule.incrementalEveryMinutes} min
                    </span>
                  </p>
                )}
              <p>
                Full reconcile:{" "}
                <span className="font-mono">
                  {selectedPipeline.schedule?.fullCron || "— (manual only)"}
                </span>
              </p>
              <p>
                Status:{" "}
                <span
                  className={`font-semibold ${selectedPipeline.schedule?.enabled ? "text-green-700" : "text-slate-500"}`}
                >
                  {selectedPipeline.schedule?.enabled ? "Enabled" : "Disabled"}
                </span>
              </p>
            </div>

            <button
              onClick={() =>
                savePipeline({ schedule: selectedPipeline.schedule })
              }
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Schedule"}
            </button>
          </div>
        )}

        {/* ── Run History tab ──────────────────────────────────────────────── */}
        {activeTab === "runs" && selectedPipeline && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">
                Run History
              </h2>
              <button
                onClick={() => loadRuns(selectedPipeline._id)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Refresh
              </button>
            </div>

            {runsLoading ? (
              <div className="py-8 text-center text-slate-400">Loading…</div>
            ) : runs.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                No runs yet for this pipeline.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Started</th>
                      <th className="px-4 py-3 text-left">Mode</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Duration</th>
                      <th className="px-4 py-3 text-left">Read</th>
                      <th className="px-4 py-3 text-left">Upserted</th>
                      <th className="px-4 py-3 text-left">Errors</th>
                      <th className="px-4 py-3 text-left">By</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.map((r) => (
                      <React.Fragment key={r._id}>
                        <tr className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {fmtDate(r.startedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              label={r.mode}
                              color="bg-slate-100 text-slate-600"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              label={r.status}
                              color={
                                statusColor[r.status] ||
                                "bg-slate-100 text-slate-600"
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {fmtDuration(r.durationMs)}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {r.counts?.read ?? 0}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {r.counts?.upserted ?? 0}
                          </td>
                          <td className="px-4 py-3">
                            {r.counts?.errors > 0 ? (
                              <span className="text-red-600 font-medium">
                                {r.counts.errors}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {r.triggeredBy}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={async () => {
                                if (expandedRunId === r._id) {
                                  setExpandedRunId(null);
                                  setExpandedRunDetail(null);
                                  return;
                                }
                                setExpandedRunId(r._id);
                                const detail = await getRun(r._id);
                                if (detail.success)
                                  setExpandedRunDetail(detail.data);
                              }}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {expandedRunId === r._id ? "Hide" : "Details"}
                            </button>
                          </td>
                        </tr>
                        {expandedRunId === r._id && expandedRunDetail && (
                          <tr key={`${r._id}-detail`}>
                            <td colSpan={9} className="bg-slate-50 px-4 py-3">
                              {/* Step logs */}
                              {expandedRunDetail.stepLogs?.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-semibold text-slate-600 mb-1">
                                    Step Timing
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {expandedRunDetail.stepLogs.map((sl, i) => (
                                      <span
                                        key={i}
                                        className="rounded bg-white border border-slate-200 px-2 py-1 text-xs text-slate-700"
                                      >
                                        <span className="font-mono font-bold">
                                          {sl.op}
                                        </span>{" "}
                                        {sl.rowsIn}→{sl.rowsOut} rows ·{" "}
                                        {fmtDuration(sl.durationMs)}
                                        {sl.errors > 0 && (
                                          <span className="ml-1 text-red-600">
                                            ⚠ {sl.errors} err
                                          </span>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Error summary */}
                              {expandedRunDetail.errorSummary && (
                                <div className="mb-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                                  <span className="font-semibold">Error:</span>{" "}
                                  {expandedRunDetail.errorSummary}
                                </div>
                              )}
                              {/* Dry-run sample (US-2.8) */}
                              {expandedRunDetail.mode === "dry-run" &&
                                expandedRunDetail.dryRunSample &&
                                expandedRunDetail.dryRunSample.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-600 mb-2">
                                      Dry-Run Sample (
                                      {expandedRunDetail.dryRunSample.length}{" "}
                                      docs)
                                    </p>
                                    <div className="overflow-x-auto rounded border border-slate-200">
                                      <table className="min-w-full text-xs">
                                        <thead className="bg-slate-100">
                                          <tr>
                                            {Object.keys(
                                              expandedRunDetail.dryRunSample[0],
                                            )
                                              .filter((k) => !k.startsWith("_"))
                                              .map((k) => (
                                                <th
                                                  key={k}
                                                  className="px-3 py-1.5 text-left font-semibold text-slate-600"
                                                >
                                                  {k}
                                                </th>
                                              ))}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {expandedRunDetail.dryRunSample
                                            .slice(0, 10)
                                            .map((row, ri) => (
                                              <tr
                                                key={ri}
                                                className="bg-white hover:bg-slate-50"
                                              >
                                                {Object.keys(
                                                  expandedRunDetail
                                                    .dryRunSample![0],
                                                )
                                                  .filter(
                                                    (k) => !k.startsWith("_"),
                                                  )
                                                  .map((k) => (
                                                    <td
                                                      key={k}
                                                      className="px-3 py-1.5 text-slate-700 max-w-xs truncate"
                                                    >
                                                      {typeof row[k] ===
                                                      "object"
                                                        ? JSON.stringify(
                                                            row[k],
                                                          ).slice(0, 60)
                                                        : String(row[k] ?? "")}
                                                    </td>
                                                  ))}
                                              </tr>
                                            ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              {expandedRunDetail.mode === "dry-run" &&
                                (!expandedRunDetail.dryRunSample ||
                                  expandedRunDetail.dryRunSample.length ===
                                    0) && (
                                  <p className="text-xs text-slate-400">
                                    No sample data available for this dry run.
                                  </p>
                                )}
                              {expandedRunDetail.watermarkOut && (
                                <p className="mt-2 text-xs text-slate-500">
                                  Watermark:{" "}
                                  <span className="font-mono">
                                    {expandedRunDetail.watermarkOut}
                                  </span>
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clone pipeline modal */}
      {cloneTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-base font-bold text-slate-800">
                Clone Pipeline
              </h2>
              <button
                onClick={() => setCloneTarget(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm text-slate-500">
                Cloning:{" "}
                <span className="font-semibold text-slate-700">
                  {cloneTarget.name}
                </span>
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  New Pipeline Name
                </label>
                <input
                  className="input-base w-full"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  New Target Collection
                </label>
                <input
                  className="input-base w-full"
                  value={cloneCollection}
                  onChange={(e) =>
                    setCloneCollection(
                      e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
                    )
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <button
                onClick={() => setCloneTarget(null)}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={async () => {
                  if (!cloneName.trim() || !cloneCollection.trim()) return;
                  setSaving(true);
                  const res = await clonePipeline(cloneTarget._id, {
                    name: cloneName.trim(),
                    targetCollection: cloneCollection.trim(),
                  });
                  setSaving(false);
                  if (res.success) {
                    showMsg("success", "Pipeline cloned successfully");
                    setCloneTarget(null);
                    loadPipelines();
                  } else showMsg("error", res.error);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Cloning…" : "Clone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Source modal */}
      {sourceModalOpen && (
        <SourceModal
          initial={editingSource}
          existingKeys={(selectedPipeline?.sources || []).map((s) => s.key)}
          onSave={editingSource ? handleEditSource : handleAddSource}
          onClose={() => {
            setSourceModalOpen(false);
            setEditingSource(null);
          }}
        />
      )}
    </DashboardLayout>
  );
};

export default PSRPipelinesPage;
