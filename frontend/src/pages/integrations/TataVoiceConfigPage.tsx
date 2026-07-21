import React, { useEffect, useState, useCallback } from "react";
import { api } from "../../utils/api";
import { useProjectContext } from "../../contexts/ProjectContext";
import SrPage from "../../components/sr/SrPage";
import { srStyles, srButton, SR } from "../../utils/srTheme";

/**
 * Per-project TATA SmartFlo voice (Click-to-Call) credential editor.
 * The JWT token is write-only: the server returns `hasToken` (never the token),
 * and an empty token field on save preserves the stored one. Styled to match
 * the Service-Request / View-Queries pages (OneOS design system).
 */

interface ProjectOpt {
  _id: string;
  name: string;
}

interface TataVoiceForm {
  baseUrl: string;
  defaultCallerId: string;
  callTimeoutSeconds: string;
  isActive: boolean;
  hasToken: boolean;
}

const EMPTY: TataVoiceForm = {
  baseUrl: "https://api-smartflo.tatateleservices.com/v1",
  defaultCallerId: "",
  callTimeoutSeconds: "",
  isActive: false,
  hasToken: false,
};

const hint: React.CSSProperties = { fontSize: 12, color: "#94a3b8", marginTop: 4 };
const fieldWrap: React.CSSProperties = { marginBottom: 18, maxWidth: 560 };

const TataVoiceConfigPage: React.FC = () => {
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState<string>(currentProjectId || "");
  const [form, setForm] = useState<TataVoiceForm>(EMPTY);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Load selectable projects (same source as the IVR triage page).
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/projects", { params: { limit: 100 } });
        const d: any = res.data;
        const list = d?.data?.projects || d?.projects || d?.data || d || [];
        setProjects(Array.isArray(list) ? list : []);
      } catch {
        setProjects([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (currentProjectId) setProjectId((p) => p || currentProjectId);
  }, [currentProjectId]);

  const load = useCallback(async () => {
    if (!projectId) {
      setForm(EMPTY);
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const r = await api.get(`/projects/${projectId}/tata-voice`);
      const d = r.data?.data || {};
      setForm({
        baseUrl: d.baseUrl || EMPTY.baseUrl,
        defaultCallerId: d.defaultCallerId || "",
        callTimeoutSeconds:
          d.callTimeoutSeconds != null ? String(d.callTimeoutSeconds) : "",
        isActive: !!d.isActive,
        hasToken: !!d.hasToken,
      });
      setToken("");
    } catch (e: any) {
      setMsg({
        ok: false,
        text: e?.response?.data?.message || "Failed to load configuration.",
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!projectId) {
      setMsg({ ok: false, text: "Select a project first." });
      return;
    }
    if (!form.hasToken && !token.trim()) {
      setMsg({ ok: false, text: "API token is required for the first save." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const body: any = {
        baseUrl: form.baseUrl.trim(),
        defaultCallerId: form.defaultCallerId.trim(),
        callTimeoutSeconds: form.callTimeoutSeconds
          ? Number(form.callTimeoutSeconds)
          : null,
        isActive: form.isActive,
      };
      if (token.trim()) body.apiToken = token.trim();
      const r = await api.put(`/projects/${projectId}/tata-voice`, body);
      const d = r.data?.data || {};
      setForm((f) => ({ ...f, hasToken: !!d.hasToken }));
      setToken("");
      setMsg({ ok: true, text: "Saved." });
    } catch (e: any) {
      setMsg({
        ok: false,
        text: e?.response?.data?.message || "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  };

  const projectSelector = (
    <select
      style={{ ...srStyles.ctrl, minWidth: 240 }}
      value={projectId}
      onChange={(e) => setProjectId(e.target.value)}
    >
      <option value="">Select a project…</option>
      {projects.map((p) => (
        <option key={p._id} value={p._id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <SrPage
      title="TATA Voice — Click-to-Call"
      subtitle="SmartFlo credentials for outbound calls. Configured per project."
      actions={projectSelector}
    >
      {msg && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            background: msg.ok ? SR.successBg : SR.dangerBg,
            color: msg.ok ? SR.success : SR.danger,
          }}
        >
          {msg.text}
        </div>
      )}

      <div
        style={{
          marginBottom: 16,
          padding: "10px 14px",
          borderRadius: 8,
          fontSize: 12.5,
          background: "#eff6ff",
          color: "#1e40af",
          border: "1px solid #bfdbfe",
          lineHeight: 1.5,
        }}
      >
        This page configures <b>outbound Click-to-Call only</b> (calling customers
        back from the helpdesk). <b>Inbound call logs</b> are captured by the
        webhook you set up in the SmartFlo portal — that covers all your DIDs/agents
        and is configured separately.
      </div>

      <div style={srStyles.card}>
        {!projectId ? (
          <div style={{ padding: 24, color: "#64748b", fontSize: 14 }}>
            Select a project above to configure its Click-to-Call credentials.
          </div>
        ) : loading ? (
          <div style={{ padding: 24, color: "#64748b" }}>Loading…</div>
        ) : (
          <>
            <div style={fieldWrap}>
              <label style={srStyles.label}>API Base URL</label>
              <input
                style={srStyles.ctrl}
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              />
            </div>

            <div style={fieldWrap}>
              <label style={srStyles.label}>
                SmartFlo API Token (JWT)
                {form.hasToken && (
                  <span style={{ color: SR.success, marginLeft: 8, fontWeight: 500 }}>
                    ✓ configured
                  </span>
                )}
              </label>
              <input
                style={srStyles.ctrl}
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  form.hasToken
                    ? "Leave blank to keep the existing token"
                    : "Paste the SmartFlo JWT token"
                }
              />
              <div style={hint}>
                Generated in the SmartFlo portal. Stored encrypted; never shown back.
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={srStyles.label}>Outbound Caller ID (for click-to-call)</label>
              <input
                style={srStyles.ctrl}
                value={form.defaultCallerId}
                onChange={(e) =>
                  setForm({ ...form, defaultCallerId: e.target.value })
                }
                placeholder="e.g. +918062351628"
              />
              <div style={hint}>
                Number shown to the customer when an agent calls them back. Blank →
                account pilot number. (Does not affect inbound call logs.)
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={srStyles.label}>Call timeout (seconds, optional)</label>
              <input
                style={srStyles.ctrl}
                type="number"
                value={form.callTimeoutSeconds}
                onChange={(e) =>
                  setForm({ ...form, callTimeoutSeconds: e.target.value })
                }
                placeholder="Auto-disconnect after N seconds"
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                marginBottom: 20,
                fontSize: 14,
                color: "#334155",
              }}
            >
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: SR.primary }}
              />
              Enable Click-to-Call for this project
            </label>

            <div>
              <button
                onClick={save}
                disabled={saving}
                style={srButton("primary")}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </SrPage>
  );
};

export default TataVoiceConfigPage;
