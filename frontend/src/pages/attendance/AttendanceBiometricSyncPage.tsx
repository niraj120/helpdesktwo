import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import API_BASE_URL from "../../config/api";
import ModuleHeader from "../../components/ModuleHeader";
import {
  MdSync,
  MdDownload,
  MdEdit,
  MdSave,
  MdClose,
  MdCheckCircle,
  MdError,
  MdRefresh,
  MdSearch,
} from "react-icons/md";

interface Project {
  _id: string;
  name: string;
}

interface Employee {
  userId: string;
  employeeCode: string;
  name: string;
  email: string;
  payrollNumber: number | null;
  biometricSynced: boolean;
  biometricEmployeeId: number | null;
  biometricDeviceId: number | null;
  biometricSyncedAt: string | null;
  biometricSyncError: string | null;
}

interface SyncResult {
  userId: string;
  employeeCode: string;
  status: "success" | "failed";
  aftEmployeeId?: number;
  error?: string;
}

export default function AttendanceBiometricSyncPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [syncStatusFilter, setSyncStatusFilter] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
  });
  const [editingPayroll, setEditingPayroll] = useState<{
    userId: string;
    value: string;
  } | null>(null);
  const [savingPayroll, setSavingPayroll] = useState(false);

  const token = localStorage.getItem("authToken");
  const headers = { Authorization: `Bearer ${token}` };

  // Load projects
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/projects`, { headers })
      .then((r) => {
        const d = r.data?.data;
        setProjects(Array.isArray(d) ? d : (d?.projects ?? []));
      })
      .catch(() => {});
  }, []);

  // Load employees
  const loadEmployees = useCallback(
    async (page = 1) => {
      if (!projectId) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          projectId,
          page: String(page),
          limit: "50",
        });
        if (search) params.set("search", search);
        if (syncStatusFilter) params.set("syncStatus", syncStatusFilter);

        const r = await axios.get(
          `${API_BASE_URL}/attendance/employees?${params}`,
          { headers },
        );
        setEmployees(r.data?.data ?? []);
        setPagination((p) => ({
          ...p,
          page,
          total: r.data?.meta?.total ?? 0,
        }));
      } catch {
        setMessage({ type: "error", text: "Failed to load employees." });
      } finally {
        setLoading(false);
      }
    },
    [projectId, search, syncStatusFilter],
  );

  useEffect(() => {
    setSelectedIds(new Set());
    loadEmployees(1);
  }, [loadEmployees]);

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map((e) => e.userId)));
    }
  };

  const handleBiometricSync = async () => {
    if (selectedIds.size === 0 || !projectId) return;
    setSyncInProgress(true);
    setSyncResults(null);
    setMessage(null);
    try {
      const r = await axios.post(
        `${API_BASE_URL}/attendance/employees/biometric-sync`,
        { projectId, userIds: Array.from(selectedIds) },
        { headers },
      );
      setSyncResults(r.data.results);
      setMessage({
        type: r.data.failed === 0 ? "success" : "error",
        text: `Sync complete: ${r.data.succeeded} succeeded, ${r.data.failed} failed.`,
      });
      loadEmployees(pagination.page);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Sync failed.";
      setMessage({ type: "error", text: msg });
    } finally {
      setSyncInProgress(false);
    }
  };

  const savePayroll = async () => {
    if (!editingPayroll) return;
    setSavingPayroll(true);
    try {
      await axios.patch(
        `${API_BASE_URL}/attendance/employees/${editingPayroll.userId}/payroll`,
        { payrollNumber: Number(editingPayroll.value) },
        { headers },
      );
      setEmployees((prev) =>
        prev.map((e) =>
          e.userId === editingPayroll.userId
            ? { ...e, payrollNumber: Number(editingPayroll.value) }
            : e,
        ),
      );
      setEditingPayroll(null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save payroll number.";
      setMessage({ type: "error", text: msg });
    } finally {
      setSavingPayroll(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!projectId) return;
    const url = `${API_BASE_URL}/attendance/employees/download-csv?projectId=${projectId}`;
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("Authorization", `Bearer ${token}`);
    // Use fetch to download with auth
    fetch(url, { headers })
      .then((res) => res.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        a.download = `employees_${projectId}.csv`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        setMessage({ type: "error", text: "Failed to download CSV." });
      });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <ModuleHeader
        title="Biometric Employee Sync"
        subtitle="Sync employee records to AFT biometric system and manage payroll numbers"
      />

      {/* Project + Filters row */}
      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Project
          </label>
          <select
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">— Select project —</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Sync Status
          </label>
          <select
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={syncStatusFilter}
            onChange={(e) => setSyncStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="synced">Synced</option>
            <option value="not_synced">Not Synced</option>
            <option value="sync_failed">Failed</option>
          </select>
        </div>
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Search
          </label>
          <div className="relative">
            <MdSearch className="absolute left-2 top-2.5 text-gray-400" />
            <input
              type="text"
              className="border border-gray-300 rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Name or employee ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => loadEmployees(pagination.page)}
            className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white hover:bg-gray-50"
          >
            <MdRefresh />
            Refresh
          </button>
          <button
            onClick={handleDownloadCsv}
            disabled={!projectId}
            className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <MdDownload />
            CSV
          </button>
          <button
            onClick={handleBiometricSync}
            disabled={selectedIds.size === 0 || syncInProgress}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <MdSync className={syncInProgress ? "animate-spin" : ""} />
            {syncInProgress ? "Syncing…" : `Sync to AFT (${selectedIds.size})`}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-md text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <MdCheckCircle className="flex-shrink-0" />
          ) : (
            <MdError className="flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {!projectId ? (
        <p className="text-gray-500 text-sm mt-4">
          Select a project to view employees.
        </p>
      ) : loading ? (
        <p className="text-gray-500 text-sm mt-4">Loading employees…</p>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-2">
            {pagination.total} employee{pagination.total !== 1 ? "s" : ""} •{" "}
            {selectedIds.size} selected
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-left w-8">
                    <input
                      type="checkbox"
                      checked={
                        employees.length > 0 &&
                        selectedIds.size === employees.length
                      }
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Employee Name
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Email ID
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Employee ID
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Payroll #
                  </th>
                  <th className="px-3 py-3 text-center font-medium text-gray-700">
                    Sync Status
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Ployee ID
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Synced At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => {
                    const syncResult = syncResults?.find(
                      (r) => r.userId === emp.userId,
                    );
                    return (
                      <tr
                        key={emp.userId}
                        className={`hover:bg-gray-50 ${
                          syncResult?.status === "success"
                            ? "bg-green-50"
                            : syncResult?.status === "failed"
                              ? "bg-red-50"
                              : ""
                        }`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(emp.userId)}
                            onChange={() => toggleSelect(emp.userId)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900">
                            {emp.name}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600">
                          {emp.email || "—"}
                        </td>
                        <td className="px-3 py-3 text-gray-700 font-mono text-xs">
                          {emp.employeeCode || "—"}
                        </td>
                        <td className="px-3 py-3">
                          {editingPayroll?.userId === emp.userId ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                className="border border-gray-300 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={editingPayroll.value}
                                onChange={(e) =>
                                  setEditingPayroll((prev) =>
                                    prev
                                      ? { ...prev, value: e.target.value }
                                      : null,
                                  )
                                }
                                autoFocus
                              />
                              <button
                                onClick={savePayroll}
                                disabled={savingPayroll}
                                className="text-green-600 hover:text-green-800"
                              >
                                <MdSave />
                              </button>
                              <button
                                onClick={() => setEditingPayroll(null)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <MdClose />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span
                                className={
                                  emp.payrollNumber
                                    ? "text-gray-700"
                                    : "text-red-500 italic text-xs"
                                }
                              >
                                {emp.payrollNumber ?? "Not set"}
                              </span>
                              <button
                                onClick={() =>
                                  setEditingPayroll({
                                    userId: emp.userId,
                                    value: String(emp.payrollNumber ?? ""),
                                  })
                                }
                                className="text-gray-400 hover:text-blue-600 ml-1"
                              >
                                <MdEdit className="text-xs" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {emp.biometricSynced ? (
                            <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded">
                              <MdCheckCircle /> Synced
                            </span>
                          ) : emp.biometricSyncError ? (
                            <span
                              className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded cursor-help"
                              title={emp.biometricSyncError}
                            >
                              <MdError /> Failed
                            </span>
                          ) : (
                            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500">
                          {emp.biometricEmployeeId ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500">
                          {emp.biometricSyncedAt
                            ? new Date(emp.biometricSyncedAt).toLocaleString(
                                "en-IN",
                              )
                            : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="mt-3 flex justify-between items-center text-sm text-gray-600">
              <span>
                Page {pagination.page} of{" "}
                {Math.ceil(pagination.total / pagination.limit)}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => loadEmployees(pagination.page - 1)}
                  className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  disabled={
                    pagination.page >=
                    Math.ceil(pagination.total / pagination.limit)
                  }
                  onClick={() => loadEmployees(pagination.page + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
