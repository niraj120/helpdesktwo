import { useEffect, useRef, useState } from "react";
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  CheckIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  CircleStackIcon,
  BeakerIcon,
  CommandLineIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import {
  listMDMSources,
  createMDMSource,
  updateMDMSource,
  deleteMDMSource,
  testMDMSource,
  testMDMCredentials,
  MDMSource,
  MDMApi,
  MDMAuthMasked,
  MDMDataType,
  MDMTestResult,
} from "../services/mdmService";
import { API_CONFIG, getAuthHeaders } from "../config/constants";

interface ProjectOption {
  _id: string;
  name: string;
  code?: string;
}

interface MDMConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
}

const DATA_TYPES: MDMDataType[] = [
  "schools",
  "employees",
  "principals",
  "students",
  "parents",
  "children",
  "custom",
];

const DATA_TYPE_BADGE: Record<string, string> = {
  schools: "bg-purple-100 text-purple-700",
  employees: "bg-blue-100 text-blue-700",
  principals: "bg-amber-100 text-amber-700",
  students: "bg-emerald-100 text-emerald-700",
  parents: "bg-pink-100 text-pink-700",
  children: "bg-teal-100 text-teal-700",
  custom: "bg-gray-100 text-gray-600",
};

/** Build a runnable curl command from an API row + the source auth. Typed
 * secrets are inlined; saved-but-masked secrets render as <PLACEHOLDER> so the
 * user can paste their real value before running. */
const buildCurl = (api: MDMApi, auth: MDMAuthMasked): string => {
  const url = `${(api.baseUrl || "").replace(/\/+$/, "")}${api.path || ""}`;
  const q = (s: string) => `'${String(s).replace(/'/g, "'\\''")}'`;
  const lines: string[] = [`curl -X ${api.method || "GET"} ${q(url || "<URL>")}`];

  if (auth.type === "apiKey") {
    const v = auth.apiKey || (auth.hasApiKey ? "<API_KEY>" : "<API_KEY>");
    lines.push(`-H ${q(`${auth.headerName || "X-API-Key"}: ${v}`)}`);
  } else if (auth.type === "bearer") {
    const v = auth.token || (auth.hasToken ? "<TOKEN>" : "<TOKEN>");
    lines.push(`-H ${q(`Authorization: Bearer ${v}`)}`);
  } else if (auth.type === "basic") {
    const pw = auth.password || (auth.hasPassword ? "<PASSWORD>" : "<PASSWORD>");
    lines.push(`-u ${q(`${auth.username || "<USER>"}:${pw}`)}`);
  }

  for (const [k, v] of Object.entries(auth.extraHeaders || {})) {
    if (k) lines.push(`-H ${q(`${k}: ${v}`)}`);
  }

  if (api.method === "POST") {
    lines.push(`-H ${q("Content-Type: application/json")}`);
    lines.push(`-d ${q("{}")}`);
  }
  return lines.join(" \\\n  ");
};

/** Shell-aware tokenizer: splits a curl string honouring quotes + `\` line
 * continuations. */
const splitArgs = (input: string): string[] => {
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
    } else if (c === "'" || c === '"') {
      q = c;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) {
        out.push(cur);
        cur = "";
        started = false;
      }
    } else {
      cur += c;
      started = true;
    }
  }
  if (started) out.push(cur);
  return out;
};

interface ParsedCurl {
  method: "GET" | "POST";
  baseUrl: string;
  path: string;
  auth: Partial<MDMAuthMasked> & { type: MDMAuthMasked["type"] };
  extraHeaders: Record<string, string>;
  body?: string;
  notes: string[];
}

