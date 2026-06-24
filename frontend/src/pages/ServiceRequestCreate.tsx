import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SrPage from "../components/sr/SrPage";
import { srStyles, srButton, SR } from "../utils/srTheme";
import { useProjectContext } from "../contexts/ProjectContext";
import { usePermissions } from "../hooks/usePermissions";
import { PERMISSIONS } from "../constants/permissions";
import { api } from "../utils/api";
import { serviceRequestApi } from "../services/serviceRequests";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}
interface CategoryNode {
  _id: string;
  name: string;
  parentId?: string | null;
  path?: string;
  sr?: { proactiveHelpText?: string };
}
interface ChildOpt {
  id?: string;
  name?: string;
  grade?: string;
  enrollmentId?: string;
}
interface ParentOpt {
  name?: string;
  mobile?: string;
  email?: string;
  school?: string;
  parentCode?: string;
  children?: ChildOpt[];
}
interface ClassifyChannel {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  enabled: boolean;
  order: number;
  requiredPermission?: string;
  flow: string;
  routing?: { interactionType?: "PSR" | "ISR"; target?: string };
}

type Step = "type" | "classify" | "form";

/** Mirrors backend SR_DEFAULT_CLASSIFY_CHANNELS — used as a safety fallback so
 * the wizard never dead-ends if a project has no channels persisted yet. */
const DEFAULT_CHANNELS: ClassifyChannel[] = [
  {
    key: "existing_parent",
    label: "Existing Parent",
    description: "A current parent / student raising a request.",
    icon: "👪",
    color: "#2563EB",
    enabled: true,
    order: 1,
    flow: "existing_parent",
    routing: { interactionType: "PSR", target: "sr" },
  },
  {
    key: "prospect_parent",
    label: "Prospect Parent",
    description: "Admissions or new-school enquiry. Forwards to CRM.",
    icon: "🌱",
    color: "#16a34a",
    enabled: true,
    order: 2,
    flow: "prospect_parent",
    routing: { target: "lead" },
  },
  {
    key: "vendor",
    label: "Vendor / Business",
    description: "Supplies, licensing or services. Routes an SR to Procurement.",
    icon: "📦",
    color: "#b45309",
    enabled: true,
    order: 3,
    flow: "vendor",
    routing: { interactionType: "ISR", target: "procurement" },
  },
  {
    key: "job",
    label: "Job Application",
    description: "Careers, teaching openings, or resumes. Routes an SR to HR.",
    icon: "💼",
    color: "#7c3aed",
    enabled: true,
    order: 4,
    flow: "job",
    routing: { interactionType: "ISR", target: "hr" },
  },
  {
    key: "others",
    label: "Others / General",
    description: "General feedback or support questions. Routes a custom SR.",
    icon: "🗂️",
    color: "#0891b2",
    enabled: true,
    order: 5,
    flow: "others",
    routing: { interactionType: "PSR", target: "sr" },
  },
  {
    key: "junk",
    label: "Junk / Telemarketing",
    description: "Spam, wrong number or blank voicemail. Archived as junk.",
    icon: "🗑️",
    color: "#6b7280",
    enabled: true,
    order: 6,
    flow: "junk",
    routing: { target: "junk_archive" },
  },
];

