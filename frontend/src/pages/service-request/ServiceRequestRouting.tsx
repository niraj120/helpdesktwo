import React, { useEffect, useMemo, useState } from "react";
import SrPage from "../../components/sr/SrPage";
import { srButton } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { api } from "../../utils/api";
import { serviceRequestApi } from "../../services/serviceRequests";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}

interface CategoryNode {
  _id: string;
  name: string;
  level?: number;
  parentId?: string | null;
  path?: string;
  department?: string | null;
  sr?: { proactiveHelpText?: string; appliesTo?: TicketTypeScope[] };
}

interface Option {
  _id: string;
  name?: string;
  code?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

const UNITS = ["minutes", "hours", "days"];
// #7 SR submission sources that can carry an SLA override (key must match backend submissionSource).
const SLA_SOURCES: Array<{ key: string; label: string }> = [
  { key: "portal", label: "Portal / Online" },
  { key: "email", label: "Email" },
  { key: "ivr", label: "IVR" },
  { key: "walk_in", label: "Walk-in" },
];
const MODE_OPTIONS = [
  {
    value: "round-robin",
    label: "Round robin",
    hint: "Rotate between selected users, or all project agents if no user pool is selected.",
  },
  {
    value: "by-role",
    label: "By role",
    hint: "Rotate between active users mapped to the selected role pool.",
  },
  {
    value: "by-user",
    label: "Direct user",
    hint: "Assign to selected user. If multiple users are selected, rotate between them.",
  },
  {
    value: "manual",
    label: "Manual",
    hint: "Create the ticket without auto assignment.",
  },
];
const LEVEL_LABELS = ["Department", "Category", "Sub Category", "Sub-Fields"];
// #8 Auto-close condition operators (mirror backend srConditionEngine)
const AC_OPERATORS: Array<{ value: string; label: string; noValue?: boolean }> = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "is_empty", label: "is empty", noValue: true },
  { value: "is_not_empty", label: "is not empty", noValue: true },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
];
type TicketTypeScope = "normal" | "PSR" | "ISR";
const TICKET_TYPE_OPTIONS: Array<{ value: TicketTypeScope; label: string }> = [
  { value: "normal", label: "Normal ticket" },
  { value: "PSR", label: "PSR" },
  { value: "ISR", label: "ISR" },
];

const getCategoryScope = (category?: CategoryNode): TicketTypeScope => {
  const appliesTo = category?.sr?.appliesTo || [];
  if (appliesTo.length === 0) return "normal";
  if (appliesTo.includes("PSR") && appliesTo.includes("ISR")) return "PSR";
  if (appliesTo.length === 1) return appliesTo[0];
  return "normal";
};

const idOf = (value: any) =>
  value && typeof value === "object" ? String(value._id || value.id) : String(value || "");

const displayName = (item: Option) =>
  `${item.firstName || ""} ${item.lastName || ""}`.trim() ||
  item.name ||
  item.email ||
  item.code ||
  item._id;

const getMultiValues = (select: HTMLSelectElement) =>
  Array.from(select.selectedOptions).map((o) => o.value).filter(Boolean);

