import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  XMarkIcon,
  CommandLineIcon,
  BeakerIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import DashboardLayout from "../../components/DashboardLayout";
import {
  Master,
  PsrTable,
  TableColumn,
  TableLink,
  listMasters,
  createMaster,
  updateMaster,
  deleteMaster,
  testMaster,
  loadKeys,
  listTables,
  getTable,
  saveTable,
  deleteTable,
  previewTable,
  refreshTable,
  runTablePreview,
  updateTableSchedule,
} from "../../services/psrBuilderService";

// ─── cURL parser ─────────────────────────────────────────────────────────────

function splitArgs(input: string): string[] {
  const s = input.replace(/\\\r?\n/g, " ");
  const out: string[] = [];
  let cur = "";
  let q: "" | "'" | '"' = "";
  let started = false;
  for (const c of s) {
    if (q) { if (c === q) q = ""; else cur += c; started = true; }
    else if (c === "'" || c === '"') { q = c; started = true; }
    else if (/\s/.test(c)) { if (started) { out.push(cur); cur = ""; started = false; } }
    else { cur += c; started = true; }
  }
  if (started) out.push(cur);
  return out;
}

function parseCurl(raw: string): Partial<Master> & { notes?: string[] } {
  const toks = splitArgs(raw.trim());
  if (toks[0] === "curl") toks.shift();
  let method = ""; let url = ""; let body = "";
  const headers: [string, string][] = [];
  const notes: string[] = [];
  const valFlags = new Set(["-X","--request","-H","--header","-u","--user","-d","--data","--data-raw","--url"]);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "-X" || t === "--request") method = (toks[++i] || "").toUpperCase();
    else if (t === "-H" || t === "--header") { const h = toks[++i] || ""; const ci = h.indexOf(":"); if (ci > 0) headers.push([h.slice(0, ci).trim(), h.slice(ci + 1).trim()]); }
    else if (["-d", "--data", "--data-raw"].includes(t)) body = toks[++i] || "";
    else if (t === "--url") url = toks[++i] || "";
    else if (t.startsWith("-")) { if (valFlags.has(t)) i++; }
    else if (!url) url = t;
  }
  if (!url) throw new Error("Couldn't find a URL — check the cURL and try again.");

  let authType: "none" | "bearer" | "apikey" | "basic" = "none";
  let secretRef = ""; let headerName = "X-API-Key";
  const extraHeaders: Record<string, string> = {};
  for (const [k, v] of headers) {
    if (/^authorization$/i.test(k)) {
      const bearer = v.match(/^Bearer\s+(.+)$/i);
      if (bearer) { authType = "bearer"; secretRef = bearer[1]; notes.push("Bearer token captured. For production, store as env:VAR_NAME."); }
      else extraHeaders[k] = v;
    } else if (/api[-_ ]?key/i.test(k)) {
      authType = "apikey"; headerName = k; secretRef = v; notes.push(`API key captured from header "${k}".`);
    } else if (!/^content-type$/i.test(k)) extraHeaders[k] = v;
  }
  const m: "GET" | "POST" = method === "POST" || (!method && body) ? "POST" : "GET";
  if (method && !["GET","POST"].includes(method)) notes.push(`Method ${method} mapped to ${m}.`);
  return { url, method: m, auth: { type: authType, secretRef, headerName }, headers: extraHeaders, notes };
}

// ─── UI primitives ───────────────────────────────────────────────────────────

const Lbl = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <label className="mb-1 block text-xs font-semibold text-gray-600">
    {children}{req && <span className="ml-0.5 text-red-500">*</span>}
  </label>
);

