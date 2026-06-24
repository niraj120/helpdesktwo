import React, { useEffect, useState } from "react";
import SrPage from "../components/sr/SrPage";
import { srButton } from "../utils/srTheme";
import { useProjectContext } from "../contexts/ProjectContext";
import { api } from "../utils/api";
import { serviceRequestApi } from "../services/serviceRequests";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}

interface SrConfig {
  enabled: boolean;
  psr: { enabled: boolean };
  isr: { enabled: boolean };
  wip: {
    maxRevisions: number;
    maxDaysPerRevision: number;
    reminderHoursBefore: number;
    escalateOnExpiry: boolean;
  };
  reopen: { assignToRoleId?: string; assignToUserId?: string };
  email: { enabled: boolean; tatHours: number; level2Hours: number };
  ivr: { enabled: boolean };
}

const DEFAULT_CFG: SrConfig = {
  enabled: false,
  psr: { enabled: false },
  isr: { enabled: false },
  wip: {
    maxRevisions: 3,
    maxDaysPerRevision: 8,
    reminderHoursBefore: 48,
    escalateOnExpiry: true,
  },
  reopen: {},
  email: { enabled: false, tatHours: 8, level2Hours: 12 },
  ivr: { enabled: false },
};

const ServiceRequestSettings: React.FC<{
  embedded?: boolean;
  projectId?: string;
}> = ({ embedded, projectId: projectIdProp }) => {
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectIdState, setProjectId] = useState(currentProjectId || "");
  const projectId =
    projectIdProp !== undefined ? projectIdProp : projectIdState;
  const [cfg, setCfg] = useState<SrConfig>(DEFAULT_CFG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/projects", { params: { limit: 100 } });
        const data: any = res.data;
        const list: ProjectOpt[] =
          data?.data?.projects || data?.projects || data?.data || data || [];
        setProjects(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error("Failed to load projects:", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setMsg(null);
    serviceRequestApi
      .getConfig(projectId)
      .then((r) => setCfg({ ...DEFAULT_CFG, ...(r.data || {}) }))
      .catch((e) => {
        console.error(e);
        setCfg(DEFAULT_CFG);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const save = async () => {
    if (!projectId) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await serviceRequestApi.updateConfig(projectId, {
        enabled: cfg.enabled,
        psr: { enabled: cfg.psr.enabled },
        isr: { enabled: cfg.isr.enabled },
        wip: cfg.wip,
        reopen: cfg.reopen,
        email: cfg.email,
        ivr: cfg.ivr,
      });
      setCfg({ ...DEFAULT_CFG, ...(r.data || {}) });
      setMsg({
        type: "ok",
        text: "Saved. PSR statuses seeded if PSR was enabled.",
      });
    } catch (e: any) {
      setMsg({
        type: "err",
        text: e?.response?.data?.message || "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  };

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e7ebf3",
    borderRadius: 14,
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
    padding: 20,
    maxWidth: 640,
  };
  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: "1px solid #f3f4f6",
  };
  const numInput: React.CSSProperties = {
    width: 90,
    height: 36,
    padding: "0 10px",
    border: "1px solid #d7deea",
    borderRadius: 8,
  };

  return (
    <SrPage
      title="Service Request Settings"
      subtitle="Enable the PSR/ISR module per project and configure WIP committed-date limits."
      embedded={embedded}
    >

        {!embedded && (
          <div style={{ ...card, marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              Project
            </label>
            <div style={{ marginTop: 8 }}>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                style={{
                  width: "100%",
                  height: 40,
                  padding: "0 12px",
                  border: "1px solid #d7deea",
                  borderRadius: 10,
                }}
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.code ? `(${p.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {projectId && (
          <div style={card}>
            {loading ? (
              <div>Loading…</div>
            ) : (
              <>
                <div style={row}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      Service Request module enabled
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Master switch for PSR/ISR on this project
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) =>
                      setCfg({ ...cfg, enabled: e.target.checked })
                    }
                  />
                </div>

                <div style={row}>
                  <div style={{ fontWeight: 600 }}>Parent Service Requests (PSR)</div>
                  <input
                    type="checkbox"
                    checked={cfg.psr.enabled}
                    onChange={(e) =>
                      setCfg({ ...cfg, psr: { enabled: e.target.checked } })
                    }
                  />
                </div>

                <div style={row}>
                  <div style={{ fontWeight: 600 }}>
                    Internal Service Requests (ISR)
                  </div>
                  <input
                    type="checkbox"
                    checked={cfg.isr.enabled}
                    onChange={(e) =>
                      setCfg({ ...cfg, isr: { enabled: e.target.checked } })
                    }
                  />
                </div>

                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    WIP committed-date limits
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 13 }}>
                      Max revisions
                      <br />
                      <input
                        type="number"
                        min={1}
                        style={numInput}
                        value={cfg.wip.maxRevisions}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            wip: {
                              ...cfg.wip,
                              maxRevisions: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label style={{ fontSize: 13 }}>
                      Max days / revision
                      <br />
                      <input
                        type="number"
                        min={1}
                        style={numInput}
                        value={cfg.wip.maxDaysPerRevision}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            wip: {
                              ...cfg.wip,
                              maxDaysPerRevision: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label style={{ fontSize: 13 }}>
                      Reminder (hours before)
                      <br />
                      <input
                        type="number"
                        min={1}
                        style={numInput}
                        value={cfg.wip.reminderHoursBefore}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            wip: {
                              ...cfg.wip,
                              reminderHoursBefore: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 14,
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cfg.wip.escalateOnExpiry}
                    onChange={(e) =>
                      setCfg({
                        ...cfg,
                        wip: { ...cfg.wip, escalateOnExpiry: e.target.checked },
                      })
                    }
                  />
                  Escalate when the committed closure date expires
                </label>

                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    Re-open assignee (Principal)
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 13 }}>
                      Assign to Role ID
                      <br />
                      <input
                        style={{ ...numInput, width: 260 }}
                        value={cfg.reopen.assignToRoleId || ""}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            reopen: {
                              ...cfg.reopen,
                              assignToRoleId: e.target.value,
                            },
                          })
                        }
                        placeholder="Role ObjectId (optional)"
                      />
                    </label>
                    <label style={{ fontSize: 13 }}>
                      Assign to User ID
                      <br />
                      <input
                        style={{ ...numInput, width: 260 }}
                        value={cfg.reopen.assignToUserId || ""}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            reopen: {
                              ...cfg.reopen,
                              assignToUserId: e.target.value,
                            },
                          })
                        }
                        placeholder="User ObjectId (optional)"
                      />
                    </label>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    Leave blank to keep the current assignee on re-open. Set
                    later when the Principal role/user is known.
                  </div>
                </div>

                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    Email triage inbox
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cfg.email.enabled}
                      onChange={(e) =>
                        setCfg({
                          ...cfg,
                          email: { ...cfg.email, enabled: e.target.checked },
                        })
                      }
                    />
                    Enable the email triage inbox for this project
                  </label>
                  <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                    <label style={{ fontSize: 13 }}>
                      TAT (working hours)
                      <br />
                      <input
                        type="number"
                        min={1}
                        style={numInput}
                        value={cfg.email.tatHours}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            email: {
                              ...cfg.email,
                              tatHours: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label style={{ fontSize: 13 }}>
                      L2 escalation (hours)
                      <br />
                      <input
                        type="number"
                        min={1}
                        style={numInput}
                        value={cfg.email.level2Hours}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            email: {
                              ...cfg.email,
                              level2Hours: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 14,
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cfg.ivr.enabled}
                    onChange={(e) =>
                      setCfg({ ...cfg, ivr: { enabled: e.target.checked } })
                    }
                  />
                  Enable the IVR call triage inbox for this project
                </label>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 20,
                  }}
                >
                  <button
                    onClick={save}
                    disabled={saving}
                    style={{ ...srButton("success"), cursor: saving ? "default" : "pointer" }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  {msg && (
                    <span
                      style={{
                        fontSize: 13,
                        color: msg.type === "ok" ? "#047857" : "#b91c1c",
                      }}
                    >
                      {msg.text}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
    </SrPage>
  );
};

export default ServiceRequestSettings;