/** Parse a curl command into MDM form values. Throws on no URL. */
const parseCurl = (raw: string): ParsedCurl => {
  const toks = splitArgs(raw.trim());
  if (toks[0] === "curl") toks.shift();
  if (toks.length === 0) throw new Error("Nothing to parse.");

  let method = "";
  let url = "";
  let user = "";
  let body = "";
  const headers: Array<[string, string]> = [];
  const notes: string[] = [];

  const valueFlags = new Set([
    "-X",
    "--request",
    "-H",
    "--header",
    "-u",
    "--user",
    "-d",
    "--data",
    "--data-raw",
    "--data-binary",
    "--data-urlencode",
    "--url",
  ]);

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "-X" || t === "--request") method = (toks[++i] || "").toUpperCase();
    else if (t === "-H" || t === "--header") {
      const h = toks[++i] || "";
      const ci = h.indexOf(":");
      if (ci > 0) headers.push([h.slice(0, ci).trim(), h.slice(ci + 1).trim()]);
    } else if (t === "-u" || t === "--user") user = toks[++i] || "";
    else if (
      t === "-d" ||
      t === "--data" ||
      t === "--data-raw" ||
      t === "--data-binary" ||
      t === "--data-urlencode"
    )
      body = toks[++i] || "";
    else if (t === "--url") url = toks[++i] || "";
    else if (t === "-G" || t === "--get") method = method || "GET";
    else if (t.startsWith("-")) {
      // unknown flag — if it looks like it takes a value, skip the next token
      if (valueFlags.has(t)) i++;
    } else if (!url) url = t;
  }

  if (!url) throw new Error("No URL found in the curl command.");

  let baseUrl = url;
  let path = "";
  try {
    const u = new URL(url);
    baseUrl = u.origin;
    path = u.pathname + u.search;
  } catch {
    const m = url.match(/^(https?:\/\/[^/]+)(.*)$/i);
    if (m) {
      baseUrl = m[1];
      path = m[2];
    } else {
      notes.push("URL had no scheme/host — put the host in Base URL manually.");
    }
  }

  let auth: ParsedCurl["auth"] = { type: "none" };
  const extraHeaders: Record<string, string> = {};
  for (const [k, v] of headers) {
    if (/^authorization$/i.test(k)) {
      const bearer = v.match(/^Bearer\s+(.+)$/i);
      const basic = v.match(/^Basic\s+(.+)$/i);
      if (bearer) auth = { type: "bearer", token: bearer[1] };
      else if (basic) {
        let un = "";
        let pw = "";
        try {
          const dec = atob(basic[1]);
          const ci = dec.indexOf(":");
          un = ci < 0 ? dec : dec.slice(0, ci);
          pw = ci < 0 ? "" : dec.slice(ci + 1);
        } catch {
          notes.push("Could not decode Basic credentials — enter them manually.");
        }
        auth = { type: "basic", username: un, password: pw };
      } else extraHeaders[k] = v;
    } else if (/api[-_ ]?key/i.test(k)) {
      auth = { type: "apiKey", headerName: k, apiKey: v };
    } else if (/^content-type$/i.test(k)) {
      // implied by POST body handling — don't surface as an extra header
    } else extraHeaders[k] = v;
  }

  if (user) {
    const ci = user.indexOf(":");
    auth = {
      type: "basic",
      username: ci < 0 ? user : user.slice(0, ci),
      password: ci < 0 ? "" : user.slice(ci + 1),
    };
  }

  let m: "GET" | "POST" = method === "POST" || (!method && body) ? "POST" : "GET";
  if (method && method !== "GET" && method !== "POST") {
    notes.push(`Method ${method} not supported here — set to ${m}.`);
  }
  if (body) notes.push("Request body parsed but not stored (no body field yet).");

  return { method: m, baseUrl, path, auth, extraHeaders, body, notes };
};

const emptyApi = (): MDMApi => ({
  label: "",
  dataType: "custom",
  method: "GET",
  baseUrl: "",
  path: "",
  isDefaultForType: false,
  projectIds: [],
});

const emptyAuth = (): MDMAuthMasked => ({
  type: "none",
  username: "",
  headerName: "X-API-Key",
  extraHeaders: {},
  hasApiKey: false,
  hasToken: false,
  hasPassword: false,
});

interface EditState {
  _id?: string;
  name: string;
  description: string;
  enabled: boolean;
  apis: MDMApi[];
  auth: MDMAuthMasked;
}

const toEditState = (s?: MDMSource): EditState =>
  s
    ? {
        _id: s._id,
        name: s.name,
        description: s.description || "",
        enabled: s.enabled,
        apis: s.apis.length
          ? s.apis.map((a) => ({ ...a, projectIds: a.projectIds || [] }))
          : [emptyApi()],
        auth: { ...emptyAuth(), ...s.auth },
      }
    : {
        name: "",
        description: "",
        enabled: true,
        apis: [emptyApi()],
        auth: emptyAuth(),
      };

const STATUS_META: Record<string, { dot: string; cls: string; label: string }> =
  {
    connected: {
      dot: "bg-emerald-500",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      label: "Connected",
    },
    error: {
      dot: "bg-red-500",
      cls: "bg-red-50 text-red-700 border-red-200",
      label: "Error",
    },
    untested: {
      dot: "bg-gray-400",
      cls: "bg-gray-50 text-gray-600 border-gray-200",
      label: "Untested",
    },
  };

