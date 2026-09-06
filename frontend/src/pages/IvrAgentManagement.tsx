import React, { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/ui/PageHeader";
import { tokens, styles, button } from "../theme/oneos";
import { useProjectContext } from "../contexts/ProjectContext";
import { api } from "../utils/api";
import { ivrAgentApi } from "../services/ivrAgents";
import { serviceRequestApi } from "../services/serviceRequests";
import { usePermissions } from "../hooks/usePermissions";
import { PERMISSIONS } from "../constants/permissions";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}
interface Digit {
  code: string;
  label: string;
}
interface Leave {
  _id: string;
  fromDate: string;
  toDate: string;
  reason?: string;
}
interface Agent {
  userId: string;
  name: string;
  email: string;
  mobile?: string;
  isActive: boolean;
  digits: string[];
  active: boolean;
  available: boolean;
  unavailableUntil?: string | null;
  availableNow: boolean;
  onLeave: boolean;
  leaves: Leave[];
}

const OTHER = "other";

const IvrAgentManagement: React.FC = () => {
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");

  // Call-back ladder (WIP steps + TAT). The manager owns this policy; agents
  // only pick a step from it when logging a call-back.
  const { hasPermission } = usePermissions();
  const canConfigureTat = hasPermission(PERMISSIONS.IVR_TAT_CONFIG);
  const [tatTiers, setTatTiers] = useState<
    { level?: number; label: string; tatHours: number; isActive: boolean }[]
  >([]);
  const [tatEnabled, setTatEnabled] = useState(true);
  const [tatSaving, setTatSaving] = useState(false);
  const [tatMsg, setTatMsg] = useState<string | null>(null);
  const [digits, setDigits] = useState<Digit[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [leaveFor, setLeaveFor] = useState<Agent | null>(null);
  const [digitEdit, setDigitEdit] = useState<Digit[] | null>(null);
  const [breakFor, setBreakFor] = useState<string | null>(null);
  const [breakTime, setBreakTime] = useState("");
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/projects", { params: { limit: 100 } });
        const d: any = res.data;
        const list = d?.data?.projects || d?.projects || d?.data || d || [];
        setProjects(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const load = async () => {
    if (!projectId) {
      setDigits([]);
      setAgents([]);
      return;
    }
    try {
      const [dc, al] = await Promise.all([
        ivrAgentApi.getDigits(projectId),
        ivrAgentApi.list(projectId),
      ]);
      setDigits(dc.digits || []);
      setAgents(al.agents || []);
    } catch (e: any) {
      setMsg({ type: "err", text: e?.response?.data?.message || "Load failed" });
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setTatTiers([]);
      return;
    }
    (async () => {
      try {
        const r = await serviceRequestApi.ivr.callbackTat(projectId);
        setTatTiers(
          (r?.data?.tiers || []).map((t: any) => ({
            level: t.level,
            label: t.label,
            tatHours: t.tatHours,
            isActive: true,
          })),
        );
        setTatEnabled(r?.data?.enabled !== false);
      } catch (e) {
        console.error(e);
        setTatTiers([]);
      }
    })();
  }, [projectId]);

  const saveTat = async () => {
    setTatSaving(true);
    setTatMsg(null);
    try {
      const r = await serviceRequestApi.ivr.saveCallbackTat({
        projectId,
        enabled: tatEnabled,
        tiers: tatTiers.map((t) => ({
          label: t.label,
          tatHours: Number(t.tatHours),
          isActive: t.isActive,
        })),
      });
      setTatTiers(
        (r?.data?.tiers || []).map((t: any) => ({
          level: t.level,
          label: t.label,
          tatHours: t.tatHours,
          isActive: true,
        })),
      );
      setTatMsg("Call-back steps saved.");
    } catch (e: any) {
      setTatMsg(e?.response?.data?.message || "Could not save the steps.");
    } finally {
      setTatSaving(false);
    }
  };

  const buckets = useMemo(
    () => [...digits.map((d) => d.code), OTHER],
    [digits],
  );

  const flash = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 2500);
  };

  const toggleDigit = async (agent: Agent, code: string) => {
    const next = agent.digits.includes(code)
      ? agent.digits.filter((c) => c !== code)
      : [...agent.digits, code];
    setAgents((prev) =>
      prev.map((a) => (a.userId === agent.userId ? { ...a, digits: next } : a)),
    );
    try {
      await ivrAgentApi.setMapping(agent.userId, {
        projectId,
        digits: next,
        active: agent.active,
      });
    } catch (e: any) {
      flash("err", "Save failed");
      load();
    }
  };

  const toggleActive = async (agent: Agent) => {
    const next = !agent.active;
    setAgents((prev) =>
      prev.map((a) => (a.userId === agent.userId ? { ...a, active: next } : a)),
    );
    try {
      await ivrAgentApi.setMapping(agent.userId, {
        projectId,
        digits: agent.digits,
        active: next,
      });
    } catch {
      flash("err", "Save failed");
      load();
    }
  };

  const setAvail = async (
    a: Agent,
    available: boolean,
    until?: string | null,
  ) => {
    setBreakFor(null);
    setBreakTime("");
    setAgents((prev) =>
      prev.map((x) =>
        x.userId === a.userId
          ? {
              ...x,
              available,
              unavailableUntil: until || null,
              availableNow:
                available || (!!until && new Date(until) <= new Date()),
            }
          : x,
      ),
    );
    try {
      await ivrAgentApi.setAvailability(a.userId, {
        projectId,
        available,
        unavailableUntil: until || null,
      });
    } catch {
      flash("err", "Save failed");
      load();
    }
  };

  const goBreakTill = (a: Agent) => {
    if (!breakTime) return flash("err", "Pick a time");
    const [h, m] = breakTime.split(":").map(Number);
    const until = new Date();
    until.setHours(h, m, 0, 0);
    setAvail(a, false, until.toISOString());
  };

  const breakForMins = (a: Agent, mins: number) =>
    setAvail(a, false, new Date(Date.now() + mins * 60000).toISOString());

  const openMenu = (userId: string, e: React.MouseEvent) => {
    if (breakFor === userId) {
      setBreakFor(null);
      setMenuPos(null);
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ top: r.bottom + 6, left: Math.max(8, r.right - 220) });
    setBreakTime("");
    setBreakFor(userId);
  };
  const closeMenu = () => {
    setBreakFor(null);
    setMenuPos(null);
  };

  const fmtTime = (d?: string | null) =>
    d
      ? new Date(d).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  const menuCard: React.CSSProperties = {
    position: "fixed",
    zIndex: 2000,
    background: "#fff",
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    boxShadow: "0 12px 32px rgba(15,23,42,.16)",
    width: 220,
    padding: 6,
    textAlign: "left",
  };
  const menuItem: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 8,
    border: "none",
    background: "none",
    fontSize: 13,
    fontWeight: 500,
    color: "#334155",
    cursor: "pointer",
  };
  const menuLabel: React.CSSProperties = {
    padding: "6px 10px 2px",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: tokens.muted,
  };

  const availPill: React.CSSProperties = {
    padding: "3px 10px",
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
  };
  const miniBtn: React.CSSProperties = {
    padding: "3px 8px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: "#fff",
    fontSize: 11,
    fontWeight: 600,
    color: "#334155",
    cursor: "pointer",
  };

  const digitLabel = (code: string) =>
    code === OTHER
      ? "Other"
      : digits.find((d) => d.code === code)?.label || code;

  const th = styles.th;
  const td = styles.td;

  return (
    <DashboardLayout>
      <div style={{ ...styles.page, maxWidth: "none" }}>
        <PageHeader
          title="IVR Agents"
          subtitle="Assign IVR agents to digit buckets. Missed calls are round-robined within a bucket, skipping agents on leave."
          actions={
            <button
              onClick={() => setDigitEdit(digits.map((d) => ({ ...d })))}
              style={button("neutral")}
              disabled={!projectId}
            >
              ⚙ Configure digits
            </button>
          }
        />

        {msg && (
          <div
            style={{
              ...styles.card,
              padding: "10px 14px",
              color: msg.type === "ok" ? tokens.success : tokens.danger,
              fontSize: 13,
            }}
          >
            {msg.text}
          </div>
        )}

        {/* Project picker */}
        <div style={{ ...styles.card, display: "flex", gap: 12, alignItems: "center" }}>
          <label style={styles.label}>Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={{ ...styles.ctrl, minWidth: 280 }}
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
                {p.code ? ` (${p.code})` : ""}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: tokens.sub, marginLeft: "auto" }}>
            Buckets: {digits.map((d) => d.code).join(", ") || "—"}, other
          </span>
        </div>

        {/* Call-back TAT ladder — the IVR manager's policy. Agents choose a
            step from this list when logging a call-back; the TAT on the step
            sets when the call-back is due, so agents never type a date. */}
        {canConfigureTat && projectId && (
          <div style={{ ...styles.card, marginBottom: 16, padding: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                Call-back TAT
              </h3>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: tokens.sub,
                }}
              >
                <input
                  type="checkbox"
                  checked={tatEnabled}
                  onChange={(e) => setTatEnabled(e.target.checked)}
                />
                Enabled
              </label>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: tokens.sub }}>
              An agent picks how soon to chase a missed call again; the TAT here
              decides when it falls due. Steps are numbered in order — the first
              is the first attempt.
            </p>

            {tatTiers.map((t, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{ width: 28, fontSize: 12, color: tokens.sub }}
                >{`#${i + 1}`}</span>
                <input
                  value={t.label}
                  onChange={(e) =>
                    setTatTiers((prev) =>
                      prev.map((x, xi) =>
                        xi === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder={`WIP ${i + 1}`}
                  style={{ ...styles.ctrl, maxWidth: 180 }}
                />
                <input
                  type="number"
                  min={1}
                  value={t.tatHours}
                  onChange={(e) =>
                    setTatTiers((prev) =>
                      prev.map((x, xi) =>
                        xi === i
                          ? { ...x, tatHours: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                  style={{ ...styles.ctrl, maxWidth: 100 }}
                />
                <span style={{ fontSize: 12, color: tokens.sub }}>hours</span>
                <button
                  onClick={() =>
                    setTatTiers((prev) => prev.filter((_, xi) => xi !== i))
                  }
                  title="Remove this step"
                  style={{ ...button("neutral"), padding: "6px 10px" }}
                >
                  Remove
                </button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() =>
                  setTatTiers((prev) => [
                    ...prev,
                    {
                      label: `WIP ${prev.length + 1}`,
                      tatHours: 4,
                      isActive: true,
                    },
                  ])
                }
                style={{ ...button("neutral"), padding: "8px 12px" }}
              >
                + Add step
              </button>
              <button
                onClick={saveTat}
                disabled={tatSaving || !tatTiers.length}
                style={{
                  ...button("primary"),
                  padding: "8px 14px",
                  opacity: tatSaving || !tatTiers.length ? 0.6 : 1,
                }}
              >
                {tatSaving ? "Saving…" : "Save steps"}
              </button>
              {tatMsg && (
                <span
                  style={{
                    fontSize: 12,
                    color: tatMsg.startsWith("Could not")
                      ? "#b91c1c"
                      : "#047857",
                    alignSelf: "center",
                  }}
                >
                  {tatMsg}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Agents table */}
        <div style={{ ...styles.card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Agent</th>
                {buckets.map((b) => (
                  <th key={b} style={{ ...th, textAlign: "center" }}>
                    {digitLabel(b)}
                  </th>
                ))}
                <th style={{ ...th, textAlign: "center" }}>Active</th>
                <th style={{ ...th, textAlign: "center" }}>Availability</th>
                <th style={{ ...th, textAlign: "center" }}>Leave</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {!projectId ? (
                <tr>
                  <td style={{ ...td, color: tokens.muted }} colSpan={buckets.length + 5}>
                    Pick a project to manage its IVR agents.
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td style={{ ...td, color: tokens.muted }} colSpan={buckets.length + 5}>
                    No IVR agents in this project. Mark users as “IVR Agent” in User Management.
                  </td>
                </tr>
              ) : (
                agents.map((a) => (
                  <tr key={a.userId}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: tokens.text }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: tokens.sub }}>
                        {a.email}
                        {!a.isActive && " · inactive"}
                      </div>
                    </td>
                    {buckets.map((b) => (
                      <td key={b} style={{ ...td, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={a.digits.includes(b)}
                          onChange={() => toggleDigit(a, b)}
                          style={{ accentColor: tokens.primary, width: 16, height: 16, cursor: "pointer" }}
                        />
                      </td>
                    ))}
                    <td style={{ ...td, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={a.active}
                        onChange={() => toggleActive(a)}
                        style={{ accentColor: tokens.primary, width: 16, height: 16, cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {a.availableNow ? (
                          <span style={{ ...availPill, color: tokens.success, background: tokens.successBg }}>
                            ● Available
                          </span>
                        ) : (
                          <span style={{ ...availPill, color: tokens.warn, background: tokens.warnBg }}>
                            ● {a.unavailableUntil ? `Back ${fmtTime(a.unavailableUntil)}` : "Off"}
                          </span>
                        )}
                        <button onClick={(e) => openMenu(a.userId, e)} style={miniBtn}>
                          Change ▾
                        </button>
                      </div>

                      {breakFor === a.userId && menuPos && (
                        <div
                          style={{ ...menuCard, top: menuPos.top, left: menuPos.left }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!a.availableNow && (
                            <>
                              <button
                                style={{ ...menuItem, color: tokens.success, fontWeight: 700 }}
                                onClick={() => setAvail(a, true, null)}
                              >
                                ✓ Resume now
                              </button>
                              <div style={{ borderTop: `1px solid ${tokens.border}`, margin: "4px 0" }} />
                            </>
                          )}
                          <div style={menuLabel}>Take a break</div>
                          <button style={menuItem} onClick={() => breakForMins(a, 30)}>
                            Back in 30 min
                          </button>
                          <button style={menuItem} onClick={() => breakForMins(a, 60)}>
                            Back in 1 hour
                          </button>
                          <button style={menuItem} onClick={() => breakForMins(a, 120)}>
                            Back in 2 hours
                          </button>
                          <div style={{ display: "flex", gap: 6, padding: "4px 10px", alignItems: "center" }}>
                            <input
                              type="time"
                              value={breakTime}
                              onChange={(e) => setBreakTime(e.target.value)}
                              style={{ ...styles.ctrl, minHeight: 34, padding: "4px 8px", flex: 1 }}
                            />
                            <button style={miniBtn} onClick={() => goBreakTill(a)}>
                              Back at
                            </button>
                          </div>
                          <div style={{ borderTop: `1px solid ${tokens.border}`, margin: "4px 0" }} />
                          <button
                            style={{ ...menuItem, color: tokens.danger, fontWeight: 600 }}
                            onClick={() => setAvail(a, false, null)}
                          >
                            ⏻ Off for the day
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {a.onLeave ? (
                        <span
                          style={{
                            padding: "2px 10px",
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: 700,
                            color: tokens.warn,
                            background: tokens.warnBg,
                          }}
                        >
                          On leave
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: tokens.muted }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => setLeaveFor(a)}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 8,
                          border: `1px solid ${tokens.border}`,
                          background: "#fff",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#334155",
                          cursor: "pointer",
                        }}
                      >
                        Leaves ({a.leaves.length})
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* DID registry: multiple DIDs → dedicated agent(s) */}
        <DidSection projectId={projectId} agents={agents} flash={flash} />
      </div>

      {breakFor && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1500 }}
          onClick={closeMenu}
        />
      )}
      {leaveFor && (
        <LeaveModal
          agent={leaveFor}
          projectId={projectId}
          onClose={() => setLeaveFor(null)}
          onChanged={load}
          flash={flash}
        />
      )}
      {digitEdit && (
        <DigitModal
          initial={digitEdit}
          projectId={projectId}
          onClose={() => setDigitEdit(null)}
          onSaved={() => {
            setDigitEdit(null);
            load();
          }}
          flash={flash}
        />
      )}
    </DashboardLayout>
  );
};

// ── Leave modal ──────────────────────────────────────────────────────────────
const modalScrim: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};
const modalCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  boxShadow: "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
  width: "100%",
  maxWidth: 520,
  padding: 24,
  fontFamily: tokens.font,
};

const LeaveModal: React.FC<{
  agent: Agent;
  projectId: string;
  onClose: () => void;
  onChanged: () => void;
  flash: (t: "ok" | "err", s: string) => void;
}> = ({ agent, projectId, onClose, onChanged, flash }) => {
  const [leaves, setLeaves] = useState<Leave[]>(agent.leaves);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");

  const add = async () => {
    if (!from || !to) return flash("err", "Pick from & to dates");
    try {
      const r = await ivrAgentApi.addLeave(agent.userId, {
        projectId,
        fromDate: from,
        toDate: to,
        reason,
      });
      setLeaves((p) => [...p, r.leave]);
      setFrom("");
      setTo("");
      setReason("");
      onChanged();
    } catch (e: any) {
      flash("err", e?.response?.data?.message || "Add failed");
    }
  };
  const del = async (id: string) => {
    try {
      await ivrAgentApi.removeLeave(id);
      setLeaves((p) => p.filter((l) => l._id !== id));
      onChanged();
    } catch {
      flash("err", "Delete failed");
    }
  };

  return (
    <div style={modalScrim} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ ...styles.title, fontSize: 20, marginBottom: 4 }}>Leaves — {agent.name}</h3>
        <p style={{ ...styles.subtitle, marginBottom: 16 }}>
          On leave = skipped by missed-call round-robin.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={styles.label}>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={styles.ctrl} />
          </div>
          <div>
            <label style={styles.label}>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={styles.ctrl} />
          </div>
          <input
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ ...styles.ctrl, flex: 1, minWidth: 140 }}
          />
          <button onClick={add} style={button("primary")}>Add</button>
        </div>

        <div style={{ marginTop: 16, maxHeight: 240, overflowY: "auto" }}>
          {leaves.length === 0 ? (
            <p style={{ fontSize: 13, color: tokens.muted }}>No leaves.</p>
          ) : (
            leaves.map((l) => (
              <div
                key={l._id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 12,
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 13 }}>
                  <strong>{new Date(l.fromDate).toLocaleDateString()}</strong> →{" "}
                  <strong>{new Date(l.toDate).toLocaleDateString()}</strong>
                  {l.reason ? <span style={{ color: tokens.sub }}> · {l.reason}</span> : null}
                </div>
                <button
                  onClick={() => del(l._id)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    background: "#fff",
                    color: tokens.danger,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={button("neutral")}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Digit config modal ───────────────────────────────────────────────────────
const DigitModal: React.FC<{
  initial: Digit[];
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
  flash: (t: "ok" | "err", s: string) => void;
}> = ({ initial, projectId, onClose, onSaved, flash }) => {
  const [rows, setRows] = useState<Digit[]>(initial.length ? initial : [{ code: "", label: "" }]);

  const save = async () => {
    const clean = rows
      .map((r) => ({ code: r.code.trim(), label: r.label.trim() }))
      .filter((r) => r.code);
    try {
      await ivrAgentApi.setDigits(projectId, clean);
      onSaved();
    } catch (e: any) {
      flash("err", e?.response?.data?.message || "Save failed");
    }
  };

  return (
    <div style={modalScrim} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ ...styles.title, fontSize: 20, marginBottom: 4 }}>IVR digit buckets</h3>
        <p style={{ ...styles.subtitle, marginBottom: 16 }}>
          The options a caller presses (1 / 2 / 3 …). “Other” is always available for blank/unmatched.
        </p>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              placeholder="Code (e.g. 1)"
              value={r.code}
              onChange={(e) =>
                setRows((p) => p.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))
              }
              style={{ ...styles.ctrl, width: 110 }}
            />
            <input
              placeholder="Label (e.g. Admissions)"
              value={r.label}
              onChange={(e) =>
                setRows((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
              style={{ ...styles.ctrl, flex: 1 }}
            />
            <button
              onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
              style={{
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid #fecaca",
                background: "#fff",
                color: tokens.danger,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setRows((p) => [...p, { code: "", label: "" }])}
          style={{ ...button("neutral"), marginTop: 4 }}
        >
          + Add bucket
        </button>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={button("neutral")}>Cancel</button>
          <button onClick={save} style={button("primary")}>Save</button>
        </div>
      </div>
    </div>
  );
};

// ── DID registry section ─────────────────────────────────────────────────────
interface DidRow {
  _id: string;
  didNumber: string;
  label?: string;
  active: boolean;
  agentUserIds: { _id: string; fullName?: string; firstName?: string; lastName?: string; email?: string }[];
}
const agentName = (a: any) =>
  a?.fullName || `${a?.firstName || ""} ${a?.lastName || ""}`.trim() || a?.email || "Agent";

const DidSection: React.FC<{
  projectId: string;
  agents: Agent[];
  flash: (t: "ok" | "err", s: string) => void;
}> = ({ projectId, agents, flash }) => {
  const empty = { didNumber: "", label: "", agentUserIds: [] as string[], active: true };
  const [dids, setDids] = useState<DidRow[]>([]);
  const [draft, setDraft] = useState<typeof empty & { _id?: string }>({ ...empty });
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    if (!projectId) return setDids([]);
    try {
      const r = await ivrAgentApi.listDids(projectId);
      setDids(r.dids || []);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const startNew = () => {
    setDraft({ ...empty });
    setShowForm(true);
  };
  const startEdit = (d: DidRow) => {
    setDraft({
      _id: d._id,
      didNumber: d.didNumber,
      label: d.label || "",
      agentUserIds: (d.agentUserIds || []).map((a) => String(a._id)),
      active: d.active !== false,
    });
    setShowForm(true);
  };
  const toggleAgent = (uid: string) =>
    setDraft((d) => ({
      ...d,
      agentUserIds: d.agentUserIds.includes(uid)
        ? d.agentUserIds.filter((x) => x !== uid)
        : [...d.agentUserIds, uid],
    }));
  const save = async () => {
    if (!draft.didNumber.trim()) return flash("err", "DID number required");
    try {
      await ivrAgentApi.upsertDid({
        projectId,
        didNumber: draft.didNumber.trim(),
        label: draft.label.trim(),
        agentUserIds: draft.agentUserIds,
        active: draft.active,
      });
      flash("ok", "DID saved");
      setShowForm(false);
      setDraft({ ...empty });
      load();
    } catch (e: any) {
      flash("err", e?.response?.data?.message || "Save failed");
    }
  };
  const remove = async (id: string) => {
    try {
      await ivrAgentApi.removeDid(id);
      flash("ok", "DID removed");
      load();
    } catch {
      flash("err", "Delete failed");
    }
  };

  const cell: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    borderBottom: `1px solid ${tokens.border}`,
    textAlign: "left",
  };

  return (
    <div style={{ ...styles.card, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>DID Mapping</div>
          <div style={{ fontSize: 13, color: tokens.muted }}>
            Map each TATA DID number to its dedicated agent(s). Answered calls are
            attributed to the agent by the DID they came in on.
          </div>
        </div>
        <button onClick={startNew} style={button("primary")}>
          + Add DID
        </button>
      </div>

      {showForm && (
        <div style={{ border: `1px solid ${tokens.border}`, borderRadius: 10, padding: 14, marginBottom: 14, background: "#f8fafc" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <label style={styles.label}>DID number</label>
              <input
                style={{ ...styles.ctrl, minWidth: 200 }}
                value={draft.didNumber}
                onChange={(e) => setDraft({ ...draft, didNumber: e.target.value })}
                placeholder="e.g. 918062351628"
              />
            </div>
            <div>
              <label style={styles.label}>Label</label>
              <input
                style={{ ...styles.ctrl, minWidth: 200 }}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="e.g. IVR 1"
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-end", fontSize: 13, paddingBottom: 8 }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={styles.label}>Dedicated agent(s)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {agents.length === 0 && (
                <span style={{ fontSize: 12, color: tokens.muted }}>No IVR agents in this project yet.</span>
              )}
              {agents.map((a) => (
                <label
                  key={a.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    border: `1px solid ${draft.agentUserIds.includes(a.userId) ? tokens.primary : tokens.border}`,
                    background: draft.agentUserIds.includes(a.userId) ? tokens.primarySoft : "#fff",
                  }}
                >
                  <input type="checkbox" checked={draft.agentUserIds.includes(a.userId)} onChange={() => toggleAgent(a.userId)} />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={button("primary")}>Save DID</button>
            <button onClick={() => { setShowForm(false); setDraft({ ...empty }); }} style={button("neutral")}>Cancel</button>
          </div>
        </div>
      )}

      {dids.length === 0 ? (
        <div style={{ fontSize: 13, color: tokens.muted, padding: "8px 2px" }}>
          No DIDs configured yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["DID number", "Label", "Agent(s)", "Active", ""].map((h) => (
                  <th key={h} style={{ ...cell, fontWeight: 700, color: tokens.muted, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dids.map((d) => (
                <tr key={d._id}>
                  <td style={cell}>{d.didNumber}</td>
                  <td style={cell}>{d.label || "—"}</td>
                  <td style={cell}>
                    {(d.agentUserIds || []).length
                      ? d.agentUserIds.map(agentName).join(", ")
                      : <span style={{ color: tokens.muted }}>Unassigned</span>}
                  </td>
                  <td style={cell}>
                    <span style={{ color: d.active ? tokens.success : tokens.muted, fontWeight: 600 }}>
                      {d.active ? "Yes" : "No"}
                    </span>
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    <button onClick={() => startEdit(d)} style={{ ...button("neutral"), padding: "4px 10px", marginRight: 6 }}>Edit</button>
                    <button onClick={() => remove(d._id)} style={{ ...button("danger"), padding: "4px 10px" }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default IvrAgentManagement;
