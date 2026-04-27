import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  MdVpnKey,
  MdContentCopy,
  MdRefresh,
  MdBlock,
  MdAdd,
  MdCheck,
  MdWarning,
  MdInfo,
  MdPlayArrow,
  MdDownload,
  MdShare,
  MdKey,
  MdCode,
  MdMenuBook,
} from "react-icons/md";
import { API_CONFIG } from "../config/constants";
import DashboardLayout from "../components/DashboardLayout";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Project {
  _id: string;
  name: string;
  code?: string;
}

interface ApiKey {
  _id: string;
  projectId: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
  revokedAt?: string;
}

interface EndpointDef {
  id: string;
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  queryParams?: { key: string; label: string; placeholder: string }[];
  defaultBody?: Record<string, unknown> | null;
}

// â”€â”€â”€ Endpoint definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ENDPOINTS: EndpointDef[] = [
  {
    id: "lookup",
    method: "GET",
    path: "/v1/users/lookup",
    title: "Lookup User",
    description:
      "Find a registered user by mobile number within a project. Always returns HTTP 200 â€” check the 'found' flag in the response.",
    queryParams: [
      { key: "mobile", label: "Mobile Number", placeholder: "9876543210" },
    ],
    defaultBody: null,
  },
  {
    id: "form-schema",
    method: "GET",
    path: "/v1/tickets/form-schema",
    title: "Get Form Schema",
    description:
      'Returns the form schema for this project. "fixed_fields" are standard required fields (Name, Email, Category etc). "custom_fields" are additional project-specific fields. Pass all of them as flat fields directly in the POST /v1/tickets body (not nested under custom_fields).',
    queryParams: [],
    defaultBody: null,
  },
  {
    id: "create-ticket",
    method: "POST",
    path: "/v1/tickets",
    title: "Create Ticket",
    description:
      "Submit a support ticket from WhatsApp or a chatbot without user login. All form fields (from GET /v1/tickets/form-schema) are sent as flat fields alongside core fields, fixed fields, and custom fields. Duplicate tickets within the configured window are rejected with 409.",
    queryParams: [],
    defaultBody: null,
  },
  {
    id: "nearest-centres",
    method: "POST",
    path: "/v1/centers/nearest",
    title: "Find Nearest Centres",
    description:
      "Find the nearest support centres to a given pincode. Uses Google Distance Matrix when available, falls back to Haversine formula.",
    queryParams: [],
    defaultBody: {
      pincode: "411001",
      limit: 5,
    },
  },
  {
    id: "ticket-count",
    method: "GET",
    path: "/v1/tickets/count",
    title: "Get Ticket Count",
    description:
      "Returns the total number of tickets in this project. Optionally filter by status (1=Open, 2=In Progress, 3=Pending, 4=Resolved, 5=Closed), email, or mobile.",
    queryParams: [
      { key: "status", label: "Status (1\u20135)", placeholder: "1" },
      {
        key: "email",
        label: "Student Email",
        placeholder: "student@example.com",
      },
      { key: "mobile", label: "Mobile Number", placeholder: "9876543210" },
    ],
    defaultBody: null,
  },
  {
    id: "ticket-search",
    method: "GET",
    path: "/v1/tickets/search",
    title: "Search Tickets",
    description:
      "Search tickets by email, mobile, or status with pagination. Returns up to 100 tickets per page.",
    queryParams: [
      {
        key: "email",
        label: "Student Email",
        placeholder: "student@example.com",
      },
      { key: "mobile", label: "Mobile Number", placeholder: "9876543210" },
      { key: "status", label: "Status (1\u20135)", placeholder: "1" },
      { key: "page", label: "Page", placeholder: "1" },
      { key: "limit", label: "Limit (max 100)", placeholder: "20" },
    ],
    defaultBody: null,
  },
  {
    id: "ticket-by-number",
    method: "GET",
    path: "/v1/tickets/by-number/:ticketNumber",
    title: "Get Ticket by Number",
    description:
      "Fetch full details of a specific ticket by its ticket number. Returns category, assigned agent, student info, and all custom field values.",
    queryParams: [
      { key: "ticketNumber", label: "Ticket Number", placeholder: "TKT-00123" },
    ],
    defaultBody: null,
  },
  {
    id: "create-user",
    method: "POST",
    path: "/v1/users",
    title: "Create / Upsert User",
    description:
      "Create a new user or update an existing one (matched by email). The user is automatically linked to this project.",
    queryParams: [],
    defaultBody: {
      email: "student@example.com",
      mobile: "9876543210",
      firstName: "Rahul",
      lastName: "Sharma",
    },
  },
  {
    id: "create-center",
    method: "POST",
    path: "/v1/centers",
    title: "Create Centre",
    description:
      "Register a new support centre in this project. Required: centerName, address, city, state. Optional: pincode, phone, email, latitude, longitude.",
    queryParams: [],
    defaultBody: {
      centerName: "City Support Centre",
      address: "123 Main Street",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
      phone: "9876543210",
      email: "centre@example.com",
      latitude: 18.5204,
      longitude: 73.8567,
    },
  },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("authToken")}`,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

// Base server URL (strips /api â€” /v1/* routes are NOT under /api)
const SERVER_BASE = API_CONFIG.API_URL;

function methodBadge(method: "GET" | "POST") {
  return method === "GET"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-blue-100 text-blue-700";
}

function statusColor(status: number) {
  if (status >= 200 && status < 300) return "text-emerald-600";
  if (status >= 400 && status < 500) return "text-amber-600";
  return "text-red-600";
}

// â”€â”€â”€ One-Time Key Reveal Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function KeyRevealModal({
  rawKey,
  onClose,
}: {
  rawKey: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(rawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <MdWarning className="text-amber-600 text-xl" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Copy your API key now
            </h2>
            <p className="text-sm text-gray-500">
              This key will not be shown again after you close this dialog.
            </p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 mb-5 flex items-center gap-3">
          <code className="flex-1 text-green-400 text-sm font-mono break-all select-all">
            {rawKey}
          </code>
          <button
            onClick={copy}
            className="flex-shrink-0 text-gray-300 hover:text-white transition-colors"
          >
            {copied ? (
              <MdCheck className="text-green-400 text-xl" />
            ) : (
              <MdContentCopy className="text-xl" />
            )}
          </button>
        </div>
        <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-3 mb-5 text-sm text-blue-700">
          <MdInfo className="flex-shrink-0 mt-0.5" />
          <span>
            Store this key securely. You can rotate it any time to invalidate
            the old one.
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          I've saved the key â€” Close
        </button>
      </div>
    </div>
  );
}

// â”€â”€â”€ Keys Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function KeysTab({
  keys,
  loading,
  actionLoading,
  error,
  selectedProjectId,
  onCreate,
  onRotate,
  onRevoke,
}: {
  keys: ApiKey[];
  loading: boolean;
  actionLoading: string | null;
  error: string | null;
  selectedProjectId: string;
  onCreate: () => void;
  onRotate: (id: string) => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">
          Only one active key per project. Generating a new one deactivates the
          old one.
        </p>
        <button
          onClick={onCreate}
          disabled={!selectedProjectId || actionLoading === "create"}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {actionLoading === "create" ? (
            <MdRefresh className="animate-spin" />
          ) : (
            <MdAdd />
          )}
          Generate New Key
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm flex items-center gap-2">
          <MdWarning className="flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-5 text-sm text-blue-700 flex items-start gap-2">
        <MdInfo className="flex-shrink-0 mt-0.5" />
        <span>
          Include the key as{" "}
          <code className="bg-blue-100 px-1 rounded font-mono">X-API-Key</code>{" "}
          and the project ID as{" "}
          <code className="bg-blue-100 px-1 rounded font-mono">
            X-Project-ID
          </code>{" "}
          in every{" "}
          <code className="bg-blue-100 px-1 rounded font-mono">/v1/*</code>{" "}
          request.
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-14 bg-gray-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <MdVpnKey className="text-4xl mx-auto mb-2 text-gray-300" />
          <p className="text-sm">
            No API keys yet.{" "}
            <button
              onClick={onCreate}
              className="text-indigo-600 hover:underline"
            >
              Generate the first one.
            </button>
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Key Prefix
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Created
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Revoked At
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((k) => (
                <tr key={k._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-800">
                    {k.keyPrefix}â€¦
                  </td>
                  <td className="px-4 py-3">
                    {k.isActive ? (
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-xs font-medium px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        Revoked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(k.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {k.revokedAt ? formatDate(k.revokedAt) : "N/A"}
                  </td>
                  <td className="px-4 py-3">
                    {k.isActive && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onRotate(k._id)}
                          disabled={!!actionLoading}
                          className="flex items-center gap-1 border border-gray-200 text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === k._id ? (
                            <MdRefresh className="animate-spin" />
                          ) : (
                            <MdRefresh />
                          )}
                          Rotate
                        </button>
                        <button
                          onClick={() => onRevoke(k._id)}
                          disabled={!!actionLoading}
                          className="flex items-center gap-1 border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                        >
                          <MdBlock />
                          Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Playground Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PlaygroundTab({ selectedProjectId }: { selectedProjectId: string }) {
  const [activeId, setActiveId] = useState(ENDPOINTS[0].id);
  const [apiKey, setApiKey] = useState("");
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState("");
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    data: unknown;
    durationMs: number;
  } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [loadingSchema, setLoadingSchema] = useState(false);

  const endpoint = ENDPOINTS.find((e) => e.id === activeId)!;

  const loadCustomFields = async () => {
    if (!apiKey.trim() || !selectedProjectId) {
      setRunError("Enter your API key and select a project first.");
      return;
    }
    setLoadingSchema(true);
    try {
      const res = await axios.get(`${SERVER_BASE}/v1/tickets/form-schema`, {
        headers: {
          "X-API-Key": apiKey.trim(),
          "X-Project-ID": selectedProjectId,
        },
        validateStatus: () => true,
      });
      if (res.status === 200) {
        const coreFields: { key: string }[] = res.data?.core_fields ?? [];
        const fixedFields: { key: string }[] = res.data?.fixed_fields ?? [];
        const customFields: { key: string }[] = res.data?.custom_fields ?? [];
        const base: Record<string, unknown> = {};
        // Build body entirely from schema — no hardcoded fields
        coreFields.forEach((f) => {
          base[f.key] = "";
        });
        fixedFields.forEach((f) => {
          base[f.key] = "";
        });
        customFields.forEach((f) => {
          base[f.key] = "";
        });
        setBodyText(JSON.stringify(base, null, 2));
        setRunError(null);
      } else {
        setRunError(
          `Failed to load schema: ${res.status} — ${(res.data as any)?.message ?? ""}`,
        );
      }
    } catch (err: any) {
      setRunError(err?.message ?? "Failed to load form schema");
    } finally {
      setLoadingSchema(false);
    }
  };

  // Reset body/params when switching endpoint (must be declared BEFORE auto-load)
  useEffect(() => {
    setBodyText(
      endpoint.defaultBody ? JSON.stringify(endpoint.defaultBody, null, 2) : "",
    );
    const init: Record<string, string> = {};
    (endpoint.queryParams ?? []).forEach((p) => (init[p.key] = ""));
    setQueryValues(init);
    setResponse(null);
    setRunError(null);
  }, [activeId]);

  // Auto-load schema when switching to create-ticket or when credentials change.
  // Declared AFTER the reset effect so it fires second — no stale bodyText guard needed.
  useEffect(() => {
    if (activeId === "create-ticket" && apiKey.trim() && selectedProjectId) {
      loadCustomFields();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, apiKey, selectedProjectId]);

  const buildUrl = () => {
    // Substitute path params (e.g. :ticketNumber → queryValues["ticketNumber"])
    let resolvedPath = endpoint.path;
    (endpoint.queryParams ?? []).forEach((p) => {
      if (resolvedPath.includes(`:${p.key}`) && queryValues[p.key]) {
        resolvedPath = resolvedPath.replace(
          `:${p.key}`,
          encodeURIComponent(queryValues[p.key]),
        );
      }
    });
    const base = `${SERVER_BASE}${resolvedPath}`;
    if (endpoint.method === "GET" && endpoint.queryParams?.length) {
      const qs = new URLSearchParams();
      endpoint.queryParams.forEach((p) => {
        // Skip params that were already inlined as path segments
        if (!endpoint.path.includes(`:${p.key}`) && queryValues[p.key]) {
          qs.set(p.key, queryValues[p.key]);
        }
      });
      const qsStr = qs.toString();
      return qsStr ? `${base}?${qsStr}` : base;
    }
    return base;
  };

  const buildCurl = () => {
    const url = buildUrl();
    const key = apiKey || "<YOUR-API-KEY>";
    const headerParts = [
      `-H "X-API-Key: ${key}"`,
      `-H "X-Project-ID: ${selectedProjectId || "<PROJECT-ID>"}"`,
    ];
    if (endpoint.method === "POST") {
      headerParts.push('-H "Content-Type: application/json"');
    }
    const bodyPart =
      endpoint.method === "POST" && bodyText
        ? `\\ \n  -d '${bodyText.replace(/\n/g, " ")}'`
        : "";
    return `curl -X ${endpoint.method} "${url}" \\\n  ${headerParts.join(" \\\n  ")}${bodyPart}`;
  };

  const handleRun = async () => {
    if (!apiKey.trim()) {
      setRunError("Enter your API key above before running.");
      return;
    }
    if (!selectedProjectId) {
      setRunError("Select a project first.");
      return;
    }
    setRunning(true);
    setRunError(null);
    setResponse(null);
    const t0 = Date.now();
    try {
      const headers: Record<string, string> = {
        "X-API-Key": apiKey.trim(),
        "X-Project-ID": selectedProjectId,
      };
      let res;
      if (endpoint.method === "GET") {
        res = await axios.get(buildUrl(), {
          headers,
          validateStatus: () => true,
        });
      } else {
        let body: unknown = {};
        try {
          body = JSON.parse(bodyText);
        } catch {
          /* let backend reject */
        }
        res = await axios.post(buildUrl(), body, {
          headers: { ...headers, "Content-Type": "application/json" },
          validateStatus: () => true,
        });
      }
      setResponse({
        status: res.status,
        data: res.data,
        durationMs: Date.now() - t0,
      });
    } catch (err: any) {
      setRunError(err?.message ?? "Request failed");
    } finally {
      setRunning(false);
    }
  };

  const copyCurl = () => {
    navigator.clipboard.writeText(buildCurl()).then(() => {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* API Key input */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <MdKey className="text-amber-600 text-xl flex-shrink-0" />
        <div className="flex-1">
          <label className="block text-xs font-semibold text-amber-800 mb-1">
            Your API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your active API key here"
            className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <p className="text-xs text-amber-700">
          Generate one from the <strong>API Keys</strong> tab.
        </p>
      </div>

      <div className="flex gap-4">
        {/* Endpoint list */}
        <div className="w-52 flex-shrink-0 space-y-1">
          {ENDPOINTS.map((ep) => (
            <button
              key={ep.id}
              onClick={() => setActiveId(ep.id)}
              className={`w-full text-left rounded-xl px-3 py-3 transition-colors border ${
                activeId === ep.id
                  ? "border-indigo-200 bg-indigo-50"
                  : "border-transparent hover:bg-gray-100"
              }`}
            >
              <span
                className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded font-mono mb-1 ${methodBadge(
                  ep.method,
                )}`}
              >
                {ep.method}
              </span>
              <p className="text-xs text-gray-700 font-medium leading-tight">
                {ep.title}
              </p>
              <p className="text-xs text-gray-400 font-mono truncate">
                {ep.path}
              </p>
            </button>
          ))}
        </div>

        {/* Request / response panel */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Endpoint description */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${methodBadge(
                  endpoint.method,
                )}`}
              >
                {endpoint.method}
              </span>
              <code className="text-sm font-mono text-gray-700">
                {endpoint.path}
              </code>
            </div>
            <p className="text-sm text-gray-500">{endpoint.description}</p>
          </div>

          {/* Params / Body */}
          {endpoint.method === "GET" && endpoint.queryParams?.length ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Query Parameters
              </h3>
              {endpoint.queryParams.map((p) => (
                <div key={p.key}>
                  <label className="text-xs text-gray-600 mb-1 block">
                    <code className="font-mono">{p.key}</code>
                  </label>
                  <input
                    type="text"
                    value={queryValues[p.key] ?? ""}
                    onChange={(e) =>
                      setQueryValues((v) => ({ ...v, [p.key]: e.target.value }))
                    }
                    placeholder={p.placeholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          ) : endpoint.defaultBody !== null ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Request Body (JSON)
                </h3>
                {activeId === "create-ticket" && (
                  <button
                    type="button"
                    onClick={loadCustomFields}
                    disabled={loadingSchema}
                    className="flex items-center gap-1.5 text-xs border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
                    title="Fetch custom fields from GET /v1/tickets/form-schema and inject them into the body"
                  >
                    {loadingSchema ? (
                      <MdRefresh className="animate-spin text-sm" />
                    ) : (
                      <MdDownload className="text-sm" />
                    )}
                    {loadingSchema ? "Loading…" : "Load Custom Fields"}
                  </button>
                )}
              </div>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full bg-gray-900 text-green-400 font-mono text-sm rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ) : endpoint.method === "POST" ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Request Body (JSON)
                </h3>
                {activeId === "create-ticket" && (
                  <button
                    type="button"
                    onClick={loadCustomFields}
                    disabled={loadingSchema}
                    className="flex items-center gap-1.5 text-xs border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
                    title="Fetch custom fields from GET /v1/tickets/form-schema and inject them into the body"
                  >
                    {loadingSchema ? (
                      <MdRefresh className="animate-spin text-sm" />
                    ) : (
                      <MdDownload className="text-sm" />
                    )}
                    {loadingSchema ? "Loading\u2026" : "Load Custom Fields"}
                  </button>
                )}
              </div>
              {activeId === "create-ticket" && !bodyText && !loadingSchema ? (
                <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-400">
                  <MdDownload className="text-2xl mx-auto mb-2" />
                  <p>
                    Click <strong>Load Custom Fields</strong> to generate the
                    body from your project&apos;s form schema.
                  </p>
                  <p className="mt-1 text-xs">
                    Make sure your API key and project are selected above.
                  </p>
                </div>
              ) : (
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="w-full bg-gray-900 text-green-400 font-mono text-sm rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          ) : null}

          {/* Action bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {running ? (
                <MdRefresh className="animate-spin" />
              ) : (
                <MdPlayArrow />
              )}
              {running ? "Runningâ€¦" : "Send Request"}
            </button>
            <button
              onClick={copyCurl}
              className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-100 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {copiedCurl ? (
                <MdCheck className="text-green-500" />
              ) : (
                <MdContentCopy />
              )}
              Copy as cURL
            </button>
          </div>

          {runError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
              <MdWarning className="flex-shrink-0" />
              {runError}
            </div>
          )}

          {/* Response */}
          {response && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
                <span
                  className={`font-mono text-sm font-bold ${statusColor(
                    response.status,
                  )}`}
                >
                  {response.status}
                </span>
                <span className="text-xs text-gray-400">
                  {response.durationMs} ms
                </span>
              </div>
              <pre className="p-4 text-xs font-mono text-gray-800 overflow-x-auto max-h-80 whitespace-pre-wrap break-all">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Share with Vendor Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ShareTab({
  selectedProjectId,
  projectName,
}: {
  selectedProjectId: string;
  projectName: string;
}) {
  const [vendorKey, setVendorKey] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const key = vendorKey.trim() || "<YOUR-API-KEY>";

  const curlExamples = [
    {
      title: "1. Lookup User by Mobile",
      description: "Check if a mobile number is registered in your project.",
      curl: `curl -X GET "${SERVER_BASE}/v1/users/lookup?mobile=9876543210" \\\n  -H "X-API-Key: ${key}" \\\n  -H "X-Project-ID: ${selectedProjectId || "<PROJECT-ID>"}"`,
    },
    {
      title: "2. Create Ticket",
      description:
        "Submit a support ticket from WhatsApp or chatbot on behalf of a user.",
      curl: `curl -X POST "${SERVER_BASE}/v1/tickets" \\\n  -H "X-API-Key: ${key}" \\\n  -H "X-Project-ID: ${selectedProjectId || "<PROJECT-ID>"}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ mobile: "9876543210", message: "I need help with admission", channel: "whatsapp", metadata: {} })}'`,
    },
    {
      title: "3. Find Nearest Centres",
      description: "Get the nearest support centres for a given pincode.",
      curl: `curl -X POST "${SERVER_BASE}/v1/centers/nearest" \\\n  -H "X-API-Key: ${key}" \\\n  -H "X-Project-ID: ${selectedProjectId || "<PROJECT-ID>"}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ pincode: "411001", limit: 5 })}'`,
    },
  ];

  const copyCurl = (idx: number) => {
    navigator.clipboard.writeText(curlExamples[idx].curl).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const handleDownload = () => {
    const projectLabel = projectName || selectedProjectId || "Project";
    const lines: string[] = [
      "=".repeat(64),
      `  SAC Helpdesk â€” Public API Reference`,
      `  Project: ${projectLabel}`,
      `  Generated: ${new Date().toLocaleString()}`,
      "=".repeat(64),
      "",
      "BASE URL",
      "--------",
      `${SERVER_BASE}/v1`,
      "",
      "AUTHENTICATION",
      "--------------",
      "Every request must include these two HTTP headers:",
      `  X-API-Key:    ${key}`,
      `  X-Project-ID: ${selectedProjectId || "<PROJECT-ID>"}`,
      "",
      "RATE LIMITS",
      "-----------",
      "  Lookup User      : 60 requests / minute",
      "  Create Ticket    : 30 requests / minute",
      "  Nearest Centres  : 60 requests / minute",
      "",
      "-".repeat(64),
      "",
      ...curlExamples.flatMap((ex) => [
        ex.title,
        "-".repeat(ex.title.length),
        ex.description,
        "",
        ex.curl,
        "",
        "-".repeat(64),
        "",
      ]),
      "RESPONSE CODES",
      "--------------",
      "  200  OK",
      "  201  Ticket created",
      "  400  Bad request / missing fields",
      "  401  Invalid or missing API key",
      "  403  Project ID mismatch",
      "  404  Project not found",
      "  409  Duplicate ticket (within duplicate window)",
      "  429  Rate limit exceeded",
      "",
      "=".repeat(64),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sac-helpdesk-api-${projectLabel.toLowerCase().replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Pre-fill key */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Embed API Key in examples (optional)
          </label>
          <input
            type="text"
            value={vendorKey}
            onChange={(e) => setVendorKey(e.target.value)}
            placeholder="Paste key to embed in curl commands"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors whitespace-nowrap"
        >
          <MdDownload />
          Download .txt
        </button>
      </div>

      {curlExamples.map((ex, idx) => (
        <div
          key={idx}
          className="bg-white border border-gray-200 rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div>
              <p className="text-sm font-semibold text-gray-800">{ex.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{ex.description}</p>
            </div>
            <button
              onClick={() => copyCurl(idx)}
              className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              {copiedIdx === idx ? (
                <MdCheck className="text-green-500" />
              ) : (
                <MdContentCopy />
              )}
              Copy cURL
            </button>
          </div>
          <pre className="bg-gray-900 text-green-400 font-mono text-xs p-4 overflow-x-auto whitespace-pre-wrap break-all">
            {ex.curl}
          </pre>
        </div>
      ))}
    </div>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// ─── API Reference Tab ──────────────────────────────────────────────────────

const REFERENCE_DOCS = [
  {
    group: "Users",
    endpoints: [
      {
        method: "GET" as const,
        path: "/v1/users/lookup",
        title: "Lookup User",
        description:
          "Check if a mobile number is registered in your project. Always returns HTTP 200 — inspect the `found` boolean.",
        headers: [
          { name: "X-API-Key", required: true, desc: "Your project API key" },
          { name: "X-Project-ID", required: true, desc: "Your project ID" },
        ],
        params: [
          {
            name: "mobile",
            in: "query",
            required: true,
            desc: "10 or 12-digit mobile number",
          },
        ],
        response: `{ "status": "success", "found": true, "user": { "user_id": "...", "name": "Rahul Sharma", "email": "rahul@example.com" } }`,
      },
      {
        method: "POST" as const,
        path: "/v1/users",
        title: "Create / Upsert User",
        description:
          "Create a new user or update an existing one matched by email. The user is automatically linked to this project.",
        headers: [
          { name: "X-API-Key", required: true, desc: "Your project API key" },
          { name: "X-Project-ID", required: true, desc: "Your project ID" },
          { name: "Content-Type", required: true, desc: "application/json" },
        ],
        params: [
          {
            name: "email",
            in: "body",
            required: true,
            desc: "User email (used as unique key)",
          },
          {
            name: "mobile",
            in: "body",
            required: false,
            desc: "10 or 12-digit mobile number",
          },
          {
            name: "firstName",
            in: "body",
            required: false,
            desc: "First name",
          },
          { name: "lastName", in: "body", required: false, desc: "Last name" },
        ],
        response: `{ "status": "success", "user": { "user_id": "...", "email": "...", "first_name": "...", "last_name": "...", "mobile": "..." } }`,
      },
    ],
  },
  {
    group: "Tickets",
    endpoints: [
      {
        method: "GET" as const,
        path: "/v1/tickets/form-schema",
        title: "Get Form Schema",
        description:
          "Returns the form field definitions for this project. Call this before POST /v1/tickets to know which fields to include.",
        headers: [
          { name: "X-API-Key", required: true, desc: "Your project API key" },
          { name: "X-Project-ID", required: true, desc: "Your project ID" },
        ],
        params: [],
        response: `{ "status": "success", "fixed_fields": [{ "key": "name", "label": "Name", "type": "text", "required": true }], "custom_fields": [...] }`,
      },
      {
        method: "POST" as const,
        path: "/v1/tickets",
        title: "Create Ticket",
        description:
          "Submit a support ticket. All form fields from GET /v1/tickets/form-schema are sent as flat top-level properties. Duplicates within the configured window are rejected with HTTP 409.",
        headers: [
          { name: "X-API-Key", required: true, desc: "Your project API key" },
          { name: "X-Project-ID", required: true, desc: "Your project ID" },
          { name: "Content-Type", required: true, desc: "application/json" },
        ],
        params: [
          {
            name: "mobile",
            in: "body",
            required: true,
            desc: "Student mobile number",
          },
          {
            name: "message",
            in: "body",
            required: true,
            desc: "Issue description",
          },
          {
            name: "channel",
            in: "body",
            required: false,
            desc: "whatsapp | chatbot | web (default: api)",
          },
          {
            name: "<form_fields>",
            in: "body",
            required: false,
            desc: "Flat fields from GET /v1/tickets/form-schema",
          },
        ],
        response: `{ "status": "success", "ticket": { "ticketNumber": "TKT-00123", "status": 1, "createdAt": "..." } }`,
      },
      {
        method: "GET" as const,
        path: "/v1/tickets/count",
        title: "Get Ticket Count",
        description:
          "Returns the total number of tickets for this project. Supports optional filters by status, email, or mobile.",
        headers: [
          { name: "X-API-Key", required: true, desc: "Your project API key" },
          { name: "X-Project-ID", required: true, desc: "Your project ID" },
        ],
        params: [
          {
            name: "status",
            in: "query",
            required: false,
            desc: "1=Open 2=In Progress 3=Pending 4=Resolved 5=Closed",
          },
          {
            name: "email",
            in: "query",
            required: false,
            desc: "Filter by student email (partial match)",
          },
          {
            name: "mobile",
            in: "query",
            required: false,
            desc: "Filter by student mobile",
          },
        ],
        response: `{ "status": "success", "project_id": "...", "count": 42 }`,
      },
      {
        method: "GET" as const,
        path: "/v1/tickets/search",
        title: "Search Tickets",
        description:
          "Search tickets by email, mobile, or status with pagination. Returns up to 100 results per page.",
        headers: [
          { name: "X-API-Key", required: true, desc: "Your project API key" },
          { name: "X-Project-ID", required: true, desc: "Your project ID" },
        ],
        params: [
          {
            name: "email",
            in: "query",
            required: false,
            desc: "Filter by student email",
          },
          {
            name: "mobile",
            in: "query",
            required: false,
            desc: "Filter by student mobile",
          },
          { name: "status", in: "query", required: false, desc: "1\u20135" },
          {
            name: "page",
            in: "query",
            required: false,
            desc: "Page number (default: 1)",
          },
          {
            name: "limit",
            in: "query",
            required: false,
            desc: "Results per page (default: 20, max: 100)",
          },
        ],
        response: `{ "status": "success", "pagination": { "total": 100, "page": 1, "limit": 20, "pages": 5 }, "tickets": [{ "ticket_number": "TKT-001", "status": 1, "created_at": "...", "student_name": "..." }] }`,
      },
      {
        method: "GET" as const,
        path: "/v1/tickets/by-number/:ticketNumber",
        title: "Get Ticket by Number",
        description:
          "Fetch complete details of a single ticket — category, assigned agent, student info, and all custom field values.",
        headers: [
          { name: "X-API-Key", required: true, desc: "Your project API key" },
          { name: "X-Project-ID", required: true, desc: "Your project ID" },
        ],
        params: [
          {
            name: "ticketNumber",
            in: "path",
            required: true,
            desc: "e.g. TKT-00123",
          },
        ],
        response: `{ "status": "success", "ticket": { "ticket_number": "TKT-001", "status": 2, "category": "Admission", "assigned_to": { "name": "...", "email": "..." }, "student_email": "...", "custom_fields": { ... } } }`,
      },
    ],
  },
  {
    group: "Centres",
    endpoints: [
      {
        method: "POST" as const,
        path: "/v1/centers/nearest",
        title: "Find Nearest Centres",
        description:
          "Find support centres nearest to a given pincode. Uses Google Distance Matrix when available, falls back to Haversine distance.",
        headers: [
          { name: "X-API-Key", required: true, desc: "Your project API key" },
          { name: "X-Project-ID", required: true, desc: "Your project ID" },
          { name: "Content-Type", required: true, desc: "application/json" },
        ],
        params: [
          {
            name: "pincode",
            in: "body",
            required: true,
            desc: "6-digit Indian pincode",
          },
          {
            name: "limit",
            in: "body",
            required: false,
            desc: "Max centres to return (default: 5)",
          },
        ],
        response: `{ "status": "success", "centres": [{ "name": "...", "address": "...", "distance": 1200, "duration": "4 mins", "maps_url": "..." }] }`,
      },
      {
        method: "POST" as const,
        path: "/v1/centers",
        title: "Create Centre",
        description: "Register a new support centre in this project.",
        headers: [
          { name: "X-API-Key", required: true, desc: "Your project API key" },
          { name: "X-Project-ID", required: true, desc: "Your project ID" },
          { name: "Content-Type", required: true, desc: "application/json" },
        ],
        params: [
          {
            name: "centerName",
            in: "body",
            required: true,
            desc: "Centre name",
          },
          {
            name: "address",
            in: "body",
            required: true,
            desc: "Street address",
          },
          { name: "city", in: "body", required: true, desc: "City" },
          { name: "state", in: "body", required: true, desc: "State" },
          {
            name: "pincode",
            in: "body",
            required: false,
            desc: "6-digit pincode",
          },
          { name: "phone", in: "body", required: false, desc: "Contact phone" },
          { name: "email", in: "body", required: false, desc: "Contact email" },
          {
            name: "latitude",
            in: "body",
            required: false,
            desc: "GPS latitude (decimal)",
          },
          {
            name: "longitude",
            in: "body",
            required: false,
            desc: "GPS longitude (decimal)",
          },
        ],
        response: `{ "status": "success", "center": { "center_id": "...", "center_name": "...", "city": "...", "state": "..." } }`,
      },
    ],
  },
];

function ReferenceTab() {
  const [openCard, setOpenCard] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 text-sm text-indigo-800">
        <p className="font-semibold mb-1">Authentication</p>
        <p>
          Every request must include:{" "}
          <code className="bg-indigo-100 px-1.5 py-0.5 rounded font-mono text-xs">
            X-API-Key: &lt;key&gt;
          </code>{" "}
          and{" "}
          <code className="bg-indigo-100 px-1.5 py-0.5 rounded font-mono text-xs">
            X-Project-ID: &lt;id&gt;
          </code>
          . Generate a key from the <strong>API Keys</strong> tab.
        </p>
        <p className="mt-2 text-xs text-indigo-600">
          Rate limits: 60 req/min for read endpoints &middot; 30 req/min for
          write endpoints
        </p>
      </div>

      {REFERENCE_DOCS.map((group) => (
        <div key={group.group}>
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-5 rounded bg-indigo-500 inline-block" />
            {group.group}
          </h2>
          <div className="space-y-3">
            {group.endpoints.map((ep) => {
              const cardId = ep.path;
              const isOpen = openCard === cardId;
              return (
                <div
                  key={cardId}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden"
                >
                  <button
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                    onClick={() => setOpenCard(isOpen ? null : cardId)}
                  >
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded font-mono flex-shrink-0 ${methodBadge(ep.method)}`}
                    >
                      {ep.method}
                    </span>
                    <code className="text-sm font-mono text-gray-700 flex-shrink-0">
                      {ep.path}
                    </code>
                    <span className="text-sm text-gray-500 flex-1 truncate hidden sm:block">
                      {ep.title}
                    </span>
                    <span className="text-gray-400 text-xs ml-auto flex-shrink-0">
                      {isOpen ? "\u25b2" : "\u25bc"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                      <p className="text-sm text-gray-600">{ep.description}</p>

                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Headers
                        </h4>
                        <div className="bg-gray-50 rounded-lg overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left px-3 py-2 font-semibold text-gray-500">
                                  Name
                                </th>
                                <th className="text-left px-3 py-2 font-semibold text-gray-500">
                                  Required
                                </th>
                                <th className="text-left px-3 py-2 font-semibold text-gray-500">
                                  Description
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {ep.headers.map((h) => (
                                <tr
                                  key={h.name}
                                  className="border-b border-gray-100 last:border-0"
                                >
                                  <td className="px-3 py-2 font-mono text-gray-800">
                                    {h.name}
                                  </td>
                                  <td className="px-3 py-2">
                                    {h.required ? (
                                      <span className="text-red-500 font-medium">
                                        Yes
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">No</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-gray-500">
                                    {h.desc}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {ep.params.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Parameters
                          </h4>
                          <div className="bg-gray-50 rounded-lg overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="text-left px-3 py-2 font-semibold text-gray-500">
                                    Name
                                  </th>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-500">
                                    In
                                  </th>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-500">
                                    Required
                                  </th>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-500">
                                    Description
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {ep.params.map((p) => (
                                  <tr
                                    key={p.name}
                                    className="border-b border-gray-100 last:border-0"
                                  >
                                    <td className="px-3 py-2 font-mono text-gray-800">
                                      {p.name}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                                        {p.in}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      {p.required ? (
                                        <span className="text-red-500 font-medium">
                                          Yes
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">
                                          No
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-gray-500">
                                      {p.desc}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Example Response
                        </h4>
                        <pre className="bg-gray-900 text-green-400 text-xs font-mono rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all">
                          {ep.response}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type Tab = "keys" | "playground" | "share" | "reference";

export default function PublicApiKeysPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("keys");

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await axios.get(
          `${API_CONFIG.API_URL}/projects?limit=100`,
          {
            headers: authHeaders(),
          },
        );
        const d = res.data;
        let list: Project[] = [];
        if (d?.data?.projects && Array.isArray(d.data.projects)) {
          list = d.data.projects;
        } else if (Array.isArray(d?.data)) {
          list = d.data;
        } else if (Array.isArray(d)) {
          list = d;
        }
        setProjects(list);
        const stored = localStorage.getItem("activeProjectId");
        if (stored && list.find((p) => p._id === stored)) {
          setSelectedProjectId(stored);
        } else if (list.length > 0) {
          setSelectedProjectId(list[0]._id);
        }
      } catch {
        setError("Could not load projects.");
      } finally {
        setProjectsLoading(false);
      }
    }
    loadProjects();
  }, []);

  const loadKeys = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `${API_CONFIG.API_URL}/admin/public-api-keys?projectId=${projectId}`,
        { headers: authHeaders() },
      );
      setKeys(res.data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to load API keys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) loadKeys(selectedProjectId);
  }, [selectedProjectId, loadKeys]);

  const handleCreate = async () => {
    if (!selectedProjectId) return;
    setActionLoading("create");
    setError(null);
    try {
      const projectLabel =
        selectedProject?.name ?? `Project ${selectedProjectId.slice(-6)}`;
      const res = await axios.post(
        `${API_CONFIG.API_URL}/admin/public-api-keys`,
        { projectId: selectedProjectId, name: `${projectLabel} API Key` },
        { headers: authHeaders() },
      );
      await loadKeys(selectedProjectId);
      setRevealedKey(res.data?.data?.fullKey ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to create API key.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRotate = async (keyId: string) => {
    setActionLoading(keyId);
    setError(null);
    try {
      const res = await axios.post(
        `${API_CONFIG.API_URL}/admin/public-api-keys/${keyId}/rotate`,
        {},
        { headers: authHeaders() },
      );
      await loadKeys(selectedProjectId);
      setRevealedKey(res.data?.data?.fullKey ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to rotate API key.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (
      !window.confirm(
        "Revoke this API key? Any services using it will stop working immediately.",
      )
    )
      return;
    setActionLoading(keyId);
    setError(null);
    try {
      await axios.patch(
        `${API_CONFIG.API_URL}/admin/public-api-keys/${keyId}/revoke`,
        {},
        { headers: authHeaders() },
      );
      await loadKeys(selectedProjectId);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to revoke API key.");
    } finally {
      setActionLoading(null);
    }
  };

  const selectedProject = projects.find((p) => p._id === selectedProjectId);

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "keys", label: "API Keys", icon: <MdVpnKey /> },
    { id: "playground", label: "Playground", icon: <MdCode /> },
    { id: "share", label: "Share with Vendor", icon: <MdShare /> },
    { id: "reference", label: "API Reference", icon: <MdMenuBook /> },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <MdVpnKey className="text-indigo-600 text-xl" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Public API</h1>
            <p className="text-sm text-gray-500">
              Manage keys, test endpoints, and share docs with vendors
            </p>
          </div>
        </div>

        {/* Project selector */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-5 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600 whitespace-nowrap">
            Project
          </label>
          {projectsLoading ? (
            <div className="h-8 w-56 bg-gray-100 animate-pulse rounded-lg" />
          ) : (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[220px]"
            >
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                  {p.code ? ` (${p.code})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === t.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "keys" && (
          <KeysTab
            keys={keys}
            loading={loading}
            actionLoading={actionLoading}
            error={error}
            selectedProjectId={selectedProjectId}
            onCreate={handleCreate}
            onRotate={handleRotate}
            onRevoke={handleRevoke}
          />
        )}
        {activeTab === "playground" && (
          <PlaygroundTab selectedProjectId={selectedProjectId} />
        )}
        {activeTab === "share" && (
          <ShareTab
            selectedProjectId={selectedProjectId}
            projectName={selectedProject?.name ?? ""}
          />
        )}
        {activeTab === "reference" && <ReferenceTab />}
      </div>

      {revealedKey && (
        <KeyRevealModal
          rawKey={revealedKey}
          onClose={() => setRevealedKey(null)}
        />
      )}
    </DashboardLayout>
  );
}
