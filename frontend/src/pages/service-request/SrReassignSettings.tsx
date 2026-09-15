/**
 * SR Settings → Reassign.
 *
 * Who the Reassign / Delegate pickers offer on a service request. The people
 * are always helpdesk users — a request can only go to someone who can sign in
 * and work it — so this decides which of them appear:
 *   - roles never offered (students and parents have accounts too);
 *   - whether the department must be chosen before any name is listed;
 *   - whether the search is limited to this project's users.
 *
 * Departments come from the department master and the mapping on each user
 * (User Management). A user imported from MDM whose department is missing from
 * the master will not appear under any department until that department is
 * added there — the check at the bottom lists those.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { serviceRequestApi } from "../../services/serviceRequests";
import { api } from "../../utils/api";
import { srStyles, srButton, SR } from "../../utils/srTheme";
import SrPage from "../../components/sr/SrPage";
import MessageBanner, { SrMessage } from "../../components/sr/MessageBanner";

interface Role {
  _id: string;
  name: string;
  code?: string;
}

const label: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#475467",
  display: "block",
  margin: "14px 0 6px",
};
const hint: React.CSSProperties = { fontSize: 12, color: SR.sub, fontWeight: 400 };
const check: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  fontSize: 13,
  color: "#344054",
  marginTop: 10,
};

/**
 * Searchable multi-select. A project can carry hundreds of roles, so they are
 * picked from a searchable list rather than a wall of chips; what is chosen
 * stays visible above the box.
 */
