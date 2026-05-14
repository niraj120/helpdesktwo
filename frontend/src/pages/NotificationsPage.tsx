import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import apiClient from "../utils/api";
import { getNotificationIcon } from "../utils/notificationIcons";
import { relativeTime } from "../utils/relativeTime";
import { INotification } from "../hooks/useNotifications";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterKey = "all" | "unread" | "ticket" | "kb_article";

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface Stats {
  total: number;
  unread: number;
  tickets: number;
  kb: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function buildQuery(filter: FilterKey, page: number): string {
  const params: string[] = [`page=${page}`, `limit=${PAGE_SIZE}`];
  if (filter === "unread") params.push("unread=true");
  if (filter === "ticket") params.push("entityType=ticket");
  if (filter === "kb_article") params.push("entityType=kb_article");
  return params.join("&");
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  accent: string;
  bg: string;
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  accent,
  bg,
  icon,
}) => (
  <div
    style={{
      background: "#fff",
      borderRadius: 10,
      border: "1px solid #E4E7EC",
      boxShadow: "0 1px 3px rgba(0,0,0,.06)",
      padding: "16px 20px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      flex: 1,
      minWidth: 0,
    }}
  >
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
    <div>
      <div
        style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1 }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#667085", marginTop: 3 }}>
        {label}
      </div>
    </div>
  </div>
);

// ── Filter Chip ───────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

const FilterChip: React.FC<ChipProps> = ({ label, active, count, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 14px",
      borderRadius: 999,
      border: active ? "1.5px solid #7F56D9" : "1px solid #E4E7EC",
      background: active ? "#F4F3FF" : "#fff",
      color: active ? "#7F56D9" : "#667085",
      fontWeight: active ? 600 : 400,
      fontSize: 13,
      cursor: "pointer",
      transition: "all 0.15s",
      whiteSpace: "nowrap",
    }}
  >
    {label}
    {count !== undefined && count > 0 && (
      <span
        style={{
          background: active ? "#7F56D9" : "#E4E7EC",
          color: active ? "#fff" : "#667085",
          fontSize: 10,
          fontWeight: 700,
          borderRadius: 999,
          padding: "1px 6px",
          minWidth: 16,
          textAlign: "center",
        }}
      >
        {count}
      </span>
    )}
  </button>
);