const ServiceRequestRouting: React.FC<{
  embedded?: boolean;
  projectId?: string;
}> = ({ embedded, projectId: projectIdProp }) => {
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectIdState, setProjectId] = useState(currentProjectId || "");
  const projectId =
    projectIdProp !== undefined ? projectIdProp : projectIdState;

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [routingScope, setRoutingScope] = useState<TicketTypeScope>("normal");
  const [departments, setDepartments] = useState<Option[]>([]);
  const [roles, setRoles] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [selectedByLevel, setSelectedByLevel] = useState<Record<number, string>>(
    {},
  );

  const [department, setDepartment] = useState("");
  const [helpText, setHelpText] = useState("");
  const [respVal, setRespVal] = useState(4);
  const [respUnit, setRespUnit] = useState("hours");
  const [resVal, setResVal] = useState(48);
  const [resUnit, setResUnit] = useState("hours");
  // #7 Per-source SLA overrides (blank = inherit base)
  interface SourceSla {
    respVal: string;
    respUnit: string;
    resVal: string;
    resUnit: string;
  }
  const emptySourceSla: SourceSla = {
    respVal: "",
    respUnit: "hours",
    resVal: "",
    resUnit: "hours",
  };
  const [slaBySource, setSlaBySource] = useState<Record<string, SourceSla>>({});
  const [mode, setMode] = useState("by-role");
  const [agentPool, setAgentPool] = useState<string[]>([]);
  const [rolePool, setRolePool] = useState<string[]>([]);
  const [ccUsers, setCcUsers] = useState<string[]>([]);
  const [ccRoles, setCcRoles] = useState<string[]>([]);
  // #2 Re-open assignment (category-level)
  const [reopenUserId, setReopenUserId] = useState("");
  const [reopenRoleId, setReopenRoleId] = useState("");
  // #1 Per-center overrides
  const [centers, setCenters] = useState<Option[]>([]);
  interface CenterOverride {
    centerId: string;
    mode: string;
    agentPool: string[];
    rolePool: string[];
    ccUsers: string[];
    ccRoles: string[];
    reopenUserId: string;
    reopenRoleId: string;
  }
  const [centerOverrides, setCenterOverrides] = useState<CenterOverride[]>([]);
  // #8 Auto-close rule
  interface AutoCloseCond {
    field: string;
    operator: string;
    value: string;
  }
  const [acEnabled, setAcEnabled] = useState(false);
  const [acMatch, setAcMatch] = useState<"all" | "any">("all");
  const [acConditions, setAcConditions] = useState<AutoCloseCond[]>([]);
  const [acRemark, setAcRemark] = useState("");
  // #11 Email auto-forward (one address per line)
  const [autoForwardTo, setAutoForwardTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const recomputeTat = async () => {
    if (!projectId) return;
    setRecomputing(true);
    setMsg(null);
    try {
      const r = await serviceRequestApi.recomputeTat(projectId);
      const d = r?.data || {};
      setMsg(
        `Recomputed TAT for ${d.updated ?? 0} open SR(s)` +
          (d.skipped ? ` (${d.skipped} skipped)` : "") +
          (d.workingCalendarId ? "" : " — no working calendar, used plain hours"),
      );
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Recompute failed.");
    } finally {
      setRecomputing(false);
    }
  };

  useEffect(() => {
    if (embedded) return;
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
  }, [embedded]);

  useEffect(() => {
    if (!projectId) return;
    setSelectedByLevel({});
    setMsg(null);
    (async () => {
      try {
        const [cr, dr, rr, ur, cen] = await Promise.all([
          serviceRequestApi.categoriesForProject(projectId),
          serviceRequestApi.departments(projectId),
          api.get("/roles", { params: { projectId } }).catch(() => ({ data: {} })),
          api
            .get("/users", {
              params: { project: projectId, isActive: true, limit: 1000 },
            })
            .catch(() => ({ data: {} })),
          api
            .get("/centers", { params: { projectId } })
            .catch(() => ({ data: {} })),
        ]);
        const cl = cr?.data || cr || [];
        setCategories(Array.isArray(cl) ? cl : []);
        const dl = dr?.data || dr || [];
        setDepartments(Array.isArray(dl) ? dl : []);
        setRoles(rr.data?.data || []);
        setUsers(ur.data?.data || []);
        const cenList = cen.data?.data || cen.data || [];
        setCenters(
          (Array.isArray(cenList) ? cenList : []).map((c: any) => ({
            _id: String(c._id),
            name: c.centerName || c.name,
          })),
        );
      } catch (e) {
        console.error(e);
      }
    })();
  }, [projectId]);

  const scopedCategories = useMemo(
    () => categories.filter((category) => getCategoryScope(category) === routingScope),
    [categories, routingScope],
  );

  const levels = useMemo(() => {
    const found = new Set(scopedCategories.map((c) => Number(c.level || 1)));
    return Array.from(found).sort((a, b) => a - b);
  }, [scopedCategories]);

  const selectedCategoryId = useMemo(() => {
    const chosen = levels
      .map((level) => selectedByLevel[level])
      .filter(Boolean);
    return chosen[chosen.length - 1] || "";
  }, [levels, selectedByLevel]);

  const optionsForLevel = (level: number) => {
    const parentId = level === 1 ? "" : selectedByLevel[level - 1] || "";
    if (level > 1 && !parentId) return [];
    return scopedCategories
      .filter((c) => {
        const cLevel = Number(c.level || 1);
        const cParent = idOf(c.parentId);
        return cLevel === level && (level === 1 || cParent === parentId);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  useEffect(() => {
    if (!selectedCategoryId) return;
    const cat = scopedCategories.find((c) => String(c._id) === selectedCategoryId);
    setDepartment(idOf(cat?.department));
    setHelpText(cat?.sr?.proactiveHelpText || "");
    (async () => {
      try {
        const sla = await serviceRequestApi.getCategorySla(selectedCategoryId);
        const s = sla?.data;
        if (s) {
          setRespVal(s.responseTime?.value ?? 4);
          setRespUnit(s.responseTime?.unit ?? "hours");
          setResVal(s.resolutionTime?.value ?? 48);
          setResUnit(s.resolutionTime?.unit ?? "hours");
          const bySrc: Record<string, SourceSla> = {};
          for (const src of SLA_SOURCES) {
            const o = s.slaBySource?.[src.key];
            bySrc[src.key] = o
              ? {
                  respVal: o.responseTime?.value != null ? String(o.responseTime.value) : "",
                  respUnit: o.responseTime?.unit || "hours",
                  resVal: o.resolutionTime?.value != null ? String(o.resolutionTime.value) : "",
                  resUnit: o.resolutionTime?.unit || "hours",
                }
              : { ...emptySourceSla };
          }
          setSlaBySource(bySrc);
        } else {
          setRespVal(4);
          setRespUnit("hours");
          setResVal(48);
          setResUnit("hours");
          setSlaBySource({});
        }
      } catch {
        setRespVal(4);
        setRespUnit("hours");
        setResVal(48);
        setResUnit("hours");
        setSlaBySource({});
      }

      try {
        const ac = await serviceRequestApi.getAssignmentConfig(selectedCategoryId);
        const c = ac?.data;
        if (c) {
          setMode(c.mode || "by-role");
          setAgentPool((c.agentPool || []).map(idOf));
          setRolePool((c.rolePool || []).map(idOf));
          setCcUsers((c.ccUsers || []).map(idOf));
          setCcRoles((c.ccRoles || []).map(idOf));
          setReopenUserId(idOf(c.reopen?.assignToUserId));
          setReopenRoleId(idOf(c.reopen?.assignToRoleId));
          setAcEnabled(!!c.autoClose?.enabled);
          setAcMatch(c.autoClose?.match === "any" ? "any" : "all");
          setAcConditions(
            (c.autoClose?.conditions || []).map((cd: any) => ({
              field: cd.field || "",
              operator: cd.operator || "equals",
              value: cd.value != null ? String(cd.value) : "",
            })),
          );
          setAcRemark(c.autoClose?.remarkTemplate || "");
          setAutoForwardTo(
            Array.isArray(c.autoForwardTo) ? c.autoForwardTo.join("\n") : "",
          );
          setCenterOverrides(
            (c.centerOverrides || []).map((o: any) => ({
              centerId: idOf(o.centerId),
              mode: o.mode || "",
              agentPool: (o.agentPool || []).map(idOf),
              rolePool: (o.rolePool || []).map(idOf),
              ccUsers: (o.ccUsers || []).map(idOf),
              ccRoles: (o.ccRoles || []).map(idOf),
              reopenUserId: idOf(o.reopen?.assignToUserId),
              reopenRoleId: idOf(o.reopen?.assignToRoleId),
            })),
          );
        } else {
          setMode("by-role");
          setAgentPool([]);
          setRolePool([]);
          setCcUsers([]);
          setCcRoles([]);
          setReopenUserId("");
          setReopenRoleId("");
          setCenterOverrides([]);
          setAcEnabled(false);
          setAcMatch("all");
          setAcConditions([]);
          setAcRemark("");
          setAutoForwardTo("");
        }
      } catch {
        setMode("by-role");
        setAgentPool([]);
        setRolePool([]);
        setCcUsers([]);
        setCcRoles([]);
        setReopenUserId("");
        setReopenRoleId("");
        setCenterOverrides([]);
        setAcEnabled(false);
        setAcMatch("all");
        setAcConditions([]);
        setAcRemark("");
        setAutoForwardTo("");
      }
    })();
  }, [selectedCategoryId, scopedCategories, routingScope]);

  const saveAll = async () => {
    if (!selectedCategoryId) return;
    setBusy(true);
    setMsg(null);
    try {
      await serviceRequestApi.updateCategory(selectedCategoryId, {
        department: department || null,
        sr: { proactiveHelpText: helpText, appliesTo: [routingScope] },
      });
      const slaBySourcePayload: Record<string, any> = {};
      for (const src of SLA_SOURCES) {
        const o = slaBySource[src.key];
        if (!o) continue;
        const entry: any = {};
        if (o.respVal !== "" && Number(o.respVal) > 0)
          entry.responseTime = { value: Number(o.respVal), unit: o.respUnit };
        if (o.resVal !== "" && Number(o.resVal) > 0)
          entry.resolutionTime = { value: Number(o.resVal), unit: o.resUnit };
        if (entry.responseTime || entry.resolutionTime)
          slaBySourcePayload[src.key] = entry;
      }
      await serviceRequestApi.setCategorySla(selectedCategoryId, {
        responseTime: { value: Number(respVal), unit: respUnit },
        resolutionTime: { value: Number(resVal), unit: resUnit },
        slaBySource: Object.keys(slaBySourcePayload).length
          ? slaBySourcePayload
          : undefined,
      });
      await serviceRequestApi.setAssignmentConfig(selectedCategoryId, {
        mode,
        agentPool,
        rolePool,
        ccUsers,
        ccRoles,
        reopen:
          reopenUserId || reopenRoleId
            ? {
                assignToUserId: reopenUserId || undefined,
                assignToRoleId: reopenRoleId || undefined,
              }
            : undefined,
        centerOverrides: centerOverrides
          .filter((o) => o.centerId)
          .map((o) => ({
            centerId: o.centerId,
            mode: o.mode || undefined,
            agentPool: o.agentPool,
            rolePool: o.rolePool,
            ccUsers: o.ccUsers,
            ccRoles: o.ccRoles,
            reopen:
              o.reopenUserId || o.reopenRoleId
                ? {
                    assignToUserId: o.reopenUserId || undefined,
                    assignToRoleId: o.reopenRoleId || undefined,
                  }
                : undefined,
          })),
        autoClose: {
          enabled: acEnabled,
          match: acMatch,
          conditions: acConditions
            .filter((c) => c.field.trim() && c.operator)
            .map((c) => ({
              field: c.field.trim(),
              operator: c.operator,
              value: c.value || undefined,
            })),
          remarkTemplate: acRemark || undefined,
        },
        autoForwardTo: autoForwardTo
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setMsg("Routing saved for this selected level.");
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed to save routing.");
    } finally {
      setBusy(false);
    }
  };

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
    padding: 18,
    marginBottom: 14,
  };
  const ctrl: React.CSSProperties = {
    width: "100%",
    minHeight: 38,
    padding: "8px 10px",
    border: "1px solid #d7deea",
    borderRadius: 8,
    boxSizing: "border-box",
    fontSize: 13,
  };
  const lbl: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    display: "block",
    marginBottom: 6,
    color: "#374151",
  };
  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  };
  return (
    <SrPage
      title="SR Routing"
      subtitle="Configure category hierarchy routing, department, SLA, assignment strategy, user/role pools, and CC watchers."
      embedded={embedded}
    >
      <div style={card}>
        {!embedded && (
          <div style={{ maxWidth: 420, marginBottom: 14 }}>
            <label style={lbl}>Project</label>
            <select
              style={ctrl}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} {p.code ? `(${p.code})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {projectId && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Configure routing for</label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: 10,
                }}
              >
                {TICKET_TYPE_OPTIONS.map((option) => {
                  const active = routingScope === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setRoutingScope(option.value);
                        setSelectedByLevel({});
                        setMsg(null);
                      }}
                      style={{
                        border: active
                          ? "2px solid #4f46e5"
                          : "1px solid #d7deea",
                        borderRadius: 8,
                        background: active ? "#eef2ff" : "#fff",
                        color: active ? "#3730a3" : "#334155",
                        padding: "10px 12px",
                        textAlign: "left",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={grid}>
              {levels.map((level) => {
                const opts = optionsForLevel(level);
                return (
                  <div key={level}>
                    <label style={lbl}>
                      {LEVEL_LABELS[level - 1] || `Level ${level}`}
                    </label>
                    <select
                      style={ctrl}
                      value={selectedByLevel[level] || ""}
                      disabled={level > 1 && !selectedByLevel[level - 1]}
                      onChange={(e) => {
                        const next: Record<number, string> = {
                          ...selectedByLevel,
                          [level]: e.target.value,
                        };
                        levels
                          .filter((l) => l > level)
                          .forEach((l) => delete next[l]);
                        setSelectedByLevel(next);
                      }}
                    >
                      <option value="">
                        {opts.length ? "Select..." : "No values"}
                      </option>
                      {opts.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.path || c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
              Configure {routingScope === "normal" ? "normal ticket" : routingScope} routing at any selected level. If a deeper level has no
              routing, tickets fall back to the nearest configured parent level.
            </div>
          </>
        )}
      </div>

      {selectedCategoryId && (
        <>
          <div style={card}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Routing target</h3>
            <div style={{ ...grid, marginTop: 14 }}>
              <div>
                <label style={lbl}>Department</label>
                <select
                  style={ctrl}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  <option value="">None</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Assignment mode</label>
                <select
                  style={ctrl}
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  {MODE_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 5, fontSize: 12, color: "#64748b" }}>
                  {MODE_OPTIONS.find((m) => m.value === mode)?.hint}
                </div>
              </div>
            </div>

            <label style={{ ...lbl, marginTop: 14 }}>
              Proactive help text
            </label>
            <textarea
              style={{ ...ctrl, minHeight: 72 }}
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              placeholder="Shown before ticket submission for deflection or policy guidance."
            />
            <div style={{ marginTop: 14 }}>
              <label style={lbl}>Category flow</label>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  border: "1px solid #c7d2fe",
                  background: "#eef2ff",
                  color: "#3730a3",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {TICKET_TYPE_OPTIONS.find((item) => item.value === routingScope)
                  ?.label || routingScope}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                Assignment and escalation setup is saved only for this flow's
                selected category.
              </div>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Assignment pools</h3>
            <div style={{ ...grid, marginTop: 14 }}>
              <div>
                <label style={lbl}>Role pool</label>
                <select
                  multiple
                  style={{ ...ctrl, minHeight: 132 }}
                  value={rolePool}
                  onChange={(e) => setRolePool(getMultiValues(e.currentTarget))}
                >
                  {roles.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name || r.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>User pool</label>
                <select
                  multiple
                  style={{ ...ctrl, minHeight: 132 }}
                  value={agentPool}
                  onChange={(e) => setAgentPool(getMultiValues(e.currentTarget))}
                >
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {displayName(u)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>CC roles</label>
                <select
                  multiple
                  style={{ ...ctrl, minHeight: 132 }}
                  value={ccRoles}
                  onChange={(e) => setCcRoles(getMultiValues(e.currentTarget))}
                >
                  {roles.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name || r.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>CC users</label>
                <select
                  multiple
                  style={{ ...ctrl, minHeight: 132 }}
                  value={ccUsers}
                  onChange={(e) => setCcUsers(getMultiValues(e.currentTarget))}
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

          <div style={card}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Re-open assignment</h3>
            <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
              Where a re-opened SR is routed. Leave blank to use the project's
              default re-open setting.
            </div>
            <div style={{ ...grid, marginTop: 14 }}>
              <div>
                <label style={lbl}>Assign to user</label>
                <select
                  style={ctrl}
                  value={reopenUserId}
                  onChange={(e) => {
                    setReopenUserId(e.target.value);
                    if (e.target.value) setReopenRoleId("");
                  }}
                >
                  <option value="">None</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {displayName(u)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>or Assign to role</label>
                <select
                  style={ctrl}
                  value={reopenRoleId}
                  onChange={(e) => {
                    setReopenRoleId(e.target.value);
                    if (e.target.value) setReopenUserId("");
                  }}
                >
                  <option value="">None</option>
                  {roles.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name || r.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={card}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16 }}>Per-center overrides</h3>
              <button
                type="button"
                onClick={() =>
                  setCenterOverrides((prev) => [
                    ...prev,
                    {
                      centerId: "",
                      mode: "",
                      agentPool: [],
                      rolePool: [],
                      ccUsers: [],
                      ccRoles: [],
                      reopenUserId: "",
                      reopenRoleId: "",
                    },
                  ])
                }
                style={{ ...srButton("neutral"), padding: "6px 12px" }}
              >
                + Add center
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
              Override assignment for a specific center. Non-empty fields replace
              the base routing above for tickets from that center.
            </div>
            {centerOverrides.length === 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: "#94a3b8" }}>
                No center overrides. Base routing applies to all centers.
              </div>
            )}
            {centerOverrides.map((ov, idx) => {
              const update = (patch: Partial<CenterOverride>) =>
                setCenterOverrides((prev) =>
                  prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
                );
              return (
                <div
                  key={idx}
                  style={{
                    marginTop: 14,
                    padding: 14,
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    background: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Center</label>
                      <select
                        style={ctrl}
                        value={ov.centerId}
                        onChange={(e) => update({ centerId: e.target.value })}
                      >
                        <option value="">Select a center...</option>
                        {centers.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCenterOverrides((prev) =>
                          prev.filter((_, i) => i !== idx),
                        )
                      }
                      style={{
                        ...srButton("danger"),
                        padding: "6px 10px",
                        marginTop: 22,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div style={{ ...grid, marginTop: 12 }}>
                    <div>
                      <label style={lbl}>Mode</label>
                      <select
                        style={ctrl}
                        value={ov.mode}
                        onChange={(e) => update({ mode: e.target.value })}
                      >
                        <option value="">Same as base</option>
                        {MODE_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Role pool</label>
                      <select
                        multiple
                        style={{ ...ctrl, minHeight: 96 }}
                        value={ov.rolePool}
                        onChange={(e) =>
                          update({ rolePool: getMultiValues(e.currentTarget) })
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
                      <label style={lbl}>User pool</label>
                      <select
                        multiple
                        style={{ ...ctrl, minHeight: 96 }}
                        value={ov.agentPool}
                        onChange={(e) =>
                          update({ agentPool: getMultiValues(e.currentTarget) })
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
                  <div style={{ ...grid, marginTop: 12 }}>
                    <div>
                      <label style={lbl}>Re-open → user</label>
                      <select
                        style={ctrl}
                        value={ov.reopenUserId}
                        onChange={(e) =>
                          update({
                            reopenUserId: e.target.value,
                            reopenRoleId: e.target.value ? "" : ov.reopenRoleId,
                          })
                        }
                      >
                        <option value="">None</option>
                        {users.map((u) => (
                          <option key={u._id} value={u._id}>
                            {displayName(u)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>or Re-open → role</label>
                      <select
                        style={ctrl}
                        value={ov.reopenRoleId}
                        onChange={(e) =>
                          update({
                            reopenRoleId: e.target.value,
                            reopenUserId: e.target.value ? "" : ov.reopenUserId,
                          })
                        }
                      >
                        <option value="">None</option>
                        {roles.map((r) => (
                          <option key={r._id} value={r._id}>
                            {r.name || r.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={card}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16 }}>Auto-close rule</h3>
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
                  checked={acEnabled}
                  onChange={(e) => setAcEnabled(e.target.checked)}
                />
                Enabled
              </label>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
              When enabled, an SR whose field values satisfy the conditions is
              created <strong>Closed</strong> with the remark below. Condition
              fields match the submitted form field names.
            </div>

            {acEnabled && (
              <>
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "#475569" }}>Match</span>
                  <select
                    style={{ ...ctrl, width: 160 }}
                    value={acMatch}
                    onChange={(e) => setAcMatch(e.target.value as "all" | "any")}
                  >
                    <option value="all">All conditions (AND)</option>
                    <option value="any">Any condition (OR)</option>
                  </select>
                </div>

                {acConditions.map((cond, idx) => {
                  const op = AC_OPERATORS.find((o) => o.value === cond.operator);
                  const update = (patch: Partial<AutoCloseCond>) =>
                    setAcConditions((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
                    );
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginTop: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        style={{ ...ctrl, width: 200 }}
                        placeholder="Field name"
                        value={cond.field}
                        onChange={(e) => update({ field: e.target.value })}
                      />
                      <select
                        style={{ ...ctrl, width: 170 }}
                        value={cond.operator}
                        onChange={(e) => update({ operator: e.target.value })}
                      >
                        {AC_OPERATORS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {!op?.noValue && (
                        <input
                          style={{ ...ctrl, width: 200 }}
                          placeholder="Value"
                          value={cond.value}
                          onChange={(e) => update({ value: e.target.value })}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setAcConditions((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        style={{ ...srButton("danger"), padding: "6px 10px" }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() =>
                    setAcConditions((prev) => [
                      ...prev,
                      { field: "", operator: "equals", value: "" },
                    ])
                  }
                  style={{ ...srButton("neutral"), padding: "6px 12px", marginTop: 12 }}
                >
                  + Add condition
                </button>

                <label style={{ ...lbl, marginTop: 16 }}>Closure remark</label>
                <textarea
                  style={{ ...ctrl, minHeight: 72 }}
                  value={acRemark}
                  onChange={(e) => setAcRemark(e.target.value)}
                  placeholder="Placeholders: {{ticketNumber}}, {{subject}}, {{field.YourFieldName}}. Blank uses the project closure-default message."
                />
              </>
            )}
          </div>

          <div style={card}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Email auto-forward</h3>
            <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
              When an email is converted to an SR under this category, forward the
              original to these addresses. One address per line.
            </div>
            <textarea
              style={{ ...ctrl, minHeight: 72, marginTop: 12, fontFamily: "monospace" }}
              value={autoForwardTo}
              onChange={(e) => setAutoForwardTo(e.target.value)}
              placeholder={"procurement@school.org\nfinance@school.org"}
            />
          </div>

          <div style={card}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16 }}>SLA</h3>
              <button
                type="button"
                onClick={recomputeTat}
                disabled={recomputing}
                style={{ ...srButton("neutral"), padding: "6px 12px" }}
                title="Recompute open SR resolution deadlines against the current SLA + working calendar (e.g. after a holiday change)."
              >
                {recomputing ? "Recomputing…" : "Recompute open TATs"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
              <div>
                <label style={lbl}>Response</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    min={0}
                    style={{ ...ctrl, width: 100 }}
                    value={respVal}
                    onChange={(e) => setRespVal(Number(e.target.value))}
                  />
                  <select
                    style={{ ...ctrl, width: 120 }}
                    value={respUnit}
                    onChange={(e) => setRespUnit(e.target.value)}
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Resolution</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    min={0}
                    style={{ ...ctrl, width: 100 }}
                    value={resVal}
                    onChange={(e) => setResVal(Number(e.target.value))}
                  />
                  <select
                    style={{ ...ctrl, width: 120 }}
                    value={resUnit}
                    onChange={(e) => setResUnit(e.target.value)}
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* #7 Per-source SLA overrides */}
            <div style={{ marginTop: 18 }}>
              <label style={lbl}>Per-source overrides</label>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                Optional SLA per submission channel. Leave a field blank to
                inherit the base SLA above.
              </div>
              {SLA_SOURCES.map((src) => {
                const o = slaBySource[src.key] || emptySourceSla;
                const upd = (patch: Partial<SourceSla>) =>
                  setSlaBySource((prev) => ({
                    ...prev,
                    [src.key]: { ...emptySourceSla, ...prev[src.key], ...patch },
                  }));
                return (
                  <div
                    key={src.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      padding: "8px 0",
                      borderTop: "1px solid #eef2f7",
                    }}
                  >
                    <div style={{ width: 130, fontSize: 13, fontWeight: 600, color: "#475569" }}>
                      {src.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>Response</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="—"
                        style={{ ...ctrl, width: 80 }}
                        value={o.respVal}
                        onChange={(e) => upd({ respVal: e.target.value })}
                      />
                      <select
                        style={{ ...ctrl, width: 110 }}
                        value={o.respUnit}
                        onChange={(e) => upd({ respUnit: e.target.value })}
                      >
                        {UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>Resolution</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="—"
                        style={{ ...ctrl, width: 80 }}
                        value={o.resVal}
                        onChange={(e) => upd({ resVal: e.target.value })}
                      />
                      <select
                        style={{ ...ctrl, width: 110 }}
                        value={o.resUnit}
                        onChange={(e) => upd({ resUnit: e.target.value })}
                      >
                        {UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={saveAll}
              disabled={busy}
              style={{
                ...srButton("success"),
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "Saving..." : "Save routing"}
            </button>
            {msg && (
              <span style={{ fontSize: 13, color: "#047857" }}>{msg}</span>
            )}
          </div>
        </>
      )}
    </SrPage>
  );
};

export default ServiceRequestRouting;
