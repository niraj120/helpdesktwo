import { useEffect, useState } from "react";
import { XMarkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
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
  "custom",
];

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

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    connected: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    untested: "bg-gray-100 text-gray-600",
  };
  return map[status] || map.untested;
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

  const addApi = () =>
    setEdit((e) => ({ ...e, apis: [...e.apis, emptyApi()] }));

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
    "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center rounded-t-lg">
            <div>
              <h2 className="text-lg font-bold text-gray-800">
                🗄️ MDM Master — Data Sources
              </h2>
              <p className="text-xs text-gray-500">
                Company master database connections (global, shared across all
                projects)
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            )}

            {view === "list" && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-gray-600">
                    {loading ? "Loading…" : `${sources.length} source(s)`}
                  </span>
                  {canManage && (
                    <button
                      onClick={startCreate}
                      className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700"
                    >
                      <PlusIcon className="w-4 h-4" /> Add Source
                    </button>
                  )}
                </div>

                {!loading && sources.length === 0 && (
                  <div className="text-center text-gray-400 py-10 text-sm">
                    No MDM sources configured yet.
                  </div>
                )}

                <div className="space-y-3">
                  {sources.map((s) => (
                    <div
                      key={s._id}
                      className="border rounded-lg p-4 flex justify-between items-start"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">
                            {s.name}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(
                              s.connectionStatus,
                            )}`}
                          >
                            {s.connectionStatus}
                          </span>
                          {!s.enabled && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              disabled
                            </span>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-xs text-gray-500 mt-1">
                            {s.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {s.apis.length} endpoint(s):{" "}
                          {s.apis.map((a) => a.dataType).join(", ") || "—"}
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(s)}
                            className="text-blue-600 text-sm hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(s)}
                            className="text-red-600 text-sm hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === "edit" && (
              <div className="space-y-5">
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
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={edit.enabled}
                        onChange={(e) =>
                          setEdit({ ...edit, enabled: e.target.checked })
                        }
                      />
                      Enabled
                    </label>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Description</label>
                  <input
                    className={inputCls}
                    value={edit.description}
                    onChange={(e) =>
                      setEdit({ ...edit, description: e.target.value })
                    }
                  />
                </div>

                {/* Auth */}
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Authentication
                  </h3>
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
                              <span className="text-green-600">
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
                            <span className="text-green-600">
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
                                auth: {
                                  ...edit.auth,
                                  username: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className={labelCls}>
                            Password{" "}
                            {edit.auth.hasPassword && (
                              <span className="text-green-600">(set)</span>
                            )}
                          </label>
                          <input
                            type="password"
                            className={inputCls}
                            value={edit.auth.password || ""}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                auth: {
                                  ...edit.auth,
                                  password: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* APIs */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">
                      API Endpoints
                    </h3>
                    <button
                      onClick={addApi}
                      className="inline-flex items-center gap-1 text-blue-600 text-sm hover:underline"
                    >
                      <PlusIcon className="w-4 h-4" /> Add API
                    </button>
                  </div>

                  <div className="space-y-3">
                    {edit.apis.map((api, idx) => {
                      const result = testResults[idx];
                      return (
                        <div key={idx} className="border rounded-lg p-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={labelCls}>Label</label>
                              <input
                                className={inputCls}
                                value={api.label}
                                onChange={(e) =>
                                  updateApi(idx, { label: e.target.value })
                                }
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
                            <div>
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
                            <div className="flex items-end justify-between">
                              <label className="flex items-center gap-2 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={api.isDefaultForType}
                                  onChange={(e) =>
                                    updateApi(idx, {
                                      isDefaultForType: e.target.checked,
                                    })
                                  }
                                />
                                Default for type
                              </label>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleTest(idx)}
                                  disabled={testing === idx}
                                  className="text-xs bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-800 disabled:opacity-50"
                                >
                                  {testing === idx ? "Testing…" : "Test"}
                                </button>
                                {edit.apis.length > 1 && (
                                  <button
                                    onClick={() => removeApi(idx)}
                                    className="text-red-500"
                                  >
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Project mapping — which projects this endpoint serves */}
                          <div className="mt-3 border-t pt-3">
                            <label className={labelCls}>
                              Map to Projects{" "}
                              <span className="text-gray-400 font-normal">
                                (none selected = all projects)
                              </span>
                            </label>
                            {projects.length === 0 ? (
                              <p className="text-xs text-gray-400">
                                No projects available.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {projects.map((p) => {
                                  const selected = api.projectIds.includes(p._id);
                                  return (
                                    <button
                                      key={p._id}
                                      type="button"
                                      onClick={() =>
                                        updateApi(idx, {
                                          projectIds: selected
                                            ? api.projectIds.filter(
                                                (id) => id !== p._id,
                                              )
                                            : [...api.projectIds, p._id],
                                        })
                                      }
                                      className={`text-xs px-2 py-1 rounded-full border ${
                                        selected
                                          ? "bg-blue-600 text-white border-blue-600"
                                          : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                                      }`}
                                    >
                                      {p.name}
                                      {p.code ? ` (${p.code})` : ""}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {result && (
                            <div
                              className={`mt-2 p-2 rounded text-xs ${
                                result.success
                                  ? "bg-green-50 text-green-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                            >
                              {result.success
                                ? `✅ OK (HTTP ${result.status}) — ${result.count} record(s). Sample: ${JSON.stringify(
                                    result.sampleData,
                                  ).slice(0, 160)}`
                                : `❌ ${result.error}`}
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
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={() => setView("list")}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !canManage}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