const ServiceRequestCreate: React.FC<{ embedded?: boolean }> = ({
  embedded,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const linkedPsrId = (location.state as any)?.linkedPsrId as
    | string
    | undefined;
  const { currentProjectId, userProjects } = useProjectContext();
  const { hasPermission } = usePermissions();

  // Permission booleans (global). Whether the option is actually OFFERED also
  // depends on the SELECTED project having SR/PSR/ISR enabled (see canPSR/canISR
  // below) — otherwise a permitted user would see SR for every project even ones
  // where it was never turned on.
  const permPSR = hasPermission(PERMISSIONS.SR_PSR_CREATE);
  const permISR = hasPermission(PERMISSIONS.SR_ISR_CREATE);
  const canAssignEmails = hasPermission(PERMISSIONS.SR_ASSIGN_EMAILS);
  const canPriority = hasPermission(PERMISSIONS.SR_PRIORITY_OVERRIDE);
  const canOffline = hasPermission(PERMISSIONS.SR_OFFLINE_ENTRY);

  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");
  const [config, setConfig] = useState<any>(null);

  const [step, setStep] = useState<Step>("type");
  const [interactionType, setInteractionType] = useState<"PSR" | "ISR" | "">("");
  const [channel, setChannel] = useState<ClassifyChannel | null>(null);

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  // Existing-parent flow
  const [parentQuery, setParentQuery] = useState("");
  const [parentResults, setParentResults] = useState<ParentOpt[]>([]);
  const [parent, setParent] = useState<ParentOpt | null>(null);
  const [parentSource, setParentSource] = useState<string>("");
  const [selectedChildren, setSelectedChildren] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);

  // Prospect-parent flow
  const [prospect, setProspect] = useState({
    name: "",
    mobile: "",
    email: "",
    enquiry: "",
  });

  // Assignee-emails block (ISR)
  const [assigneeEmails, setAssigneeEmails] = useState("");

  // Priority & schedule block
  const [overridePriority, setOverridePriority] = useState(false);
  const [priority, setPriority] = useState("MEDIUM");
  const [scheduleDate, setScheduleDate] = useState("");

  // Offline / RE-entry block
  const [createdByRE, setCreatedByRE] = useState(false);
  const [requesterEmail, setRequesterEmail] = useState("");
  const [otpKey, setOtpKey] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpMsg, setOtpMsg] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const debounce = useRef<any>(null);

  const singleProject = userProjects.length === 1;

  /* ---- load projects + auto-pick ---- */
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

  useEffect(() => {
    if (!projectId && singleProject) setProjectId(userProjects[0]._id);
    else if (!projectId && currentProjectId) setProjectId(currentProjectId);
  }, [singleProject, userProjects, currentProjectId]); // eslint-disable-line

  // Linked-ISR entry (from a PSR "Create linked ISR" button): force ISR + skip
  // the type step.
  useEffect(() => {
    if (linkedPsrId) {
      setInteractionType("ISR");
      setStep("classify");
    }
  }, [linkedPsrId]);

  /* ---- load SR config + categories on project change ---- */
  useEffect(() => {
    if (!projectId) {
      setConfig(null);
      setCategories([]);
      return;
    }
    (async () => {
      try {
        const r = await serviceRequestApi.getConfig(projectId);
        setConfig(r.data || null);
      } catch (e) {
        console.error(e);
        setConfig(null);
      }
      try {
        const res = await api.get("/categories", { params: { projectId } });
        const d: any = res.data;
        const list: CategoryNode[] =
          d?.data?.categories || d?.categories || d?.data || d || [];
        setCategories(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
        setCategories([]);
      }
    })();
  }, [projectId]);

  const leafCategories = useMemo(() => {
    const parentIds = new Set(
      categories
        .map((c) => (c.parentId ? String(c.parentId) : ""))
        .filter(Boolean),
    );
    return categories
      .filter((c) => !parentIds.has(String(c._id)))
      .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name));
  }, [categories]);

  const channels: ClassifyChannel[] = useMemo(() => {
    // Fall back to the bundled defaults when the project has none persisted yet
    // (e.g. config not seeded, or backend not yet restarted on this build).
    const raw: ClassifyChannel[] = config?.classifyChannels?.length
      ? config.classifyChannels
      : DEFAULT_CHANNELS;
    return raw
      .filter((c) => c.enabled)
      .filter((c) => !c.requiredPermission || hasPermission(c.requiredPermission))
      .sort((a, b) => a.order - b.order);
  }, [config]); // eslint-disable-line

  const blocks = config?.blocks || {};

  // Per-project enablement gates the offering. config loads async per project;
  // until it arrives (or if SR is off for the project) no type cards show.
  const srEnabled = !!config?.enabled;
  const canPSR = permPSR && srEnabled && !!config?.psr?.enabled;
  const canISR = permISR && srEnabled && !!config?.isr?.enabled;
  const srDisabledHere = !!projectId && config !== null && !srEnabled;

  /* ---- parent search ---- */
  const onParentQuery = (q: string) => {
    setParentQuery(q);
    setParent(null);
    setSelectedChildren([]);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setParentResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        setSearching(true);
        const r = await serviceRequestApi.parentLookup(q.trim(), projectId);
        setParentResults(r.data || []);
        setParentSource(r.source?.name || "");
      } catch (e) {
        console.error(e);
        setParentResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const sendOtp = async () => {
    setOtpMsg("");
    try {
      const r = await api.post("/otp/send-email", {
        email: requesterEmail,
        projectId,
      });
      setOtpKey(r.data?.otpKey || r.data?.data?.otpKey || "");
      setOtpMsg("OTP sent.");
    } catch (e: any) {
      setOtpMsg(e?.response?.data?.message || "Failed to send OTP.");
    }
  };

  const verifyOtp = async () => {
    setOtpMsg("");
    try {
      await api.post("/otp/verify", { otpKey, otp: otpCode });
      setOtpVerified(true);
      setOtpMsg("Email verified ✓");
    } catch (e: any) {
      setOtpMsg(e?.response?.data?.message || "Invalid OTP.");
    }
  };

  const resetFlow = () => {
    setChannel(null);
    setCategoryId("");
    setSubject("");
    setDescription("");
    setParent(null);
    setParentQuery("");
    setParentResults([]);
    setSelectedChildren([]);
    setProspect({ name: "", mobile: "", email: "", enquiry: "" });
    setAssigneeEmails("");
    setMsg(null);
  };

  const pickType = (t: "PSR" | "ISR") => {
    setInteractionType(t);
    resetFlow();
    setStep("classify");
  };

  const pickChannel = (c: ClassifyChannel) => {
    setChannel(c);
    setMsg(null);
    setStep("form");
  };

  const finalInteraction = (): "PSR" | "ISR" =>
    (channel?.routing?.interactionType as any) || interactionType || "PSR";

  const flow = channel?.flow || "others";

  const canSubmit = useMemo(() => {
    if (submitting || !projectId) return false;
    if (flow === "junk") return true;
    if (flow === "prospect_parent")
      return !!(prospect.name && (prospect.mobile || prospect.email));
    if (!subject.trim()) return false;
    if (flow === "existing_parent")
      return !!parent && selectedChildren.length > 0 && !!categoryId;
    return !!categoryId;
  }, [
    submitting,
    projectId,
    flow,
    prospect,
    subject,
    parent,
    selectedChildren,
    categoryId,
  ]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setMsg(null);
    try {
      // Junk — log only, no ticket.
      if (flow === "junk") {
        setMsg({ type: "ok", text: "Logged as junk / telemarketing." });
        setTimeout(() => {
          resetFlow();
          setStep("type");
        }, 900);
        return;
      }

      // Prospect — create a lead, not an SR.
      if (flow === "prospect_parent") {
        await serviceRequestApi.leads.create({
          projectId,
          name: prospect.name,
          mobile: prospect.mobile,
          email: prospect.email,
          enquiry: prospect.enquiry,
          source: "sr_wizard",
        });
        setMsg({ type: "ok", text: "Lead forwarded to CRM." });
        setTimeout(() => {
          resetFlow();
          setStep("type");
        }, 900);
        return;
      }

      const chosenChildren = (parent?.children || []).filter((_, i) =>
        selectedChildren.includes(i),
      );

      const payload: any = {
        projectId,
        interactionType: linkedPsrId ? "ISR" : finalInteraction(),
        requestType: "SR",
        channel: "walk_in",
        categoryId,
        subject: subject.trim(),
        description: description.trim(),
        classification: channel?.key,
        skipDuplicateCheck: true,
      };
      if (linkedPsrId) payload.linkedPsrId = linkedPsrId;

      if (flow === "existing_parent" && parent) {
        payload.parent = {
          name: parent.name,
          mobile: parent.mobile,
          email: parent.email,
          school: parent.school,
          parentCode: parent.parentCode,
        };
        payload.children = chosenChildren;
        const firstChildId = chosenChildren.find((c) => c.id)?.id;
        if (firstChildId) payload.studentUserId = firstChildId;
        payload.metadata = { studentName: chosenChildren[0]?.name };
      }

      // Assignee emails (ISR) block
      if (
        canAssignEmails &&
        blocks?.assigneeEmails?.enabled &&
        finalInteraction() === "ISR" &&
        assigneeEmails.trim()
      ) {
        payload.assignedToEmails = assigneeEmails
          .split(/[,;\n]/)
          .map((e) => e.trim())
          .filter(Boolean);
      }

      // Priority & schedule block
      if (canPriority && blocks?.prioritySchedule?.enabled && overridePriority) {
        payload.priority = priority;
        if (scheduleDate) payload.scheduleDispatchDate = scheduleDate;
      }

      // Offline / RE-entry block
      if (canOffline && blocks?.offlineReEntry?.enabled && createdByRE) {
        if (requesterEmail && !otpVerified) {
          setMsg({ type: "err", text: "Verify the requester email (OTP) first." });
          setSubmitting(false);
          return;
        }
        payload.createdByRE = true;
        payload.requesterEmail = requesterEmail;
      }

      const r = await serviceRequestApi.create(payload);
      const num = r.data?.ticketNumber;
      setMsg({ type: "ok", text: `Created ${num}. Redirecting…` });
      setTimeout(() => navigate(`/tickets/${r.data?.ticketId}`), 900);
    } catch (e: any) {
      setMsg({
        type: "err",
        text: e?.response?.data?.message || "Failed to create service request.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- shared styles ---------- */
  const card: React.CSSProperties = { ...srStyles.card, maxWidth: 760 };
  const label = srStyles.label;
  const ctrl: React.CSSProperties = { ...srStyles.ctrl, width: "100%" };

  if (!permPSR && !permISR) {
    return (
      <SrPage title="Generate Service Request" embedded={embedded}>
        <div style={{ ...card, color: SR.sub }}>
          You don't have permission to create service requests.
        </div>
      </SrPage>
    );
  }

  /* ---------- step: choose ISR / PSR ---------- */
  const renderTypeStep = () => (
    <div style={card}>
      {renderProjectField()}
      <label style={label}>What would you like to raise?</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginTop: 4,
        }}
      >
        {canPSR && (
          <TypeCard
            icon="👪"
            title="PSR — Parent Service Request"
            desc="Raise a request on behalf of a parent / student."
            color={SR.primary}
            disabled={!projectId}
            onClick={() => pickType("PSR")}
          />
        )}
        {canISR && (
          <TypeCard
            icon="🏛️"
            title="ISR — Internal Service Request"
            desc="Raise an internal request (vendor, HR, admin, etc.)."
            color="#7c3aed"
            disabled={!projectId}
            onClick={() => pickType("ISR")}
          />
        )}
      </div>
      {!projectId && (
        <p style={{ color: SR.warn, fontSize: 13, marginTop: 12 }}>
          Select a project first.
        </p>
      )}
      {srDisabledHere && (
        <p style={{ color: SR.warn, fontSize: 13, marginTop: 12 }}>
          Service Requests are not enabled for this project. Turn them on in SR
          Settings → General.
        </p>
      )}
      {projectId && srEnabled && !canPSR && !canISR && (
        <p style={{ color: SR.sub, fontSize: 13, marginTop: 12 }}>
          Neither PSR nor ISR is enabled for this project (or you lack the
          create permission).
        </p>
      )}
    </div>
  );

  /* ---------- step: classify ---------- */
  const renderClassifyStep = () => (
    <div style={card}>
      <BackBar onBack={() => setStep("type")} label={`${interactionType} →`} />
      <h3 style={{ margin: "6px 0 2px", fontSize: 18, color: SR.text }}>
        How would you classify this?
      </h3>
      <p style={{ fontSize: 13, color: SR.sub, marginBottom: 14 }}>
        Pick a channel to route this request correctly.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {channels.map((c) => (
          <button
            key={c.key}
            onClick={() => pickChannel(c)}
            style={{
              textAlign: "left",
              background: "#fff",
              border: `1px solid ${SR.border}`,
              borderRadius: 12,
              padding: 14,
              cursor: "pointer",
              transition: "all .15s",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = c.color || SR.primary)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = SR.border)
            }
          >
            <span
              style={{
                fontSize: 20,
                width: 38,
                height: 38,
                borderRadius: 10,
                background: (c.color || SR.primary) + "22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {c.icon || "•"}
            </span>
            <span>
              <div style={{ fontWeight: 700, fontSize: 14, color: SR.text }}>
                {c.label}
              </div>
              <div style={{ fontSize: 12, color: SR.sub, marginTop: 2 }}>
                {c.description}
              </div>
            </span>
          </button>
        ))}
        {channels.length === 0 && (
          <p style={{ color: SR.sub, fontSize: 13 }}>
            No channels configured. Ask an admin to set them in SR Settings.
          </p>
        )}
      </div>
    </div>
  );

  /* ---------- step: form ---------- */
  const renderProjectField = () =>
    singleProject ? (
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Project</label>
        <div
          style={{
            ...ctrl,
            background: "#f9fafc",
            color: SR.text,
            display: "flex",
            alignItems: "center",
          }}
        >
          {userProjects[0]?.name}
        </div>
      </div>
    ) : (
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Project</label>
        <select
          style={ctrl}
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setCategoryId("");
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
    );

  const renderExistingParent = () => (
    <>
      <label style={label}>Search Parent (MDM)</label>
      <input
        style={ctrl}
        placeholder="Search by parent name, mobile, email, school…"
        value={parent ? parent.name || "" : parentQuery}
        onChange={(e) => onParentQuery(e.target.value)}
      />
      {parentSource && (
        <div style={{ fontSize: 11, color: SR.sub, marginTop: 4 }}>
          Source: {parentSource}
        </div>
      )}
      {!parent && parentResults.length > 0 && (
        <div
          style={{
            border: `1px solid ${SR.border}`,
            borderRadius: 8,
            marginTop: 6,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {parentResults.map((p, i) => (
            <div
              key={i}
              onClick={() => {
                setParent(p);
                setParentResults([]);
                setSelectedChildren([]);
              }}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderBottom: `1px solid ${SR.rowBorder}`,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, color: SR.text }}>
                {p.name || "—"}
              </div>
              <div style={{ color: SR.sub, fontSize: 12 }}>
                {[p.mobile, p.email, p.school].filter(Boolean).join("  •  ")}
              </div>
            </div>
          ))}
        </div>
      )}
      {searching && (
        <div style={{ fontSize: 12, color: SR.sub, marginTop: 6 }}>
          Searching…
        </div>
      )}

      {parent && (
        <div
          style={{
            marginTop: 12,
            background: "#f9fafc",
            border: `1px solid ${SR.border}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 14 }}>{parent.name}</strong>
            <button
              onClick={() => {
                setParent(null);
                setParentQuery("");
              }}
              style={{
                background: "none",
                border: "none",
                color: SR.primary,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Change
            </button>
          </div>
          <div style={{ fontSize: 12, color: SR.sub, marginTop: 2 }}>
            {[parent.mobile, parent.email, parent.school]
              .filter(Boolean)
              .join("  •  ")}
          </div>

          <label style={{ ...label, marginTop: 12 }}>
            Select child(ren) <span style={{ color: SR.danger }}>*</span>
          </label>
          {(parent.children || []).length === 0 ? (
            <p style={{ fontSize: 12, color: SR.sub }}>
              No children found for this parent.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(parent.children || []).map((ch, i) => {
                const sel = selectedChildren.includes(i);
                return (
                  <label
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      border: `1px solid ${sel ? SR.primary : SR.border}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      background: sel ? "#eff6ff" : "#fff",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() =>
                        setSelectedChildren((prev) =>
                          prev.includes(i)
                            ? prev.filter((x) => x !== i)
                            : [...prev, i],
                        )
                      }
                    />
                    <span style={{ fontSize: 13, color: SR.text }}>
                      {ch.name || "—"}
                      {ch.grade ? (
                        <span style={{ color: SR.sub }}> · {ch.grade}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );

  const renderProspect = () => (
    <>
      <label style={label}>Parent / Enquirer Name *</label>
      <input
        style={{ ...ctrl, marginBottom: 12 }}
        value={prospect.name}
        onChange={(e) => setProspect({ ...prospect, name: e.target.value })}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={label}>Mobile</label>
          <input
            style={ctrl}
            value={prospect.mobile}
            onChange={(e) =>
              setProspect({ ...prospect, mobile: e.target.value })
            }
          />
        </div>
        <div>
          <label style={label}>Email</label>
          <input
            style={ctrl}
            value={prospect.email}
            onChange={(e) => setProspect({ ...prospect, email: e.target.value })}
          />
        </div>
      </div>
      <label style={{ ...label, marginTop: 12 }}>Enquiry</label>
      <textarea
        style={{ ...ctrl, minHeight: 90 }}
        value={prospect.enquiry}
        onChange={(e) => setProspect({ ...prospect, enquiry: e.target.value })}
        placeholder="Admission / school enquiry details"
      />
    </>
  );

  const renderCategoryAndDetails = () => {
    const selectedCategory = categories.find(
      (c) => String(c._id) === categoryId,
    );
    return (
      <>
        <label style={{ ...label, marginTop: 14 }}>Category / Sub-category</label>
        <select
          style={{ ...ctrl, marginBottom: 6 }}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Select a sub-category…</option>
          {leafCategories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.path || c.name}
            </option>
          ))}
        </select>
        {selectedCategory?.sr?.proactiveHelpText && (
          <div
            style={{
              background: SR.successBg,
              border: "1px solid #a7f3d0",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              color: "#065f46",
              marginTop: 6,
            }}
          >
            {selectedCategory.sr.proactiveHelpText}
          </div>
        )}
        <label style={{ ...label, marginTop: 14 }}>Subject</label>
        <input
          style={{ ...ctrl, marginBottom: 12 }}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief subject"
        />
        <label style={label}>Description / Comments</label>
        <textarea
          style={{ ...ctrl, minHeight: 100 }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details of the request / complaint"
        />
      </>
    );
  };

  const renderAssigneeEmails = () =>
    canAssignEmails &&
    blocks?.assigneeEmails?.enabled &&
    finalInteraction() === "ISR" ? (
      <div style={{ ...card, marginTop: 0 }}>
        <label style={label}>Specific assignee(s) — email</label>
        <p style={{ fontSize: 12, color: SR.sub, margin: "0 0 6px" }}>
          Use when one or more specific people should own this ISR. First email =
          primary assignee.
        </p>
        <textarea
          style={{ ...ctrl, minHeight: 70 }}
          value={assigneeEmails}
          onChange={(e) => setAssigneeEmails(e.target.value)}
          placeholder="person.one@school.edu, person.two@school.edu"
        />
        <p style={{ fontSize: 11, color: SR.sub, marginTop: 4 }}>
          Separate with commas, semicolons, or new lines.
        </p>
      </div>
    ) : null;

  const renderPriorityBlock = () =>
    canPriority && blocks?.prioritySchedule?.enabled ? (
      <div style={{ ...card, marginTop: 0 }}>
        <label
          style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}
        >
          <input
            type="checkbox"
            checked={overridePriority}
            onChange={(e) => setOverridePriority(e.target.checked)}
          />
          📅 Override priority and schedule manually
        </label>
        {overridePriority && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div>
              <label style={label}>Priority</label>
              <select
                style={ctrl}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label style={label}>Schedule Dispatch Date (optional)</label>
              <input
                type="date"
                style={ctrl}
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    ) : null;

  const renderOfflineBlock = () =>
    canOffline && blocks?.offlineReEntry?.enabled ? (
      <div style={{ ...card, marginTop: 0 }}>
        <label
          style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}
        >
          <input
            type="checkbox"
            checked={createdByRE}
            onChange={(e) => setCreatedByRE(e.target.checked)}
          />
          📄 Created by RE (Offline Entry) — on behalf of requester
        </label>
        {createdByRE && (
          <div style={{ marginTop: 12 }}>
            <label style={label}>Requester email from directory *</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...ctrl, flex: 1 }}
                value={requesterEmail}
                onChange={(e) => {
                  setRequesterEmail(e.target.value);
                  setOtpVerified(false);
                }}
                placeholder="parent / employee / vendor email"
              />
              <button
                onClick={sendOtp}
                disabled={!requesterEmail}
                style={{ ...srButton("neutral"), whiteSpace: "nowrap" }}
              >
                Send OTP
              </button>
            </div>
            {otpKey && !otpVerified && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  style={{ ...ctrl, flex: 1 }}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Enter OTP"
                />
                <button
                  onClick={verifyOtp}
                  style={{ ...srButton("primary"), whiteSpace: "nowrap" }}
                >
                  Verify
                </button>
              </div>
            )}
            {otpMsg && (
              <p
                style={{
                  fontSize: 12,
                  marginTop: 6,
                  color: otpVerified ? SR.success : SR.warn,
                }}
              >
                {otpMsg}
              </p>
            )}
          </div>
        )}
      </div>
    ) : null;

  const renderFormStep = () => (
    <>
      <div style={card}>
        <BackBar
          onBack={() => setStep("classify")}
          label={`${finalInteraction()} · ${channel?.label || ""}`}
        />
        {flow === "existing_parent" && renderExistingParent()}
        {flow === "prospect_parent" && renderProspect()}
        {flow !== "prospect_parent" &&
          flow !== "junk" &&
          renderCategoryAndDetails()}
        {flow === "junk" && (
          <p style={{ fontSize: 13, color: SR.sub }}>
            This call will be logged as junk / telemarketing. No ticket is
            created.
          </p>
        )}
      </div>

      {flow !== "junk" && flow !== "prospect_parent" && (
        <>
          {renderAssigneeEmails()}
          {renderPriorityBlock()}
          {renderOfflineBlock()}
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            ...srButton("success"),
            background: canSubmit ? SR.success : "#9ca3af",
            cursor: canSubmit ? "pointer" : "default",
          }}
        >
          {submitting
            ? "Submitting…"
            : flow === "prospect_parent"
              ? "Forward to CRM"
              : flow === "junk"
                ? "Log as Junk"
                : "Create Service Request"}
        </button>
        {msg && (
          <span
            style={{
              fontSize: 13,
              color: msg.type === "ok" ? SR.success : SR.danger,
            }}
          >
            {msg.text}
          </span>
        )}
      </div>
    </>
  );

  return (
    <SrPage
      title="Generate Service Request"
      subtitle="Raise a PSR or ISR — pick the type, classify, then fill the form."
      embedded={embedded}
    >
      {linkedPsrId && (
        <div
          style={{
            ...srStyles.card,
            maxWidth: 760,
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderLeft: "4px solid #2563EB",
            fontSize: 13,
            color: SR.text,
          }}
        >
          🔗 Creating an <strong>ISR linked to the parent PSR</strong>. It will
          appear under the PSR's Linked ISRs.
        </div>
      )}
      {step === "type" && !linkedPsrId && renderTypeStep()}
      {step === "classify" && renderClassifyStep()}
      {step === "form" && renderFormStep()}
    </SrPage>
  );
};

/* ---------- small presentational helpers ---------- */
const TypeCard: React.FC<{
  icon: string;
  title: string;
  desc: string;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon, title, desc, color, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      textAlign: "left",
      background: "#fff",
      border: `1px solid ${SR.border}`,
      borderRadius: 12,
      padding: 18,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
    }}
    onMouseEnter={(e) => !disabled && (e.currentTarget.style.borderColor = color)}
    onMouseLeave={(e) => (e.currentTarget.style.borderColor = SR.border)}
  >
    <div style={{ fontSize: 26 }}>{icon}</div>
    <div style={{ fontWeight: 700, fontSize: 15, marginTop: 8, color: SR.text }}>
      {title}
    </div>
    <div style={{ fontSize: 13, color: SR.sub, marginTop: 4 }}>{desc}</div>
  </button>
);

const BackBar: React.FC<{ onBack: () => void; label: string }> = ({
  onBack,
  label,
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
    <button
      onClick={onBack}
      style={{
        background: "none",
        border: "none",
        color: SR.primary,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        padding: 0,
      }}
    >
      ← Back
    </button>
    <span style={{ fontSize: 12, color: SR.sub }}>{label}</span>
  </div>
);

export default ServiceRequestCreate;