/* ---------- Reusable project multiselect dropdown ---------- */
const ProjectMultiSelect: React.FC<{
  projects: ProjectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}> = ({ projects, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  const labelText =
    selected.length === 0
      ? "All projects"
      : `${selected.length} project${selected.length > 1 ? "s" : ""} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
      >
        <span
          className={selected.length === 0 ? "text-gray-400" : "text-gray-800"}
        >
          {labelText}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 bg-white">
            <span className="text-xs text-gray-500">
              {projects.length} project(s)
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-indigo-600 hover:underline"
              >
                Clear (all)
              </button>
            )}
          </div>
          {projects.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400">
              No projects available.
            </p>
          ) : (
            projects.map((p) => {
              const isSel = selected.includes(p._id);
              return (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => toggle(p._id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-indigo-50 transition"
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isSel
                        ? "bg-indigo-600 border-indigo-600"
                        : "border-gray-300"
                    }`}
                  >
                    {isSel && <CheckIcon className="w-3 h-3 text-white" />}
                  </span>
                  <span className="text-gray-700">{p.name}</span>
                  {p.code && (
                    <span className="text-xs text-gray-400">({p.code})</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

const MDMConfigModal: React.FC<MDMConfigModalProps> = ({
  isOpen,
  onClose,
  canManage,
}) => {
  const [sources, setSources] = useState<MDMSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "edit">("list");
  const [edit, setEdit] = useState<EditState>(toEditState());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, MDMTestResult>>(
    {},
  );
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [curlOpen, setCurlOpen] = useState<number | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [importIdx, setImportIdx] = useState<number | null>(null);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const applyCurl = (idx: number) => {
    let p;
    try {
      p = parseCurl(importText);
    } catch (e: any) {
      setImportMsg({ ok: false, text: e?.message || "Could not parse the curl." });
      return;
    }
    // Fill the endpoint row (label / dataType / project mapping are left to the user)
    updateApi(idx, { method: p.method, baseUrl: p.baseUrl, path: p.path });
    // Auth + extra headers are source-level
    setEdit((e) => ({
      ...e,
      auth: {
        ...emptyAuth(),
        type: p.auth.type,
        headerName: p.auth.headerName || emptyAuth().headerName,
        username: p.auth.username || "",
        apiKey: p.auth.apiKey,
        token: p.auth.token,
        password: p.auth.password,
        extraHeaders: p.extraHeaders,
      },
    }));
    setImportMsg({
      ok: true,
      text: ["Imported ✓ — fields filled.", ...p.notes].join(" "),
    });
  };

  const copyCurl = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 1500);
    } catch {
      /* clipboard blocked — user can select the text manually */
    }
  };

  const loadSources = async () => {
    setLoading(true);
    const res = await listMDMSources();
    if (res.success && res.data) setSources(res.data);
    setLoading(false);
  };

  const loadProjects = async () => {
    try {
      const res = await fetch(`${API_CONFIG.API_URL}/projects`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      const list = data?.data?.projects || data?.data || data?.projects || [];
      if (Array.isArray(list)) setProjects(list);
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProjects();
      setView("list");
      setError("");
      loadSources();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const startCreate = () => {
    setEdit(toEditState());
    setTestResults({});
    setError("");
    setView("edit");
  };

  const startEdit = (s: MDMSource) => {
    setEdit(toEditState(s));
    setTestResults({});
    setError("");
    setView("edit");
  };

  const updateApi = (idx: number, patch: Partial<MDMApi>) => {
    setEdit((e) => ({
      ...e,
      apis: e.apis.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
  };

  const addApi = () => setEdit((e) => ({ ...e, apis: [...e.apis, emptyApi()] }));

  const removeApi = (idx: number) =>
    setEdit((e) => ({ ...e, apis: e.apis.filter((_, i) => i !== idx) }));

  const handleTest = async (idx: number) => {
    setTesting(idx);
    setTestResults((r) => ({ ...r, [idx]: undefined as any }));
    let res;
    if (edit._id) {
      res = await testMDMSource(edit._id, { apiIndex: idx });
    } else {
      res = await testMDMCredentials({ api: edit.apis[idx], auth: edit.auth });
    }
    setTestResults((r) => ({
      ...r,
      [idx]: res.data || { success: false, error: res.error || "Test failed" },
    }));
    setTesting(null);
  };

  const handleSave = async () => {
    if (!edit.name.trim()) {
      setError("Name is required");
      return;
    }
    if (edit.apis.some((a) => !a.baseUrl.trim())) {
      setError("Every API row needs a Base URL");
      return;
    }
    setSaving(true);
    setError("");
    const payload: any = {
      name: edit.name,
      description: edit.description,
      enabled: edit.enabled,
      apis: edit.apis,
      auth: {
        type: edit.auth.type,
        username: edit.auth.username,
        headerName: edit.auth.headerName,
        extraHeaders: edit.auth.extraHeaders,
        // Only send secrets when the user typed a new value
        ...(edit.auth.apiKey ? { apiKey: edit.auth.apiKey } : {}),
        ...(edit.auth.token ? { token: edit.auth.token } : {}),
        ...(edit.auth.password ? { password: edit.auth.password } : {}),
      },
    };
    const res = edit._id
      ? await updateMDMSource(edit._id, payload)
      : await createMDMSource(payload);
    setSaving(false);
    if (res.success) {
      await loadSources();
      setView("list");
    } else {
      setError(res.error || "Failed to save MDM source");
    }
  };

  const handleDelete = async (s: MDMSource) => {
    if (!window.confirm(`Delete MDM source "${s.name}"?`)) return;
    const res = await deleteMDMSource(s._id);
    if (res.success) loadSources();
    else alert(res.error || "Failed to delete");
  };

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition";
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-gray-50 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-5 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
                <CircleStackIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">MDM Master</h2>
                <p className="text-xs text-indigo-100">
                  Company master database — global, shared across all projects
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* ---------------- LIST VIEW ---------------- */}
            {view === "list" && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-medium text-gray-500">
                    {loading
                      ? "Loading…"
                      : `${sources.length} data source${
                          sources.length === 1 ? "" : "s"
                        }`}
                  </span>
                  {canManage && (
                    <button
                      onClick={startCreate}
                      className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition"
                    >
                      <PlusIcon className="w-4 h-4" /> Add Source
                    </button>
                  )}
                </div>

                {!loading && sources.length === 0 && (
                  <div className="text-center py-14 border-2 border-dashed border-gray-200 rounded-xl bg-white">
                    <CircleStackIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">
                      No MDM sources configured yet.
                    </p>
                    {canManage && (
                      <button
                        onClick={startCreate}
                        className="mt-3 text-sm text-indigo-600 font-medium hover:underline"
                      >
                        + Add your first source
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {sources.map((s) => {
                    const meta =
                      STATUS_META[s.connectionStatus] || STATUS_META.untested;
                    return (
                      <div
                        key={s._id}
                        className="bg-white border border-gray-200 rounded-xl p-4 flex justify-between items-start hover:shadow-md hover:border-indigo-200 transition"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800">
                              {s.name}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${meta.cls}`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}
                              />
                              {meta.label}
                            </span>
                            {!s.enabled && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                disabled
                              </span>
                            )}
                          </div>
                          {s.description && (
                            <p className="text-sm text-gray-500 mt-1">
                              {s.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {s.apis.length === 0 ? (
                              <span className="text-xs text-gray-400">
                                No endpoints
                              </span>
                            ) : (
                              s.apis.map((a, i) => (
                                <span
                                  key={i}
                                  className={`text-xs px-2 py-0.5 rounded-md ${
                                    DATA_TYPE_BADGE[a.dataType] ||
                                    DATA_TYPE_BADGE.custom
                                  }`}
                                >
                                  {a.label || a.dataType}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                        {canManage && (
                          <div className="flex gap-1 shrink-0 ml-3">
                            <button
                              onClick={() => startEdit(s)}
                              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                              title="Edit"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(s)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------------- EDIT VIEW ---------------- */}
            {view === "edit" && (
              <div className="space-y-5">
                {/* Basic info card */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Source Name *</label>
                      <input
                        className={inputCls}
                        value={edit.name}
                        onChange={(e) =>
                          setEdit({ ...edit, name: e.target.value })
                        }
                        placeholder="e.g. Company MDM"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          checked={edit.enabled}
                          onChange={(e) =>
                            setEdit({ ...edit, enabled: e.target.checked })
                          }
                        />
                        Enabled
                      </label>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className={labelCls}>Description</label>
                    <input
                      className={inputCls}
                      value={edit.description}
                      onChange={(e) =>
                        setEdit({ ...edit, description: e.target.value })
                      }
                      placeholder="Optional notes about this source"
                    />
                  </div>
                </div>

                {/* Auth card */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheckIcon className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-gray-700">
                      Authentication
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Type</label>
                      <select
                        className={inputCls}
                        value={edit.auth.type}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            auth: { ...edit.auth, type: e.target.value as any },
                          })
                        }
                      >
                        <option value="none">None</option>
                        <option value="apiKey">API Key (header)</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="basic">Basic Auth</option>
                      </select>
                    </div>

                    {edit.auth.type === "apiKey" && (
                      <>
                        <div>
                          <label className={labelCls}>Header Name</label>
                          <input
                            className={inputCls}
                            value={edit.auth.headerName}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                auth: {
                                  ...edit.auth,
                                  headerName: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="col-span-2">
                          <label className={labelCls}>
                            API Key{" "}
                            {edit.auth.hasApiKey && (
                              <span className="text-emerald-600 font-normal">
                                (set — leave blank to keep)
                              </span>
                            )}
                          </label>
                          <input
                            type="password"
                            className={inputCls}
                            value={edit.auth.apiKey || ""}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                auth: { ...edit.auth, apiKey: e.target.value },
                              })
                            }
                          />
                        </div>
                      </>
                    )}

                    {edit.auth.type === "bearer" && (
                      <div className="col-span-2">
                        <label className={labelCls}>
                          Token{" "}
                          {edit.auth.hasToken && (
                            <span className="text-emerald-600 font-normal">
                              (set — leave blank to keep)
                            </span>
                          )}
                        </label>
                        <input
                          type="password"
                          className={inputCls}
                          value={edit.auth.token || ""}
                          onChange={(e) =>
                            setEdit({
                              ...edit,
                              auth: { ...edit.auth, token: e.target.value },
                            })
                          }
                        />
                      </div>
                    )}

                    {edit.auth.type === "basic" && (
                      <>
                        <div>
                          <label className={labelCls}>Username</label>
                          <input
                            className={inputCls}
                            value={edit.auth.username}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                auth: { ...edit.auth, username: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className={labelCls}>
                            Password{" "}
                            {edit.auth.hasPassword && (
                              <span className="text-emerald-600 font-normal">
                                (set)
                              </span>
                            )}
                          </label>
                          <input
                            type="password"
                            className={inputCls}
                            value={edit.auth.password || ""}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                auth: { ...edit.auth, password: e.target.value },
                              })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* APIs card */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                      <ServerStackIcon className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-sm font-semibold text-gray-700">
                        API Endpoints
                      </h3>
                    </div>
                    <button
                      onClick={addApi}
                      className="inline-flex items-center gap-1 text-indigo-600 text-sm font-medium hover:text-indigo-700"
                    >
                      <PlusIcon className="w-4 h-4" /> Add API
                    </button>
                  </div>

                  <div className="space-y-4">
                    {edit.apis.map((api, idx) => {
                      const result = testResults[idx];
                      return (
                        <div
                          key={idx}
                          className="rounded-xl border border-gray-200 bg-gray-50/60 p-4"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold">
                              {idx + 1}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setImportIdx(importIdx === idx ? null : idx);
                                  setImportText("");
                                  setImportMsg(null);
                                }}
                                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 transition"
                                title="Paste a curl command to auto-fill this endpoint"
                              >
                                <CommandLineIcon className="w-4 h-4" />
                                {importIdx === idx ? "Close import" : "Import cURL"}
                              </button>
                              {edit.apis.length > 1 && (
                                <button
                                  onClick={() => removeApi(idx)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                  title="Remove endpoint"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {importIdx === idx && (
                            <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                              <label className={labelCls}>
                                Paste cURL — auto-fills Method, Base URL, Path &
                                Auth
                              </label>
                              <textarea
                                className={`${inputCls} font-mono text-xs`}
                                rows={4}
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder={
                                  "curl -X GET 'https://mdm.company.com/api/v1/employees' \\\n  -H 'Authorization: Bearer <token>'"
                                }
                              />
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  onClick={() => applyCurl(idx)}
                                  disabled={!importText.trim()}
                                  className="inline-flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                                >
                                  <CheckIcon className="w-3.5 h-3.5" />
                                  Apply
                                </button>
                                <button
                                  onClick={() => {
                                    setImportText("");
                                    setImportMsg(null);
                                  }}
                                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
                                >
                                  Clear
                                </button>
                                {importMsg && (
                                  <span
                                    className={`text-xs ${
                                      importMsg.ok
                                        ? "text-emerald-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {importMsg.text}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 mt-1.5">
                                You still set Label, Data Type & project mapping
                                below. Auth applies to the whole source.
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={labelCls}>Label</label>
                              <input
                                className={inputCls}
                                value={api.label}
                                onChange={(e) =>
                                  updateApi(idx, { label: e.target.value })
                                }
                                placeholder="Employee Directory"
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Data Type</label>
                              <select
                                className={inputCls}
                                value={api.dataType}
                                onChange={(e) =>
                                  updateApi(idx, {
                                    dataType: e.target.value as MDMDataType,
                                  })
                                }
                              >
                                {DATA_TYPES.map((dt) => (
                                  <option key={dt} value={dt}>
                                    {dt}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>Method</label>
                              <select
                                className={inputCls}
                                value={api.method}
                                onChange={(e) =>
                                  updateApi(idx, {
                                    method: e.target.value as "GET" | "POST",
                                  })
                                }
                              >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>Base URL *</label>
                              <input
                                className={inputCls}
                                value={api.baseUrl}
                                onChange={(e) =>
                                  updateApi(idx, { baseUrl: e.target.value })
                                }
                                placeholder="https://mdm.company.com"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className={labelCls}>Path</label>
                              <input
                                className={inputCls}
                                value={api.path}
                                onChange={(e) =>
                                  updateApi(idx, { path: e.target.value })
                                }
                                placeholder="/api/v1/employees"
                              />
                            </div>

                            {/* Project mapping dropdown */}
                            <div className="col-span-2">
                              <label className={labelCls}>
                                Map to Projects{" "}
                                <span className="text-gray-400 font-normal">
                                  (none = all projects)
                                </span>
                              </label>
                              <ProjectMultiSelect
                                projects={projects}
                                selected={api.projectIds}
                                onChange={(ids) =>
                                  updateApi(idx, { projectIds: ids })
                                }
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                checked={api.isDefaultForType}
                                onChange={(e) =>
                                  updateApi(idx, {
                                    isDefaultForType: e.target.checked,
                                  })
                                }
                              />
                              Default for type
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setCopiedCurl(false);
                                  setCurlOpen(curlOpen === idx ? null : idx);
                                }}
                                className="inline-flex items-center gap-1.5 text-xs bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition"
                                title="Generate a curl command for this endpoint"
                              >
                                <CommandLineIcon className="w-3.5 h-3.5" />
                                {curlOpen === idx ? "Hide cURL" : "cURL"}
                              </button>
                              <button
                                onClick={() => handleTest(idx)}
                                disabled={testing === idx}
                                className="inline-flex items-center gap-1.5 text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-900 disabled:opacity-50 transition"
                              >
                                <BeakerIcon className="w-3.5 h-3.5" />
                                {testing === idx ? "Testing…" : "Test"}
                              </button>
                            </div>
                          </div>

                          {curlOpen === idx && (
                            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  cURL command
                                </span>
                                <button
                                  onClick={() =>
                                    copyCurl(buildCurl(api, edit.auth))
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white transition"
                                >
                                  {copiedCurl ? (
                                    <>
                                      <ClipboardDocumentCheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                                      Copied
                                    </>
                                  ) : (
                                    <>
                                      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                      Copy
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="px-3 py-2.5 text-[11px] leading-relaxed text-emerald-300 whitespace-pre-wrap break-all font-mono">
                                {buildCurl(api, edit.auth)}
                              </pre>
                              {(edit.auth.type !== "none" &&
                                !edit.auth.apiKey &&
                                !edit.auth.token &&
                                !edit.auth.password) && (
                                <p className="px-3 pb-2 text-[10px] text-slate-500">
                                  Saved secrets are masked — replace the
                                  &lt;PLACEHOLDER&gt; before running.
                                </p>
                              )}
                            </div>
                          )}

                          {result && (
                            <div
                              className={`mt-3 p-2.5 rounded-lg text-xs border ${
                                result.success
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                              }`}
                            >
                              {result.success
                                ? `✓ OK (HTTP ${result.status}) — ${result.count} record(s). Sample: ${JSON.stringify(
                                    result.sampleData,
                                  ).slice(0, 160)}`
                                : `✗ ${result.error}`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {view === "edit" && (
            <div className="bg-white border-t px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setView("list")}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !canManage}
                className="px-5 py-2 text-sm font-medium bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-blue-700 shadow-sm disabled:opacity-50 transition"
              >
                {saving ? "Saving…" : "Save Source"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MDMConfigModal;