const MultiSelect: React.FC<{
  options: { _id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  emptyText: string;
}> = ({ options, selected, onChange, placeholder, emptyText }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Clicking anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const byId = useMemo(
    () => new Map(options.map((o) => [o._id, o.name])),
    [options],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) => o.name.toLowerCase().includes(q))
      : options;
    // Chosen first, then alphabetical — what is set stays findable.
    return [...list].sort((a, b) => {
      const sa = selected.includes(a._id) ? 0 : 1;
      const sb = selected.includes(b._id) ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name);
    });
  }, [options, query, selected]);

  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );

  return (
    <div ref={boxRef} style={{ position: "relative", marginTop: 10 }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {selected.map((id) => (
            <span
              key={id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px 3px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                color: "#b91c1c",
                background: "#fef2f2",
                border: "1px solid #fecaca",
              }}
            >
              {byId.get(id) || id}
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label={`Remove ${byId.get(id) || id}`}
                style={{
                  border: 0,
                  background: "none",
                  color: "#b91c1c",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            style={{
              border: 0,
              background: "none",
              color: SR.sub,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Clear all
          </button>
        </div>
      )}

      <input
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder={
          selected.length ? `${selected.length} selected — ${placeholder}` : placeholder
        }
        style={{ ...srStyles.ctrl, width: "100%" }}
      />

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 30,
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 260,
            overflowY: "auto",
            background: "#fff",
            border: `1px solid ${SR.border}`,
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(15,23,42,.12)",
          }}
        >
          {shown.length === 0 && (
            <div style={{ padding: "10px 12px", ...hint }}>{emptyText}</div>
          )}
          {shown.map((o) => {
            const on = selected.includes(o._id);
            return (
              <label
                key={o._id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  cursor: "pointer",
                  background: on ? "#f8fafc" : "#fff",
                  borderBottom: `1px solid ${SR.rowBorder}`,
                }}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(o._id)} />
                {o.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SrReassignSettings: React.FC<{ projectId: string; embedded?: boolean }> = ({
  projectId,
  embedded,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<SrMessage | null>(null);

  const [reqCanReply, setReqCanReply] = useState(true);
  const [reqCanComment, setReqCanComment] = useState(true);
  const [reqCanAttach, setReqCanAttach] = useState(true);
  const [reqCanReassign, setReqCanReassign] = useState(false);
  const [reqCanDelegate, setReqCanDelegate] = useState(false);
  const [requireDepartment, setRequireDepartment] = useState(false);
  const [restrictToProject, setRestrictToProject] = useState(true);
  const [excludeRoleIds, setExcludeRoleIds] = useState<string[]>([]);

  const [roles, setRoles] = useState<Role[]>([]);
  const [unmapped, setUnmapped] = useState<string[]>([]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      serviceRequestApi.getConfig(projectId).catch(() => null),
      api.get("/roles").catch(() => null),
      api.get(`/departments/project/${projectId}`).catch(() => null),
      api
        .get("/users", { params: { isActive: true, limit: 500, projectId } })
        .catch(() => null),
    ])
      .then(([cfgRes, rolesRes, deptRes, usersRes]: any[]) => {
        const rq = cfgRes?.data?.requester || {};
        setReqCanReply(rq.canReply !== false);
        setReqCanComment(rq.canComment !== false);
        setReqCanAttach(rq.canAttach !== false);
        setReqCanReassign(rq.canReassign === true);
        setReqCanDelegate(rq.canDelegate === true);
        const r = cfgRes?.data?.reassign || {};
        setRequireDepartment(!!r.requireDepartment);
        setRestrictToProject(r.restrictToProject !== false);
        setExcludeRoleIds((r.excludeRoleIds || []).map(String));
        setRoles(rolesRes?.data?.data || []);

        // Departments a user carries (free text, typically from an MDM/HRMS
        // import) that the master does not have yet.
        const masterNames = new Set(
          (deptRes?.data?.data || []).map((d: any) =>
            String(d.name || "").trim().toLowerCase(),
          ),
        );
        const list =
          usersRes?.data?.data?.users ??
          usersRes?.data?.data ??
          usersRes?.data?.users ??
          [];
        const missing = new Set<string>();
        (Array.isArray(list) ? list : []).forEach((u: any) => {
          const name = String(u?.department || "").trim();
          if (name && !masterNames.has(name.toLowerCase())) missing.add(name);
        });
        setUnmapped([...missing].sort());
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await serviceRequestApi.updateConfig(projectId, {
        reassign: { requireDepartment, restrictToProject, excludeRoleIds },
        requester: {
          canReply: reqCanReply,
          canComment: reqCanComment,
          canAttach: reqCanAttach,
          canReassign: reqCanReassign,
          canDelegate: reqCanDelegate,
        },
      });
      setMsg({ type: "ok", text: "Saved." });
    } catch (e: any) {
      setMsg({ type: "err", text: e?.response?.data?.message || "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  if (!projectId) {
    return (
      <div style={{ ...srStyles.card, color: SR.sub }}>
        Pick a project to configure its reassign settings.
      </div>
    );
  }

  return (
    <SrPage
      title="Access & reassign"
      subtitle="What the raiser may do on their own request, and who the Reassign / Delegate pickers offer."
      embedded={embedded}
      showHeaderWhenEmbedded={false}
    >
      <div style={srStyles.card}>
        <MessageBanner message={msg} />
        {loading && <div style={hint}>Loading…</div>}

        <label style={check}>
          <input
            type="checkbox"
            checked={requireDepartment}
            onChange={(e) => setRequireDepartment(e.target.checked)}
          />
          <span>
            Pick the department first
            <span style={{ ...hint, display: "block" }}>
              No names are listed until a department is chosen. Use it where every
              team is large enough that a plain search is unhelpful.
            </span>
          </span>
        </label>

        <label style={check}>
          <input
            type="checkbox"
            checked={restrictToProject}
            onChange={(e) => setRestrictToProject(e.target.checked)}
          />
          <span>
            Only this project's users
            <span style={{ ...hint, display: "block" }}>
              Off means any active helpdesk user may receive the request.
            </span>
          </span>
        </label>

        <label style={label}>The person who raised the request</label>
        <div style={hint}>
          A request is worked by its assignee, but whoever raised it answers
          questions and confirms the outcome. Which statuses they may set is
          decided per status ("Who may apply it"); these are the everyday actions.
          Reassign and delegate are off by default — moving a request around belongs
          to whoever is working it, and they still keep both on requests assigned to
          them.
        </div>
        {(
          [
            ["Reply on their own request", reqCanReply, setReqCanReply],
            ["Add comments", reqCanComment, setReqCanComment],
            ["Attach files", reqCanAttach, setReqCanAttach],
            ["Reassign it to someone else", reqCanReassign, setReqCanReassign],
            ["Delegate it", reqCanDelegate, setReqCanDelegate],
          ] as [string, boolean, (v: boolean) => void][]
        ).map(([text, value, set]) => (
          <label key={text} style={check}>
            <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
            <span>{text}</span>
          </label>
        ))}

        <label style={label}>Never offer these roles</label>
        <div style={hint}>
          Students and parents hold accounts too — a request must never be handed to
          one.
        </div>
        <MultiSelect
          options={roles.map((r) => ({ _id: r._id, name: r.name }))}
          selected={excludeRoleIds}
          onChange={setExcludeRoleIds}
          placeholder="Search roles to exclude..."
          emptyText={roles.length ? "No role matches that search." : "No roles available."}
        />

        {unmapped.length > 0 && (
          <div
            style={{
              marginTop: 18,
              border: "1px solid #fde68a",
              background: "#fffbeb",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <strong style={{ fontSize: 13, color: "#92400e" }}>
              {unmapped.length} department(s) on users are missing from the master
            </strong>
            <div style={{ ...hint, color: "#92400e", marginTop: 4 }}>
              These came with imported users. Add them under Master Setup → Departments
              and map the users, otherwise those people never show under a department:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {unmapped.map((d) => (
                <span
                  key={d}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: "#fff",
                    border: "1px solid #fde68a",
                    fontSize: 12,
                    color: "#92400e",
                    fontWeight: 600,
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <button onClick={save} disabled={saving} style={srButton("primary")}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </SrPage>
  );
};

export default SrReassignSettings;
