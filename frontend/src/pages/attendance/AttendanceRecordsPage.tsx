import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import API_BASE_URL from "../../config/api";
import ModuleHeader from "../../components/ModuleHeader";
import { MdRefresh, MdSearch, MdCalendarToday } from "react-icons/md";

interface Project {
  _id: string;
  name: string;
}

interface AttendanceRecord {
  _id: string;
  userId: string;
  attendanceDate: string;
  employee_id?: string;
  employeeName?: string | null;
  punch_in?: string | null;
  punch_out?: string | null;
  total_working_hours?: string | null;
  status?: string;
  center?: string | null;
  geo?: { lat: number; long: number } | null;
  published?: boolean | null;
}

interface Summary {
  byStatus: Record<string, number>; // dynamic — any status code from biometric partner
  totalRecords: number;
  minDate: string | null;
  maxDate: string | null;
  uniqueEmployeeCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  P: "Present",
  PL: "Present Late",
  H: "Holiday",
  LWP: "Leave Without Pay",
  A: "Absent",
  CL: "Casual Leave",
  SL: "Sick Leave",
  EL: "Earned Leave",
  AL: "Annual Leave",
  ML: "Maternity Leave",
  CO: "Comp Off",
  OD: "On Duty",
  WFH: "Work From Home",
  HD: "Half Day",
};

const STATUS_COLORS: Record<string, string> = {
  P: "bg-green-100 text-green-800",
  PL: "bg-yellow-100 text-yellow-800",
  H: "bg-blue-100 text-blue-800",
  LWP: "bg-red-100 text-red-800",
  A: "bg-rose-100 text-rose-800",
  CL: "bg-purple-100 text-purple-800",
  SL: "bg-orange-100 text-orange-800",
  EL: "bg-amber-100 text-amber-800",
  AL: "bg-amber-100 text-amber-800",
  ML: "bg-pink-100 text-pink-800",
  CO: "bg-teal-100 text-teal-800",
  OD: "bg-cyan-100 text-cyan-800",
  WFH: "bg-sky-100 text-sky-800",
  HD: "bg-lime-100 text-lime-800",
};

export default function AttendanceRecordsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    status: "",
    center: "",
  });
  const [search] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
  });

  const token = localStorage.getItem("authToken");
  const headers = { Authorization: `Bearer ${token}` };

  // Load projects
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/projects?limit=100`, { headers })
      .then((r) => {
        const d = r.data?.data;
        setProjects(Array.isArray(d) ? d : (d?.projects ?? []));
      })
      .catch(() => {});
  }, []);

  // Load records
  const loadRecords = useCallback(
    async (page = 1) => {
      if (!projectId) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          projectId,
          page: String(page),
          limit: "50",
        });
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.status) params.set("status", filters.status);
        if (filters.center) params.set("center", filters.center);

        const r = await axios.get(
          `${API_BASE_URL}/attendance/records?${params}`,
          { headers },
        );
        setRecords(r.data?.data ?? []);
        setPagination((p) => ({
          ...p,
          page,
          total: r.data?.meta?.total ?? 0,
        }));
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [projectId, filters],
  );

  // Load summary
  const loadSummary = useCallback(async () => {
    if (!projectId) return;
    setSummaryLoading(true);
    try {
      const params = new URLSearchParams({ projectId });
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      if (filters.center) params.set("center", filters.center);

      const r = await axios.get(
        `${API_BASE_URL}/attendance/records/summary?${params}`,
        { headers },
      );
      setSummary(r.data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [projectId, filters]);

  useEffect(() => {
    loadRecords(1);
    loadSummary();
  }, [loadRecords, loadSummary]);

  const applyFilters = () => {
    loadRecords(1);
    loadSummary();
  };

  const formatTime = (val: string | null | undefined) => {
    if (!val) return "—";
    try {
      return new Date(val).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return val;
    }
  };

  const formatDate = (val: string) => {
    try {
      return new Date(val).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return val;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ModuleHeader
        title="Attendance Records"
        subtitle="View and filter attendance data synced from AFT biometric system"
      />

      {/* Filters */}
      <div className="mb-4 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
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
              From Date
            </label>
            <input
              type="date"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateFrom: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              type="date"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateTo: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value }))
              }
            >
              <option value="">All</option>
              {Object.entries(STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {code} — {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Offline Center
            </label>
            <div className="relative">
              <MdSearch className="absolute left-2 top-2.5 text-gray-400" />
              <input
                type="text"
                className="border border-gray-300 rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Filter by offline center"
                value={filters.center}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, center: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex gap-2 mt-auto">
            <button
              onClick={applyFilters}
              disabled={!projectId}
              className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              <MdSearch />
              Search
            </button>
            <button
              onClick={() => loadRecords(pagination.page)}
              className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white hover:bg-gray-50"
            >
              <MdRefresh />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && !summaryLoading && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div
            className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
            style={{ minWidth: 180 }}
          >
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <MdCalendarToday /> Date Range
            </div>
            <div className="text-sm font-medium text-gray-800">
              {summary.minDate ? formatDate(summary.minDate) : "—"} —{" "}
              {summary.maxDate ? formatDate(summary.maxDate) : "—"}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.uniqueEmployeeCount} employees, {summary.totalRecords}{" "}
              records
            </div>
          </div>
          {Object.entries(summary.byStatus)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([code, count]) => (
              <div
                key={code}
                className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
                style={{ minWidth: 110 }}
              >
                <div className="text-xs text-gray-500 mb-1">
                  {STATUS_LABELS[code] ?? code}
                </div>
                <div className="text-2xl font-bold text-gray-900">{count}</div>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    STATUS_COLORS[code] ?? "bg-gray-100 text-gray-800"
                  }`}
                >
                  {code}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Records Table */}
      {!projectId ? (
        <p className="text-gray-500 text-sm">
          Select a project to view attendance records.
        </p>
      ) : loading ? (
        <p className="text-gray-500 text-sm">Loading records…</p>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-2">
            {pagination.total} record{pagination.total !== 1 ? "s" : ""}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Date
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Employee ID
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Name
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Punch In
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Punch Out
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Hours
                  </th>
                  <th className="px-3 py-3 text-center font-medium text-gray-700">
                    Status
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">
                    Offline Center
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No attendance records found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => (
                    <tr key={rec._id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                        {formatDate(rec.attendanceDate)}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-gray-700">
                        {rec.employee_id ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-800 text-sm">
                        {rec.employeeName ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {formatTime(rec.punch_in)}
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {formatTime(rec.punch_out)}
                      </td>
                      <td className="px-3 py-3 text-gray-700 font-mono text-xs">
                        {rec.total_working_hours ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {rec.status ? (
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[rec.status] ?? "bg-gray-100 text-gray-800"}`}
                            title={STATUS_LABELS[rec.status]}
                          >
                            {rec.status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-600 text-xs">
                        {rec.center ?? "—"}
                      </td>
                    </tr>
                  ))
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
                  onClick={() => loadRecords(pagination.page - 1)}
                  className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  disabled={
                    pagination.page >=
                    Math.ceil(pagination.total / pagination.limit)
                  }
                  onClick={() => loadRecords(pagination.page + 1)}
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