// ── Main Page ─────────────────────────────────────────────────────────────────

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<INotification[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [stats, setStats] = useState<Stats>({
    total: 0,
    unread: 0,
    tickets: 0,
    kb: 0,
  });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  // ── Load stats once on mount ───────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const [totalRes, unreadRes, ticketRes, kbRes] = await Promise.all([
        apiClient.get("/notifications?page=1&limit=1"),
        apiClient.get("/notifications/unread-count"),
        apiClient.get("/notifications?page=1&limit=1&entityType=ticket"),
        apiClient.get("/notifications?page=1&limit=1&entityType=kb_article"),
      ]);
      setStats({
        total: totalRes.data?.pagination?.total ?? 0,
        unread: unreadRes.data?.data?.count ?? 0,
        tickets: ticketRes.data?.pagination?.total ?? 0,
        kb: kbRes.data?.pagination?.total ?? 0,
      });
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── Load page data ─────────────────────────────────────────────────────────

  const loadNotifications = useCallback(async (f: FilterKey, p: number) => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/notifications?${buildQuery(f, p)}`);
      setNotifications(res.data?.data ?? []);
      if (res.data?.pagination) setPagination(res.data.pagination);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications(filter, currentPage);
  }, [filter, currentPage, loadNotifications]);

  // ── Filter change resets to page 1 ────────────────────────────────────────

  const handleFilterChange = (f: FilterKey) => {
    setFilter(f);
    setCurrentPage(1);
  };

  // ── Mark one read ──────────────────────────────────────────────────────────

  const handleRowClick = async (notif: INotification) => {
    if (!notif.isRead) {
      try {
        await apiClient.patch(`/notifications/${notif._id}/read`);
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === notif._id
              ? { ...n, isRead: true, readAt: new Date().toISOString() }
              : n,
          ),
        );
        setStats((s) => ({ ...s, unread: Math.max(0, s.unread - 1) }));
      } catch {
        // non-fatal
      }
    }
    if (notif.deepLinkUrl) {
      const relative = notif.deepLinkUrl.startsWith("http")
        ? notif.deepLinkUrl.replace(window.location.origin, "")
        : notif.deepLinkUrl;

      const path = window.location.pathname;
      const ticketIdMatch = relative.match(/\/projects\/[^/]+\/tickets\/([a-f0-9]+)/i);
      const kbIdMatch = relative.match(/^\/kb\/([a-f0-9]+)/i);
      const ticketId = ticketIdMatch?.[1];
      const kbId = kbIdMatch?.[1];

      let resolved = relative;

      // Portal context: /:customUrlPath/portal/...
      const portalMatch = path.match(/^\/([a-z0-9_-]+)\/portal(?:\/|$)/i);
      if (portalMatch) {
        const p = portalMatch[1];
        if (kbId) resolved = `/${p}/portal/kb-new/viewer?articleId=${kbId}`;
        else if (ticketId) resolved = `/${p}/portal/ticket/${ticketId}`;
      }
      // Student context: /:customUrlPath/student/...
      else if (path.match(/^\/([a-z0-9_-]+)\/student(?:\/|$)/i)) {
        const p = path.match(/^\/([a-z0-9_-]+)\/student/i)![1];
        if (kbId) resolved = `/${p}/kb-new/viewer?articleId=${kbId}`;
        else if (ticketId) resolved = `/${p}/student/ticket/${ticketId}`;
      }
      // Legacy student context: /:customUrlPath/(kb|kb-new|submit-ticket|faq|find-center)
      else if (path.match(/^\/([a-z0-9_-]+)\/(kb|kb-new|submit-ticket|faq|find-center)/i)) {
        const p = path.match(/^\/([a-z0-9_-]+)\//i)![1];
        if (kbId) resolved = `/${p}/kb-new/viewer?articleId=${kbId}`;
        else if (ticketId) resolved = `/${p}/student/ticket/${ticketId}`;
      }
      // Admin/Superadmin context
      else {
        if (ticketId) resolved = `/tickets/${ticketId}`;
        // KB: /kb/:articleId is already the admin route — use relative as-is
      }

      navigate(resolved);
    }
  };

  // ── Mark all read ──────────────────────────────────────────────────────────

  const handleMarkAllRead = async () => {
    try {
      setMarkingAll(true);
      await apiClient.post("/notifications/read-all");
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          isRead: true,
          readAt: new Date().toISOString(),
        })),
      );
      setStats((s) => ({ ...s, unread: 0 }));
    } catch {
      // non-fatal
    } finally {
      setMarkingAll(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const showingFrom =
    pagination.total > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = Math.min(currentPage * PAGE_SIZE, pagination.total);

  return (
    <DashboardLayout>
      <div
        style={{
          background: "#F8F9FC",
          minHeight: "100vh",
          padding: "24px 28px",
        }}
      >
        {/* ── Header Card ──────────────────────────────────────────────────── */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #E4E7EC",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: "#101828",
              }}
            >
              Notifications
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#667085" }}>
              Your recent updates and alerts
            </p>
          </div>
          {stats.unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "1.5px solid #7F56D9",
                background: "#fff",
                color: "#7F56D9",
                fontWeight: 600,
                fontSize: 13,
                cursor: markingAll ? "not-allowed" : "pointer",
                opacity: markingAll ? 0.7 : 1,
              }}
            >
              {markingAll ? "Marking…" : "Mark all as read"}
            </button>
          )}
        </div>

        {/* ── Stats Row ────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <StatCard
            label="Total"
            value={stats.total}
            accent="#101828"
            bg="#F2F4F7"
            icon={
              <svg
                style={{ width: 18, height: 18, color: "#667085" }}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                />
              </svg>
            }
          />
          <StatCard
            label="Unread"
            value={stats.unread}
            accent="#DC2626"
            bg="#FEF2F2"
            icon={
              <svg
                style={{ width: 18, height: 18, color: "#DC2626" }}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 9v.906a2.25 2.25 0 0 1-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 0 0 1.183 1.981l6.478 3.488m8.839 2.51-4.66-2.51m0 0-1.023-.55a2.25 2.25 0 0 0-2.134 0l-1.022.55m0 0-4.661 2.51m16.5 1.615a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V8.844a2.25 2.25 0 0 1 1.183-1.981l7.5-4.04a2.25 2.25 0 0 1 2.134 0l7.5 4.04a2.25 2.25 0 0 1 1.183 1.98V19.5Z"
                />
              </svg>
            }
          />
          <StatCard
            label="Tickets"
            value={stats.tickets}
            accent="#175CD3"
            bg="#EFF8FF"
            icon={
              <svg
                style={{ width: 18, height: 18, color: "#175CD3" }}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z"
                />
              </svg>
            }
          />
          <StatCard
            label="KB Articles"
            value={stats.kb}
            accent="#B54708"
            bg="#FFF6ED"
            icon={
              <svg
                style={{ width: 18, height: 18, color: "#B54708" }}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
                />
              </svg>
            }
          />
        </div>

        {/* ── Main Card ────────────────────────────────────────────────────── */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #E4E7EC",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            overflow: "hidden",
          }}
        >
          {/* Filter bar */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #F2F4F7",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <FilterChip
              label="All"
              active={filter === "all"}
              count={stats.total}
              onClick={() => handleFilterChange("all")}
            />
            <FilterChip
              label="Unread"
              active={filter === "unread"}
              count={stats.unread}
              onClick={() => handleFilterChange("unread")}
            />
            <FilterChip
              label="Tickets"
              active={filter === "ticket"}
              count={stats.tickets}
              onClick={() => handleFilterChange("ticket")}
            />
            <FilterChip
              label="KB Articles"
              active={filter === "kb_article"}
              count={stats.kb}
              onClick={() => handleFilterChange("kb_article")}
            />
          </div>

          {/* Table */}
          {loading ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "#98A2B3",
                fontSize: 14,
              }}
            >
              Loading notifications…
            </div>
          ) : notifications.length === 0 ? (
            <div
              style={{
                padding: "64px 24px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔔</div>
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#344054",
                  margin: "0 0 4px",
                }}
              >
                {filter === "unread"
                  ? "You're all caught up!"
                  : "No notifications yet"}
              </p>
              <p style={{ fontSize: 13, color: "#667085", margin: 0 }}>
                {filter === "unread"
                  ? "All notifications have been read."
                  : "Notifications will appear here when there's activity."}
              </p>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 1fr 100px 110px 60px",
                  padding: "10px 20px",
                  background: "#F9FAFB",
                  borderBottom: "1px solid #F2F4F7",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#667085",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                <div />
                <div>Notification</div>
                <div>Type</div>
                <div>Time</div>
                <div>Status</div>
              </div>

              {/* Rows */}
              {notifications.map((notif) => {
                const iconCfg = getNotificationIcon(notif.triggerType);
                const entityLabel =
                  notif.entityType === "ticket"
                    ? "Ticket"
                    : notif.entityType === "kb_article"
                      ? "KB Article"
                      : "Comment";

                return (
                  <button
                    key={notif._id}
                    onClick={() => handleRowClick(notif)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "48px 1fr 100px 110px 60px",
                      alignItems: "center",
                      width: "100%",
                      padding: "14px 20px",
                      border: "none",
                      borderBottom: "1px solid #F9FAFB",
                      borderLeft: notif.isRead
                        ? "3px solid transparent"
                        : "3px solid #F59E0B",
                      background: notif.isRead ? "#fff" : "#FFFBEB",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.12s",
                      gap: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "#F9F5FF";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        notif.isRead ? "#fff" : "#FFFBEB";
                    }}
                  >
                    {/* Icon */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: iconCfg.bg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {iconCfg.icon}
                      </span>
                    </div>

                    {/* Title + body */}
                    <div style={{ minWidth: 0, paddingRight: 16 }}>
                      <p
                        style={{
                          margin: "0 0 2px",
                          fontSize: 13,
                          fontWeight: notif.isRead ? 400 : 600,
                          color: "#101828",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {notif.title}
                      </p>
                      {notif.body && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            color: "#667085",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {notif.body}
                        </p>
                      )}
                    </div>

                    {/* Entity type chip */}
                    <div>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 500,
                          background:
                            notif.entityType === "ticket"
                              ? "#EFF8FF"
                              : notif.entityType === "kb_article"
                                ? "#FFF6ED"
                                : "#F2F4F7",
                          color:
                            notif.entityType === "ticket"
                              ? "#175CD3"
                              : notif.entityType === "kb_article"
                                ? "#B54708"
                                : "#667085",
                        }}
                      >
                        {entityLabel}
                      </span>
                    </div>

                    {/* Time */}
                    <div
                      style={{
                        fontSize: 12,
                        color: "#98A2B3",
                      }}
                    >
                      {relativeTime(notif.createdAt)}
                    </div>

                    {/* Status */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      {notif.isRead ? (
                        <span style={{ fontSize: 11, color: "#98A2B3" }}>
                          Read
                        </span>
                      ) : (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#F59E0B",
                            display: "inline-block",
                          }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* ── Pagination ─────────────────────────────────────────────────── */}
          {!loading && pagination.totalPages > 1 && (
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid #F2F4F7",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 13,
                color: "#667085",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setCurrentPage((p) => p - 1)}
                  disabled={!pagination.hasPrevPage}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "1px solid #D0D5DD",
                    background: !pagination.hasPrevPage ? "#F3F4F6" : "#fff",
                    color: !pagination.hasPrevPage ? "#9CA3AF" : "#374151",
                    cursor: !pagination.hasPrevPage ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  ← Previous
                </button>
                <span style={{ padding: "0 8px" }}>
                  Page {currentPage} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!pagination.hasNextPage}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "1px solid #D0D5DD",
                    background: !pagination.hasNextPage ? "#F3F4F6" : "#fff",
                    color: !pagination.hasNextPage ? "#9CA3AF" : "#374151",
                    cursor: !pagination.hasNextPage ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Next →
                </button>
              </div>
              <div>
                Showing {showingFrom}–{showingTo} of {pagination.total}{" "}
                notifications
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NotificationsPage;