const Inp = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 ${p.className || ""}`} />
);

const Sel = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none ${p.className || ""}`} />
);

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-gray-200 bg-gray-50/40 p-4 ${className}`}>{children}</div>
);

const CardTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">{children}</p>
);

// ─── Master form (shared by Tab 1 add + edit modal) ──────────────────────────

const emptyMaster = (): Partial<Master> => ({
  name: "", url: "", method: "GET",
  auth: { type: "none", headerName: "X-API-Key" },
  headers: {}, responsePath: "", primaryKey: "id",
});

function MasterForm({
  initial,
  existingNames,
  onSaved,
  onCancel,
  embedded = false,
}: {
  initial?: Partial<Master>;
  existingNames: string[];
  onSaved: (m: Master) => void;
  onCancel?: () => void;
  embedded?: boolean;
}) {
  const [form, setForm] = useState<Partial<Master>>(initial ?? emptyMaster());
  const [curlOpen, setCurlOpen] = useState(!embedded);
  const [curlText, setCurlText] = useState("");
  const [curlMsg, setCurlMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; httpStatus?: number; sample: unknown[]; columns: string[]; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (p: Partial<Master>) => setForm((f) => ({ ...f, ...p }));

  const applyParsedCurl = () => {
    try {
      const p = parseCurl(curlText);
      const { notes, ...rest } = p;
      set(rest);
      setCurlMsg({ ok: true, text: ["Filled in ✓", ...(notes || [])].join(" ") });
    } catch (e: any) {
      setCurlMsg({ ok: false, text: e.message });
    }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setError("");
    const res = await testMaster(form);
    setTesting(false);
    if (res.success) {
      setTestResult(res.data);
      if (res.data.success && res.data.columns.length) {
        set({ discoveredColumns: res.data.columns });
      }
    } else setError(res.error);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { setError("Master name is required"); return; }
    if (!form.url?.trim()) { setError("API URL is required"); return; }
    if (!initial?._id && existingNames.includes(form.name.trim())) { setError(`"${form.name.trim()}" already exists`); return; }
    setSaving(true); setError("");
    const res = initial?._id ? await updateMaster(initial._id, form) : await createMaster(form);
    setSaving(false);
    if (res.success) onSaved(res.data);
    else setError(res.error);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* cURL paste */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50">
        <button type="button" onClick={() => setCurlOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-indigo-700">
          <CommandLineIcon className="h-4 w-4" />
          Paste cURL command
          {curlOpen ? <ChevronUpIcon className="ml-auto h-4 w-4" /> : <ChevronDownIcon className="ml-auto h-4 w-4" />}
        </button>
        {curlOpen && (
          <div className="border-t border-indigo-200 px-4 pb-4 pt-3 space-y-2">
            <p className="text-xs text-indigo-600">
              Paste a cURL — URL, method, headers, and auth will fill in automatically.
            </p>
            <textarea rows={3} value={curlText} onChange={(e) => { setCurlText(e.target.value); setCurlMsg(null); }}
              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="curl -X GET 'https://api.example.com/v1/parents' -H 'Authorization: Bearer ...'" />
            {curlMsg && (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${curlMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {curlMsg.ok ? <CheckCircleIcon className="h-3.5 w-3.5 mt-0.5" /> : <ExclamationTriangleIcon className="h-3.5 w-3.5 mt-0.5" />}
                {curlMsg.text}
              </div>
            )}
            <button onClick={applyParsedCurl} disabled={!curlText.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
              Parse
            </button>
          </div>
        )}
      </div>

      {/* Simple form */}
      <Card>
        <CardTitle>Or fill the form</CardTitle>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <Lbl req>Master name</Lbl>
            <Inp value={form.name || ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Parent Master" />
          </div>
          <div>
            <Lbl>Method</Lbl>
            <Sel value={form.method || "GET"} onChange={(e) => set({ method: e.target.value as "GET" | "POST" })}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </Sel>
          </div>
        </div>
        <div className="mb-3">
          <Lbl req>API URL</Lbl>
          <Inp value={form.url || ""} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://api.example.com/v1/parents" />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <Lbl>Auth</Lbl>
            <Sel value={form.auth?.type || "none"} onChange={(e) => set({ auth: { ...form.auth, type: e.target.value as any } })}>
              <option value="none">None</option>
              <option value="bearer">Bearer Token</option>
              <option value="apikey">API Key</option>
              <option value="basic">Basic Auth</option>
            </Sel>
          </div>
          {form.auth?.type !== "none" && (
            <div>
              <Lbl>{form.auth?.type === "basic" ? "Password / secret" : "Token / key"}</Lbl>
              <Inp value={form.auth?.secretRef || ""} onChange={(e) => set({ auth: { type: form.auth?.type || "none", ...form.auth, secretRef: e.target.value } })}
                placeholder="env:MY_TOKEN  (or paste raw for testing)" />
            </div>
          )}
        </div>
        {form.auth?.type === "apikey" && (
          <div className="mb-3">
            <Lbl>Header name</Lbl>
            <Inp className="w-48" value={form.auth?.headerName || ""} onChange={(e) => set({ auth: { type: form.auth?.type || "apikey", ...form.auth, headerName: e.target.value } })} placeholder="X-API-Key" />
          </div>
        )}
        {form.auth?.type === "basic" && (
          <div className="mb-3">
            <Lbl>Username</Lbl>
            <Inp className="w-48" value={form.auth?.username || ""} onChange={(e) => set({ auth: { type: form.auth?.type || "basic", ...form.auth, username: e.target.value } })} />
          </div>
        )}
        <div className="mb-3">
          <Lbl>Response path <span className="font-normal text-gray-400">(dot-path to the rows array, e.g. data.results)</span></Lbl>
          <Inp value={form.responsePath || ""} onChange={(e) => set({ responsePath: e.target.value })} placeholder="data.results" />
        </div>

        {/* Pagination (for full sync — leave blank if API returns all records in one call) */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">Pagination <span className="font-normal text-gray-400 ml-1">— fill if the API paginates results (e.g. Strapi)</span></p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <Lbl>Page param name</Lbl>
              <Inp value={(form as any).pagination?.pageParam || ""} onChange={(e) => set({ pagination: { ...(form as any).pagination, pageParam: e.target.value } } as any)} placeholder="pagination[page]" />
            </div>
            <div>
              <Lbl>Page size param</Lbl>
              <Inp value={(form as any).pagination?.sizeParam || ""} onChange={(e) => set({ pagination: { ...(form as any).pagination, sizeParam: e.target.value } } as any)} placeholder="pagination[pageSize]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Lbl>Page size</Lbl>
              <Inp type="number" value={(form as any).pagination?.pageSize ?? ""} onChange={(e) => set({ pagination: { ...(form as any).pagination, pageSize: Number(e.target.value) || 100 } } as any)} placeholder="100" />
            </div>
            <div>
              <Lbl>Total count path</Lbl>
              <Inp value={(form as any).pagination?.totalPath || ""} onChange={(e) => set({ pagination: { ...(form as any).pagination, totalPath: e.target.value } } as any)} placeholder="meta.pagination.total" />
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-gray-400">Strapi example: page param = <code>pagination[page]</code>, size param = <code>pagination[pageSize]</code>, total = <code>meta.pagination.total</code></p>
        </div>

        {/* Extra headers */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Lbl>Extra headers</Lbl>
            <button type="button" onClick={() => set({ headers: { ...(form.headers || {}), "Header": "" } })}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
              <PlusIcon className="h-3 w-3" /> Add header
            </button>
          </div>
          {Object.keys(form.headers || {}).length === 0
            ? <p className="text-xs text-gray-400">None configured.</p>
            : Object.entries(form.headers || {}).map(([k, v], i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2">
                <Inp defaultValue={k} placeholder="Header-Name" className="flex-1"
                  onBlur={(e) => { const h: Record<string, string> = {}; Object.entries(form.headers || {}).forEach(([ek, ev], j) => { h[j === i ? e.target.value : ek] = ev; }); set({ headers: h }); }} />
                <Inp value={v} placeholder="Value" className="flex-1"
                  onChange={(e) => set({ headers: { ...(form.headers || {}), [k]: e.target.value } })} />
                <button type="button" onClick={() => { const h = { ...(form.headers || {}) }; delete h[k]; set({ headers: h }); }}
                  className="text-gray-400 hover:text-red-500"><TrashIcon className="h-4 w-4" /></button>
              </div>
            ))
          }
        </div>
      </Card>

      {/* Test */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <BeakerIcon className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-700">Test connection</span>
          <button onClick={handleTest} disabled={testing || !form.url?.trim()}
            className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
            {testing ? "Testing…" : "Test"}
          </button>
        </div>
        {testResult && (
          testResult.success
            ? (
              <div>
                <p className="text-xs font-semibold text-emerald-700 mb-1">
                  <CheckCircleIcon className="inline h-3.5 w-3.5 mr-1" />
                  HTTP {testResult.httpStatus} · {testResult.columns.length} columns found
                </p>
                {testResult.columns.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto rounded bg-white border border-emerald-100 p-2">
                    {testResult.columns.map((c) => (
                      <span key={c} className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            )
            : (
              <div className="flex items-start gap-2 text-xs text-red-700">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                <span>HTTP {testResult.httpStatus}: {testResult.error?.slice(0, 200)}</span>
              </div>
            )
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        {onCancel && (
          <button onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        )}
        <button onClick={handleSave} disabled={saving}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "Saving…" : initial?._id ? "Save changes" : "Save master"}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── Saved Table Card (Tab 3) ────────────────────────────────────────────────

const SCHEDULE_OPTIONS = [
  { label: "Manual only", value: 0 },
  { label: "Every 15 minutes", value: 15 },
  { label: "Every 30 minutes", value: 30 },
  { label: "Hourly", value: 60 },
  { label: "Every 6 hours", value: 360 },
  { label: "Daily (2 AM)", value: 1440 },
];

function SavedTableCard({
  table, masters, onEdit, onRefresh, onDelete, onScheduleChange,
}: {
  table: PsrTable;
  masters: Master[];
  onEdit: () => void;
  onRefresh: (full?: boolean) => void;
  onDelete: () => void;
  onScheduleChange: (s: { enabled: boolean; intervalMinutes: number }) => void;
}) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ rows: Record<string, unknown>[]; headers: string[]; totalJoinedRows: number; diagnostics: Record<string, any>; warning?: string } | null>(null);
  const [runError, setRunError] = useState("");
  const schedule = table.syncSchedule ?? { enabled: false, intervalMinutes: 0 };
  const masterName = (id: string) => masters.find((m) => m._id === id)?.name ?? id;
  const masterNames = table.masterIds.map((m) => typeof m === "string" ? masterName(m) : (m as Master).name).join(", ");

  const statusColor = { idle: "bg-emerald-100 text-emerald-700", refreshing: "bg-blue-100 text-blue-700", error: "bg-red-100 text-red-700", empty: "bg-gray-100 text-gray-600" };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-start justify-between px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h4 className="text-base font-bold text-gray-900">{table.name}</h4>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor[table.status] ?? statusColor.empty}`}>
              {table.status === "idle" ? "OK" : table.status === "refreshing" ? "Syncing…" : table.status === "error" ? "Error" : "Empty"}
            </span>
            {schedule.enabled && schedule.intervalMinutes > 0 && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                Auto · {SCHEDULE_OPTIONS.find((o) => o.value === schedule.intervalMinutes)?.label ?? `${schedule.intervalMinutes}m`}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-0.5">Masters: {masterNames}</p>
          <p className="text-xs text-gray-500">
            {table.rowCount != null
              ? <><span className="font-semibold text-gray-700">{table.rowCount.toLocaleString()}</span> rows in MongoDB</>
              : "Not synced yet"}
            {table.lastRefreshedAt && <span className="ml-2 text-gray-400">· Synced {new Date(table.lastRefreshedAt).toLocaleString()}</span>}
          </p>
          <p className="text-xs mt-0.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${table.syncMode === "incremental" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
              {table.syncMode === "incremental" ? "⚡ Incremental sync" : "🔄 Full sync (first run)"}
            </span>
            {table.syncMode === "incremental" && table.lastSyncWatermark && (
              <span className="ml-2 text-gray-400 text-[10px]">watermark: {new Date(table.lastSyncWatermark).toLocaleString()}</span>
            )}
          </p>
          {table.status === "error" && table.errorMessage && (
            <p className="mt-1 text-xs text-red-600">{table.errorMessage}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={async () => {
              setRunning(true); setRunResult(null); setRunError("");
              const r = await runTablePreview(table._id);
              setRunning(false);
              if (r.success) setRunResult(r.data);
              else setRunError(r.error);
            }}
            disabled={running}
            className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
          >
            {running ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : "▶"} {running ? "Running…" : "Run"}
          </button>
          <button onClick={onEdit} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <PencilSquareIcon className="h-3.5 w-3.5" /> Edit
          </button>
          <div className="relative group">
            <button onClick={() => onRefresh(false)} disabled={table.status === "refreshing"}
              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
              <ArrowPathIcon className={`h-3.5 w-3.5 ${table.status === "refreshing" ? "animate-spin" : ""}`} />
              {table.status === "refreshing" ? "Syncing…" : table.syncMode === "incremental" ? "Sync (incremental)" : "Sync (full)"}
            </button>
            {/* Full re-sync option */}
            {table.syncMode === "incremental" && table.status !== "refreshing" && (
              <button
                onClick={() => { if (confirm("Run a full re-sync? This will re-download ALL records from the MDM APIs. Use only when data seems out of date.")) onRefresh(true); }}
                className="mt-0.5 hidden group-hover:block absolute left-0 top-full z-10 w-44 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left text-xs font-semibold text-red-600 shadow-md hover:bg-red-50"
              >
                🔄 Force full re-sync
              </button>
            )}
          </div>
          <button onClick={() => setShowSchedule((s) => !s)}
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${showSchedule ? "border-indigo-400 bg-indigo-600 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
            🕐 Schedule
          </button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ▶ Run result panel */}
      {(runResult || runError) && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Run result — top {runResult?.rows.length ?? 0} rows
              {runResult && <span className="ml-2 font-normal text-gray-400">({runResult.totalJoinedRows} total joined)</span>}
            </p>
            <button onClick={() => { setRunResult(null); setRunError(""); }}
              className="text-xs text-gray-400 hover:text-gray-600">✕ Close</button>
          </div>

          {runError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 mb-3">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" /> {runError}
            </div>
          )}

          {runResult?.warning && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 mb-3">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" /> {runResult.warning}
            </div>
          )}

          {/* Diagnostics */}
          {runResult && (
            <details className="mb-3">
              <summary className="cursor-pointer text-xs font-semibold text-indigo-600 hover:underline mb-2">
                Diagnostics (what data was fetched and matched)
              </summary>
              <div className="mt-2 space-y-2">
                {Object.entries(runResult.diagnostics).map(([key, val]) => (
                  <div key={key} className="rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs">
                    <p className="font-semibold text-gray-700 mb-1">{key}</p>
                    {val.fetched !== undefined && <p className="text-gray-500">Fetched: <span className="font-semibold text-gray-700">{val.fetched} rows</span></p>}
                    {val.matchCount !== undefined && (
                      <p className={`${val.matchCount === 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}`}>
                        Matches: {val.matchCount} of {runResult.rows.length > 0 ? "20" : "0"} root rows
                        {val.matchCount === 0 && " ← no matches! check column names"}
                      </p>
                    )}
                    {val.sampleLeftValues && <p className="text-gray-500 mt-0.5">Sample left values: [{val.sampleLeftValues.map(String).join(", ")}]</p>}
                    {val.sampleJoinValues && <p className="text-gray-500 mt-0.5">Sample right values: [{val.sampleJoinValues.map(String).join(", ")}]</p>}
                    {val.sampleKeys && <p className="text-gray-400 mt-0.5">Keys: {val.sampleKeys.join(", ")}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Data table */}
          {runResult && runResult.rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    {runResult.headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runResult.rows.map((row, i) => (
                    <tr key={i} className="bg-white hover:bg-gray-50">
                      {runResult.headers.map((h) => (
                        <td key={h} className="px-3 py-1.5 text-gray-700 max-w-xs truncate">
                          {String(row[h] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {runResult && runResult.rows.length === 0 && !runResult.warning && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
              <p className="font-semibold mb-1">No rows returned after joining</p>
              <p className="text-xs">Check the Diagnostics above — look for links with "Matches: 0". The join column values may not match between masters.</p>
              <p className="text-xs mt-1">Tip: Open Diagnostics and compare "Sample left values" vs "Sample right values" — they should have numbers in common.</p>
            </div>
          )}
        </div>
      )}

      {/* Sync schedule panel */}
      {showSchedule && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Sync schedule</p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={schedule.enabled}
                onChange={(e) => onScheduleChange({ ...schedule, enabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
              Enable automatic sync
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Frequency:</span>
              <select
                value={schedule.intervalMinutes}
                disabled={!schedule.enabled}
                onChange={(e) => onScheduleChange({ ...schedule, intervalMinutes: Number(e.target.value) })}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-40 focus:border-indigo-500 focus:outline-none"
              >
                {SCHEDULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            The system will auto-fetch all records from your masters and rebuild this table on the selected schedule.
          </p>
        </div>
      )}

      {/* Column summary */}
      <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap gap-1.5">
        {table.columns.map((c, i) => (
          <span key={i} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${c.searchable ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600"}`}>
            {c.searchable && "🔍 "}{c.as}
          </span>
        ))}
        {table.columns.length > 0 && (
          <span className="text-[10px] text-gray-400 self-center ml-1">
            {table.columns.filter((c) => c.searchable).length} searchable
          </span>
        )}
      </div>
    </div>
  );
}

const PSRBuilderPage = () => {
  const [tab, setTab] = useState<1 | 2 | 3>(1);
  const [masters, setMasters] = useState<Master[]>([]);
  const [tables, setTables] = useState<PsrTable[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editMaster, setEditMaster] = useState<Master | null>(null);

  // Tab 2 builder state
  const [selectedMasterIds, setSelectedMasterIds] = useState<string[]>([]);
  const [columnsByMaster, setColumnsByMaster] = useState<Record<string, string[]>>({});
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [links, setLinks] = useState<TableLink[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<TableColumn[]>([]);
  const [preview, setPreview] = useState<{ rows: Record<string, unknown>[]; headers: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [tableName, setTableName] = useState("");
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [savingTable, setSavingTable] = useState(false);

  const previewTimer = useRef<ReturnType<typeof setTimeout>>();

  const showMsg = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  // ── Load data ──────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const [mr, tr] = await Promise.all([listMasters(), listTables()]);
    if (mr.success) setMasters(mr.data);
    if (tr.success) setTables(tr.data);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ── Load keys (Tab 2) ──────────────────────────────────────────────────────
  const handleLoadKeys = async () => {
    if (!selectedMasterIds.length) return;
    setLoadingKeys(true);
    const res = await loadKeys(selectedMasterIds);
    setLoadingKeys(false);
    if (res.success) {
      const newCols: Record<string, string[]> = {};
      for (const [id, r] of Object.entries(res.data)) {
        newCols[id] = r.columns;
        if (r.error) showMsg(false, `${masters.find((m) => m._id === id)?.name ?? id}: ${r.error}`);
      }
      setColumnsByMaster(newCols);
      setSelectedColumns([]);
      setLinks([]);
    } else showMsg(false, res.error);
  };

  // ── Toggle column ──────────────────────────────────────────────────────────
  const toggleColumn = (masterId: string, field: string) => {
    setSelectedColumns((prev) => {
      const exists = prev.find((c) => c.masterId === masterId && c.field === field);
      if (exists) return prev.filter((c) => !(c.masterId === masterId && c.field === field));
      const masterName = masters.find((m) => m._id === masterId)?.name ?? "";
      const asName = field.split(".").pop()!.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      return [...prev, { masterId, field, as: `${masterName} - ${asName}`, searchable: ["name","email","mobile","phone"].some((k) => field.toLowerCase().includes(k)) }];
    });
  };

  // ── Live preview debounced ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedMasterIds.length || !selectedColumns.length) { setPreview(null); return; }
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      const res = await previewTable({ masterIds: selectedMasterIds, links, columns: selectedColumns });
      setPreviewLoading(false);
      if (res.success) setPreview(res.data);
    }, 600);
    return () => clearTimeout(previewTimer.current);
  }, [selectedColumns, links, selectedMasterIds]);

  // ── Auto-add link rows when 2+ masters selected ──────────────────────────────────────────
  useEffect(() => {
    if (selectedMasterIds.length < 2) { setLinks([]); return; }
    setLinks((prev) => {
      const needed = selectedMasterIds.length - 1;
      if (prev.length === needed) return prev;
      const next: TableLink[] = [];
      for (let i = 0; i < needed; i++) {
        // Star join: all links start FROM master[0] (the hub/bridge table)
        // e.g. GuardianMapping→Parent AND GuardianMapping→Student
        next.push(prev[i] ?? {
          leftMasterId: selectedMasterIds[0],   // always the hub
          leftColumn: "",
          rightMasterId: selectedMasterIds[i + 1],
          rightColumn: "",
        });
      }
      return next;
    });
  }, [selectedMasterIds]);

  // ── Save table ─────────────────────────────────────────────────────────────
  const handleSaveTable = async () => {
    if (!tableName.trim()) { showMsg(false, "Enter a table name"); return; }
    if (!selectedMasterIds.length) { showMsg(false, "Select at least one master"); return; }
    if (!selectedColumns.length) { showMsg(false, "Tick at least one column"); return; }
    if (selectedMasterIds.length > 1 && links.some((l) => !l.leftColumn || !l.rightColumn)) {
      showMsg(false, "Complete the link sentence before saving"); return;
    }
    setSavingTable(true);
    const res = await saveTable({ id: editingTableId ?? undefined, name: tableName.trim(), masterIds: selectedMasterIds, links, columns: selectedColumns });
    setSavingTable(false);
    if (res.success) { showMsg(true, "Table saved — refreshing in background"); await reload(); resetBuilder(); }
    else showMsg(false, res.error);
  };

  const resetBuilder = () => {
    setSelectedMasterIds([]); setColumnsByMaster({}); setLinks([]); setSelectedColumns([]); setPreview(null); setTableName(""); setEditingTableId(null);
  };

  const masterName = (id: string) => masters.find((m) => m._id === id)?.name ?? id;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
        <div>
          <h1 className="text-xl font-bold text-gray-900">PSR — Master Builder</h1>
          <p className="mt-0.5 text-sm text-gray-500">Connect your data sources and build searchable tables for PSL agents</p>
        </div>
        {msg && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.ok ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
            {msg.text}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-100 px-6">
        {([1, 2, 3] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${tab === t ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-600"}`}>{t}</span>
            {t === 1 ? "Add master" : t === 2 ? "Build table" : (
              <span className="flex items-center gap-1">
                Saved tables
                {tables.length > 0 && <span className="rounded-full bg-indigo-100 px-1.5 text-[10px] font-bold text-indigo-600">{tables.length}</span>}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-6 py-5">

        {/* ═══════════════════════════════════════════ TAB 1 ════════════════ */}
        {tab === 1 && (
          <div className="max-w-2xl">
            <MasterForm
              initial={emptyMaster()}
              existingNames={masters.map((m) => m.name)}
              onSaved={async (m) => { showMsg(true, `"${m.name}" saved`); await reload(); }}
              embedded={false}
            />

            {/* Saved masters list */}
            {masters.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Saved masters</h3>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Name</th>
                        <th className="px-4 py-2.5 text-left">URL</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {masters.map((m) => (
                        <tr key={m._id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{m.name}</td>
                          <td className="px-4 py-2.5 max-w-xs truncate text-xs text-gray-500 font-mono">{m.url}</td>
                          <td className="px-4 py-2.5">
                            {m.lastTestOk === undefined ? (
                              <span className="text-xs text-gray-400">Untested</span>
                            ) : m.lastTestOk ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircleIcon className="h-3.5 w-3.5" />OK</span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-red-600"><ExclamationTriangleIcon className="h-3.5 w-3.5" />Error</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 justify-end">
                              <button onClick={() => setEditMaster(m)} className="rounded p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><PencilSquareIcon className="h-4 w-4" /></button>
                              <button onClick={async () => { if (!confirm(`Delete "${m.name}"?`)) return; const r = await deleteMaster(m._id); if (r.success) { showMsg(true, "Deleted"); reload(); } else showMsg(false, r.error); }}
                                className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50"><TrashIcon className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════ TAB 2 ════════════════ */}
        {tab === 2 && (
          <div>
            {editingTableId && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <PencilSquareIcon className="h-4 w-4 text-indigo-600 shrink-0" />
                <span className="text-sm font-semibold text-indigo-700">Editing: <span className="font-bold">{tableName || "table"}</span></span>
                <button onClick={resetBuilder} className="ml-auto text-xs text-gray-500 hover:text-gray-700">Cancel edit</button>
              </div>
            )}

            {/* Builder */}
            {masters.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-gray-400 text-sm">Add at least one master in Tab 1 first.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Master chips + Load keys */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Masters:</span>
                  {masters.map((m) => {
                    const selected = selectedMasterIds.includes(m._id);
                    const isRoot = selectedMasterIds[0] === m._id && selected;
                    return (
                      <button key={m._id}
                        onClick={() => setSelectedMasterIds((prev) => selected ? prev.filter((id) => id !== m._id) : [...prev, m._id])}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${selected ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"}`}>
                        {isRoot && <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">ROOT</span>}
                        {m.name}
                        {selected && <CheckCircleIcon className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                  <button onClick={handleLoadKeys} disabled={!selectedMasterIds.length || loadingKeys}
                    className="ml-2 flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                    <ArrowPathIcon className={`h-4 w-4 ${loadingKeys ? "animate-spin" : ""}`} />
                    {loadingKeys ? "Loading…" : "Load keys"}
                  </button>
                </div>
                {selectedMasterIds.length > 1 && (
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold text-indigo-700">ROOT</span> = the master data rows start from (the bridge/mapping table).
                    First master you selected is ROOT. Deselect and reselect to change the order.
                  </p>
                )}

                {/* Link sentences — full 4-dropdown control: both masters + both columns */}
                {selectedMasterIds.length > 1 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
                        Link tables — how does the data connect?
                      </p>
                      <button
                        type="button"
                        onClick={() => setLinks((prev) => [...prev, { leftMasterId: selectedMasterIds[0], leftColumn: "", rightMasterId: selectedMasterIds[1], rightColumn: "" }])}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:underline font-semibold"
                      >
                        <PlusIcon className="h-3 w-3" /> Add link
                      </button>
                    </div>

                    {links.length === 0 && (
                      <p className="text-xs text-amber-600">No links defined yet. Click “Add link” above or select masters first.</p>
                    )}

                    {links.map((link, i) => {
                      const leftCols = columnsByMaster[link.leftMasterId] || [];
                      const rightCols = columnsByMaster[link.rightMasterId] || [];
                      const isBothSet = link.leftColumn && link.rightColumn;
                      return (
                        <div key={i} className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${isBothSet ? "bg-white border border-emerald-200" : "bg-white border border-amber-200"}`}>
                          <span className="text-gray-500 font-medium">Link</span>

                          {/* Left master dropdown */}
                          <select
                            value={link.leftMasterId}
                            onChange={(e) => setLinks((prev) => prev.map((l, j) => j === i ? { ...l, leftMasterId: e.target.value, leftColumn: "" } : l))}
                            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 focus:border-indigo-500 focus:outline-none"
                          >
                            {selectedMasterIds.map((mid) => <option key={mid} value={mid}>{masterName(mid)}</option>)}
                          </select>

                          {/* Left column dropdown */}
                          <select
                            value={link.leftColumn}
                            onChange={(e) => setLinks((prev) => prev.map((l, j) => j === i ? { ...l, leftColumn: e.target.value } : l))}
                            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">pick column ▾</option>
                            {leftCols.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>

                          <span className="font-bold text-gray-500">=</span>

                          {/* Right master dropdown */}
                          <select
                            value={link.rightMasterId}
                            onChange={(e) => setLinks((prev) => prev.map((l, j) => j === i ? { ...l, rightMasterId: e.target.value, rightColumn: "" } : l))}
                            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-semibold text-purple-700 bg-purple-50 focus:border-indigo-500 focus:outline-none"
                          >
                            {selectedMasterIds.map((mid) => <option key={mid} value={mid}>{masterName(mid)}</option>)}
                          </select>

                          {/* Right column dropdown */}
                          <select
                            value={link.rightColumn}
                            onChange={(e) => setLinks((prev) => prev.map((l, j) => j === i ? { ...l, rightColumn: e.target.value } : l))}
                            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">pick column ▾</option>
                            {rightCols.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>

                          {isBothSet && <CheckCircleIcon className="h-4 w-4 text-emerald-500" />}
                          <button
                            type="button"
                            onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
                            className="ml-auto rounded p-1 text-gray-300 hover:text-red-500"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}

                    <p className="text-[10px] text-amber-600">
                      • Each link tells the system which column in one master matches a column in another.<br />
                      • Example: Guardian Mapping › guardianParentId &nbsp;=&nbsp; Parent Master › id<br />
                      • You need one link per master you want to connect.
                    </p>
                  </div>
                )}

                {/* Two-panel: columns + preview */}
                {Object.keys(columnsByMaster).length > 0 && (
                  <div className="flex gap-4 min-h-72">
                    {/* Left — column checkboxes */}
                    <div className="w-64 shrink-0 rounded-xl border border-gray-200 bg-white overflow-y-auto" style={{ maxHeight: 420 }}>
                      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-2.5">
                        <p className="text-xs font-semibold text-gray-700">
                          Columns · <span className="text-indigo-600">{selectedColumns.length} selected</span>
                        </p>
                      </div>
                      {selectedMasterIds.map((mid) => {
                        const cols = columnsByMaster[mid] || [];
                        if (!cols.length) return null;
                        return (
                          <div key={mid} className="px-4 py-3">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-indigo-500">{masterName(mid)}</p>
                            <div className="space-y-1.5">
                              {cols.map((col) => {
                                const checked = selectedColumns.some((c) => c.masterId === mid && c.field === col);
                                return (
                                  <label key={col} className="flex cursor-pointer items-center gap-2.5">
                                    <input type="checkbox" checked={checked}
                                      onChange={() => toggleColumn(mid, col)}
                                      className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-gray-700">{col.split(".").pop()}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right — preview + save */}
                    <div className="flex-1 rounded-xl border border-gray-200 bg-white overflow-hidden">
                      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                        <p className="text-xs font-semibold text-gray-700">
                          Preview
                          {preview && <span className="ml-1 text-gray-400">— {preview.rows.length} rows</span>}
                          {previewLoading && <span className="ml-2 text-gray-400">Loading…</span>}
                        </p>
                        <div className="flex items-center gap-3">
                          <input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="Table name…"
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm w-44 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          <button onClick={handleSaveTable} disabled={savingTable || !selectedColumns.length || !tableName.trim()}
                            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5">
                            💾 Save table
                          </button>
                        </div>
                      </div>

                      {!preview || !preview.rows.length ? (
                        <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                          {selectedColumns.length === 0 ? "Tick columns on the left to see a preview" : previewLoading ? "Building preview…" : "No preview data yet"}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                              <tr>
                                {preview.headers.map((h) => (
                                  <th key={h} className="px-4 py-2.5 text-left whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {preview.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {preview.headers.map((h) => (
                                    <td key={h} className="px-4 py-2.5 text-gray-700 max-w-xs truncate">
                                      {String(row[h] ?? "—")}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Searchable columns */}
                      {selectedColumns.length > 0 && (
                        <div className="border-t border-gray-100 px-4 py-3">
                          <p className="text-xs font-semibold text-gray-600 mb-2">Search by</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedColumns.map((col, i) => (
                              <label key={i} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs">
                                <input type="checkbox" checked={col.searchable}
                                  onChange={() => setSelectedColumns((prev) => prev.map((c, j) => j === i ? { ...c, searchable: !c.searchable } : c))}
                                  className="h-3 w-3 rounded border-gray-300 text-indigo-600" />
                                {col.as}
                              </label>
                            ))}
                          </div>
                          <p className="mt-1.5 text-[10px] text-gray-400">Ticked columns will be searchable by PSL agents</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════ TAB 3 ════════════════ */}
        {tab === 3 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Saved tables</h3>
              <button onClick={() => { resetBuilder(); setTab(2); }}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                + Build new table
              </button>
            </div>

            {tables.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
                <p className="text-gray-400 text-sm">No tables saved yet.</p>
                <p className="text-gray-400 text-xs mt-1">Go to Tab 2 to build your first table.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {tables.map((t) => (
                  <SavedTableCard
                    key={t._id}
                    table={t}
                    masters={masters}
                    onEdit={async () => {
                      // Load full table config back into Tab 2 builder
                      const res = await getTable(t._id);
                      if (!res.success) { showMsg(false, res.error); return; }
                      const full = res.data;
                      const mIds = full.masterIds.map((m) => typeof m === "string" ? m : (m as Master)._id);
                      setSelectedMasterIds(mIds);
                      setLinks(full.links);
                      setSelectedColumns(full.columns);
                      setTableName(full.name);
                      setEditingTableId(full._id);
                      setColumnsByMaster({});
                      setPreview(null);
                      setTab(2);
                      showMsg(true, `Editing "${full.name}" — Load keys to refresh columns`);
                    }}
                    onRefresh={async (full) => {
                      const r = await refreshTable(t._id, full);
                      if (r.success) { showMsg(true, `Sync started (${r.data.mode ?? "auto"} mode)…`); reload(); }
                      else showMsg(false, r.error);
                    }}
                    onDelete={async () => {
                      if (!confirm(`Delete table "${t.name}"? This removes the saved data.`)) return;
                      const r = await deleteTable(t._id);
                      if (r.success) { showMsg(true, "Deleted"); reload(); }
                      else showMsg(false, r.error);
                    }}
                    onScheduleChange={async (schedule) => {
                      const r = await updateTableSchedule(t._id, schedule);
                      if (r.success) { showMsg(true, "Schedule updated"); reload(); }
                      else showMsg(false, r.error);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit master modal */}
      {editMaster && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-base font-bold text-gray-900">Edit master</h2>
              <button onClick={() => setEditMaster(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <div className="p-6">
              <MasterForm
                initial={editMaster}
                existingNames={masters.filter((m) => m._id !== editMaster._id).map((m) => m.name)}
                onSaved={async (m) => { showMsg(true, `"${m.name}" updated`); setEditMaster(null); await reload(); }}
                onCancel={() => setEditMaster(null)}
                embedded
              />
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default PSRBuilderPage;
