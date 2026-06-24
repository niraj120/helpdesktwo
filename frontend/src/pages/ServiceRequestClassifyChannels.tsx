import React, { useEffect, useState } from "react";
import { srStyles, srButton, SR } from "../utils/srTheme";
import { serviceRequestApi } from "../services/serviceRequests";

/**
 * Admin manager for the configurable SR classify-call channels + the optional
 * create-form blocks (assignee emails / priority & schedule / offline RE entry).
 * Any new channel with flow "custom" works in the wizard with no code change.
 */

const FLOWS = [
  "existing_parent",
  "prospect_parent",
  "vendor",
  "job",
  "others",
  "junk",
  "custom",
];
const TARGETS = ["sr", "crm", "lead", "procurement", "hr", "junk_archive"];

interface Channel {
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

const emptyChannel = (order: number): Channel => ({
  key: "",
  label: "",
  description: "",
  icon: "•",
  color: "#2563EB",
  enabled: true,
  order,
  flow: "custom",
  routing: { interactionType: "PSR", target: "sr" },
});

const ServiceRequestClassifyChannels: React.FC<{
  embedded?: boolean;
  projectId: string;
}> = ({ projectId }) => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [blocks, setBlocks] = useState<any>({
    assigneeEmails: { enabled: true },
    prioritySchedule: { enabled: true },
    offlineReEntry: { enabled: true },
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await serviceRequestApi.getConfig(projectId);
      setChannels(r.data?.classifyChannels || []);
      if (r.data?.blocks) setBlocks(r.data.blocks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]); // eslint-disable-line

  const update = (i: number, patch: Partial<Channel>) =>
    setChannels((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const updateRouting = (i: number, patch: any) =>
    setChannels((cs) =>
      cs.map((c, idx) =>
        idx === i ? { ...c, routing: { ...c.routing, ...patch } } : c,
      ),
    );
  const add = () =>
    setChannels((cs) => [...cs, emptyChannel(cs.length + 1)]);
  const remove = (i: number) =>
    setChannels((cs) => cs.filter((_, idx) => idx !== i));

  const save = async () => {
    setMsg("");
    // basic validation
    for (const c of channels) {
      if (!c.key.trim() || !c.label.trim()) {
        setMsg("Every channel needs a key and label.");
        return;
      }
    }
    setSaving(true);
    try {
      await serviceRequestApi.updateConfig(projectId, {
        classifyChannels: channels,
        blocks,
      });
      setMsg("Saved ✓");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const label = srStyles.label;
  const ctrl = { ...srStyles.ctrl, width: "100%" } as React.CSSProperties;

  if (loading) return <div style={srStyles.card}>Loading…</div>;

  return (
    <>
      {/* Optional create-form blocks */}
      <div style={srStyles.card}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16, color: SR.text }}>
          Optional Form Blocks
        </h3>
        {[
          ["assigneeEmails", "Specific assignee emails (ISR)"],
          ["prioritySchedule", "Priority & schedule override"],
          ["offlineReEntry", "Offline / RE entry (requester OTP)"],
        ].map(([k, lbl]) => (
          <label
            key={k}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 14,
              marginBottom: 8,
            }}
          >
            <input
              type="checkbox"
              checked={!!blocks?.[k]?.enabled}
              onChange={(e) =>
                setBlocks((b: any) => ({
                  ...b,
                  [k]: { enabled: e.target.checked },
                }))
              }
            />
            {lbl}
          </label>
        ))}
        <p style={{ fontSize: 12, color: SR.sub, marginTop: 4 }}>
          Each block is also gated by the matching permission
          (SR_ASSIGN_EMAILS / SR_PRIORITY_OVERRIDE / SR_OFFLINE_ENTRY).
        </p>
      </div>

      {/* Classify channels */}
      <div style={srStyles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, color: SR.text }}>
            Classify-Call Channels
          </h3>
          <button style={srButton("primary")} onClick={add}>
            + Add Channel
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {channels.map((c, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${SR.border}`,
                borderRadius: 12,
                padding: 14,
                background: "#f9fafc",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <label
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                  />
                  <span style={{ fontSize: 13, color: SR.sub }}>Enabled</span>
                </label>
                <button
                  onClick={() => remove(i)}
                  style={{
                    background: "none",
                    border: "none",
                    color: SR.danger,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Remove
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 80px",
                  gap: 10,
                }}
              >
                <div>
                  <label style={label}>Key *</label>
                  <input
                    style={ctrl}
                    value={c.key}
                    onChange={(e) => update(i, { key: e.target.value })}
                    placeholder="existing_parent"
                  />
                </div>
                <div>
                  <label style={label}>Label *</label>
                  <input
                    style={ctrl}
                    value={c.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                </div>
                <div>
                  <label style={label}>Order</label>
                  <input
                    type="number"
                    style={ctrl}
                    value={c.order}
                    onChange={(e) =>
                      update(i, { order: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={label}>Description</label>
                <input
                  style={ctrl}
                  value={c.description || ""}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 110px 1fr 1fr",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <div>
                  <label style={label}>Icon</label>
                  <input
                    style={ctrl}
                    value={c.icon || ""}
                    onChange={(e) => update(i, { icon: e.target.value })}
                  />
                </div>
                <div>
                  <label style={label}>Color</label>
                  <input
                    type="color"
                    style={{ ...ctrl, padding: 2 }}
                    value={c.color || "#2563EB"}
                    onChange={(e) => update(i, { color: e.target.value })}
                  />
                </div>
                <div>
                  <label style={label}>Flow</label>
                  <select
                    style={ctrl}
                    value={c.flow}
                    onChange={(e) => update(i, { flow: e.target.value })}
                  >
                    {FLOWS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={label}>Required Permission</label>
                  <input
                    style={ctrl}
                    value={c.requiredPermission || ""}
                    onChange={(e) =>
                      update(i, { requiredPermission: e.target.value })
                    }
                    placeholder="(any SR creator)"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <div>
                  <label style={label}>Interaction Type</label>
                  <select
                    style={ctrl}
                    value={c.routing?.interactionType || ""}
                    onChange={(e) =>
                      updateRouting(i, {
                        interactionType: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">(default)</option>
                    <option value="PSR">PSR</option>
                    <option value="ISR">ISR</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Target</label>
                  <select
                    style={ctrl}
                    value={c.routing?.target || ""}
                    onChange={(e) =>
                      updateRouting(i, { target: e.target.value || undefined })
                    }
                  >
                    <option value="">(default)</option>
                    {TARGETS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
          {channels.length === 0 && (
            <p style={{ fontSize: 13, color: SR.sub }}>
              No channels yet. Add one above.
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
          <button style={srButton("success")} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save Channels"}
          </button>
          {msg && (
            <span
              style={{
                fontSize: 13,
                color: msg.includes("✓") ? SR.success : SR.danger,
              }}
            >
              {msg}
            </span>
          )}
        </div>
      </div>
    </>
  );
};

export default ServiceRequestClassifyChannels;
