import React, { useEffect, useState } from "react";
import { srStyles, SR } from "../../utils/srTheme";
import { srButton } from "../../utils/srTheme";
import { api } from "../../utils/api";
import { serviceRequestApi } from "../../services/serviceRequests";

interface Option {
  _id: string;
  name?: string;
  code?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface TemplateRow {
  event: string;
  enabled: boolean;
  subject: string;
  body: string;
  toParent: boolean;
  ccUsers: string[];
  ccRoles: string[];
}

const EVENT_LABELS: Record<string, string> = {
  created: "SR Created",
  status_change: "Status Changed / WIP",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Re-opened",
  reassigned: "Reassigned",
  delegated: "Delegated",
  parent_closed: "Parent Closure",
  cancelled: "Cancelled",
};

const displayName = (u: Option) =>
  `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || u._id;

const getMulti = (s: HTMLSelectElement) =>
  Array.from(s.selectedOptions).map((o) => o.value);

const ServiceRequestNotifications: React.FC<{ projectId: string }> = ({
  projectId,
}) => {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [roles, setRoles] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingEvent, setSavingEvent] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ event: string; text: string } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      serviceRequestApi.getNotificationTemplates(projectId),
      api.get("/roles", { params: { projectId } }).catch(() => ({ data: {} })),
      api
        .get("/users", { params: { project: projectId, isActive: true, limit: 1000 } })
        .catch(() => ({ data: {} })),
    ])
      .then(([tr, rr, ur]) => {
        setRows(Array.isArray(tr?.data) ? tr.data : []);
        setRoles(rr.data?.data || []);
        setUsers(ur.data?.data || []);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const update = (event: string, patch: Partial<TemplateRow>) =>
    setRows((prev) =>
      prev.map((r) => (r.event === event ? { ...r, ...patch } : r)),
    );

  const save = async (row: TemplateRow) => {
    setSavingEvent(row.event);
    setMsg(null);
    try {
      await serviceRequestApi.saveNotificationTemplate({ projectId, ...row });
      setMsg({ event: row.event, text: "Saved ✓" });
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) {
      setMsg({
        event: row.event,
        text: e?.response?.data?.message || "Save failed",
      });
    } finally {
      setSavingEvent(null);
    }
  };

  if (!projectId)
    return (
      <div style={{ ...srStyles.card, color: SR.sub }}>
        Pick a project above to configure notifications.
      </div>
    );
  if (loading)
    return <div style={{ ...srStyles.card, color: SR.sub }}>Loading…</div>;

  return (
    <div>
      <div style={{ ...srStyles.card, marginBottom: 14, color: SR.sub, fontSize: 13 }}>
        Editable notification text per SR lifecycle event. Blank subject/body
        falls back to the built-in default. Placeholders:{" "}
        <code>{"{{ticketNumber}}"}</code>, <code>{"{{subject}}"}</code>,{" "}
        <code>{"{{field.YourFieldName}}"}</code>. CC and "notify parent" are added
        on top of the assignee + watchers.
      </div>

      {rows.map((row) => (
        <div key={row.event} style={{ ...srStyles.card, marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <strong style={{ fontSize: 15, color: SR.text }}>
              {EVENT_LABELS[row.event] || row.event}
            </strong>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 700,
                color: "#374151",
              }}
            >
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => update(row.event, { enabled: e.target.checked })}
              />
              Enabled
            </label>
          </div>

          {row.enabled && (
            <div style={{ marginTop: 12 }}>
              <label style={srLbl}>Title</label>
              <input
                style={srCtrl}
                value={row.subject}
                onChange={(e) => update(row.event, { subject: e.target.value })}
                placeholder="Service Request {{ticketNumber}}"
              />
              <label style={{ ...srLbl, marginTop: 12 }}>Body</label>
              <textarea
                style={{ ...srCtrl, minHeight: 64 }}
                value={row.body}
                onChange={(e) => update(row.event, { body: e.target.value })}
                placeholder="Your request {{ticketNumber}} — {{subject}} has been updated."
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 12,
                  fontSize: 13,
                  color: "#344054",
                }}
              >
                <input
                  type="checkbox"
                  checked={row.toParent}
                  onChange={(e) =>
                    update(row.event, { toParent: e.target.checked })
                  }
                />
                Also notify the parent / requester
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <div>
                  <label style={srLbl}>CC roles</label>
                  <select
                    multiple
                    style={{ ...srCtrl, minHeight: 96 }}
                    value={row.ccRoles}
                    onChange={(e) =>
                      update(row.event, { ccRoles: getMulti(e.currentTarget) })
                    }
                  >
                    {roles.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.name || r.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={srLbl}>CC users</label>
                  <select
                    multiple
                    style={{ ...srCtrl, minHeight: 96 }}
                    value={row.ccUsers}
                    onChange={(e) =>
                      update(row.event, { ccUsers: getMulti(e.currentTarget) })
                    }
                  >
                    {users.map((u) => (
                      <option key={u._id} value={u._id}>
                        {displayName(u)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 14,
            }}
          >
            <button
              onClick={() => save(row)}
              disabled={savingEvent === row.event}
              style={srButton("primary")}
            >
              {savingEvent === row.event ? "Saving…" : "Save"}
            </button>
            {msg?.event === row.event && (
              <span style={{ fontSize: 13, color: "#047857" }}>{msg.text}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const srLbl: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  display: "block",
  marginBottom: 6,
  color: "#475467",
};
const srCtrl: React.CSSProperties = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  border: `1px solid ${SR.inputBorder}`,
  borderRadius: 8,
  boxSizing: "border-box",
  fontSize: 13,
  fontFamily: SR.font,
};

export default ServiceRequestNotifications;
