import React, { useEffect, useState } from "react";
import SrPage from "../../components/sr/SrPage";
import { srButton } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { api } from "../../utils/api";
import { serviceRequestApi } from "../../services/serviceRequests";
import FormFieldBuilder from "../../components/FormFieldBuilder";
import { FormFieldSchema } from "../../utils/conditionEngine";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}

interface SchemaDraft {
  id?: string;
  name: string;
  interactionType: "PSR" | "ISR";
  channel: string;
  isActive: boolean;
  fields: FormFieldSchema[];
}

const CHANNELS = [
  { v: "online", l: "Online (Portal)" },
  { v: "walk_in", l: "Walk-in" },
  { v: "email", l: "Email" },
  { v: "ivr", l: "IVR" },
];

const emptyDraft = (): SchemaDraft => ({
  name: "",
  interactionType: "PSR",
  channel: "online",
  isActive: true,
  fields: [],
});

const ServiceRequestFormSchemas: React.FC<{
  embedded?: boolean;
  projectId?: string;
}> = ({ embedded, projectId: projectIdProp }) => {
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const { currentProjectId } = useProjectContext();
  const [projectIdState, setProjectId] = useState(currentProjectId || "");
  const projectId =
    projectIdProp !== undefined ? projectIdProp : projectIdState;
  const [schemas, setSchemas] = useState<any[]>([]);
  const [draft, setDraft] = useState<SchemaDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
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

  const loadSchemas = async (pid: string) => {
    try {
      const r = await serviceRequestApi.listForms(pid);
      setSchemas(r.data || []);
    } catch (e) {
      console.error(e);
      setSchemas([]);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadSchemas(projectId);
      setDraft(null);
    }
  }, [projectId]);

  const save = async () => {
    if (!projectId || !draft) return;
    if (!draft.name.trim()) {
      setMsg({ type: "err", text: "Name is required." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await serviceRequestApi.saveForm(projectId, draft);
      await loadSchemas(projectId);
      setMsg({ type: "ok", text: "Form schema saved." });
      setDraft(null);
    } catch (e: any) {
      setMsg({
        type: "err",
        text: e?.response?.data?.message || "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (schemaId: string) => {
    if (!projectId) return;
    try {
      await serviceRequestApi.deleteForm(projectId, schemaId);
      await loadSchemas(projectId);
      if (draft?.id === schemaId) setDraft(null);
    } catch (e) {
      console.error(e);
    }
  };

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
    padding: 20,
    marginBottom: 16,
  };
  const ctrl: React.CSSProperties = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    border: "1px solid #d7deea",
    borderRadius: 10,
    fontSize: 14,
    boxSizing: "border-box",
  };
  const label: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    display: "block",
    marginBottom: 6,
  };

  return (
    <SrPage
      title="Service Request Forms"
      subtitle="Configure intake form schemas per interaction type & channel."
      embedded={embedded}
    >

        {!embedded && (
          <div style={{ ...card, maxWidth: 520 }}>
            <label style={label}>Project</label>
            <select
              style={ctrl}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} {p.code ? `(${p.code})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {msg && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
              maxWidth: 520,
              color: msg.type === "ok" ? "#065f46" : "#991b1b",
              background: msg.type === "ok" ? "#ecfdf5" : "#fef2f2",
              border: `1px solid ${msg.type === "ok" ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            {msg.text}
          </div>
        )}

        {projectId && !draft && (
          <div style={card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <h3 style={{ margin: 0 }}>Existing forms</h3>
              <button
                onClick={() => setDraft(emptyDraft())}
                style={srButton("success")}
              >
                + New form
              </button>
            </div>
            {schemas.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 13 }}>
                No form schemas yet.
              </p>
            ) : (
              schemas.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <div>
                    <strong>{s.name}</strong>{" "}
                    <span style={{ color: "#6b7280", fontSize: 13 }}>
                      {s.interactionType} · {s.channel} · v{s.version} ·{" "}
                      {(s.fields || []).length} fields
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() =>
                        setDraft({
                          id: s.id,
                          name: s.name,
                          interactionType: s.interactionType,
                          channel: s.channel,
                          isActive: s.isActive !== false,
                          fields: s.fields || [],
                        })
                      }
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", fontSize: 13, fontWeight: 600, color: "#b91c1c", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {projectId && draft && (
          <div style={card}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={label}>Form name</label>
                <input
                  style={ctrl}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. PSR Online Intake"
                />
              </div>
              <div style={{ width: 160 }}>
                <label style={label}>Interaction type</label>
                <select
                  style={ctrl}
                  value={draft.interactionType}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      interactionType: e.target.value as "PSR" | "ISR",
                    })
                  }
                >
                  <option value="PSR">PSR</option>
                  <option value="ISR">ISR</option>
                </select>
              </div>
              <div style={{ width: 180 }}>
                <label style={label}>Channel</label>
                <select
                  style={ctrl}
                  value={draft.channel}
                  onChange={(e) =>
                    setDraft({ ...draft, channel: e.target.value })
                  }
                >
                  {CHANNELS.map((c) => (
                    <option key={c.v} value={c.v}>
                      {c.l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label style={label}>Fields</label>
            <FormFieldBuilder
              fields={draft.fields}
              onChange={(fields) => setDraft({ ...draft, fields })}
              projectId={projectId}
            />

            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{ ...srButton("success"), cursor: saving ? "default" : "pointer" }}
              >
                {saving ? "Saving…" : "Save form"}
              </button>
              <button
                onClick={() => setDraft(null)}
                style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 14, color: "#374151", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
    </SrPage>
  );
};

export default ServiceRequestFormSchemas;
