import React, { useEffect, useState } from "react";
import { PERMISSIONS } from "../constants/permissions";
import { serviceRequestApi } from "../services/serviceRequests";
import { SR, srButton, srStyles } from "../utils/srTheme";

type Width = "full" | "half" | "third";

const permissionOptions = ["", ...Object.keys(PERMISSIONS).sort()];

const cardBox: React.CSSProperties = {
  border: `1px solid ${SR.border}`,
  borderRadius: 12,
  padding: 14,
  background: "#f9fafc",
};

const PsrDetailLayoutSettings: React.FC<{
  embedded?: boolean;
  projectId: string;
}> = ({ projectId }) => {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await serviceRequestApi.getConfig(projectId);
      setDetail(r.data?.psrDetail);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]); // eslint-disable-line

  const patch = (path: string, value: any) => {
    setDetail((d: any) => {
      const next = structuredClone(d);
      const parts = path.split(".");
      let node = next;
      for (let i = 0; i < parts.length - 1; i += 1) node = node[parts[i]];
      node[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const updateList = (list: "cards" | "tabs", index: number, update: any) => {
    setDetail((d: any) => ({
      ...d,
      [list]: d[list].map((item: any, i: number) =>
        i === index ? { ...item, ...update } : item,
      ),
    }));
  };

  const updateStep = (index: number, update: any) => {
    setDetail((d: any) => ({
      ...d,
      statusProgress: {
        ...d.statusProgress,
        steps: d.statusProgress.steps.map((item: any, i: number) =>
          i === index ? { ...item, ...update } : item,
        ),
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      await serviceRequestApi.updateConfig(projectId, { psrDetail: detail });
      setMsg("Saved.");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const ctrl = { ...srStyles.ctrl, width: "100%" } as React.CSSProperties;
  const label = srStyles.label;

  if (loading || !detail) return <div style={srStyles.card}>Loading...</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={srStyles.card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: SR.text, fontSize: 16 }}>
              PSR / ISR Detail Layout
            </h3>
            <p style={{ margin: "4px 0 0", color: SR.sub, fontSize: 13 }}>
              Configure status progress, body cards, and ticket tabs per project.
            </p>
          </div>
          <button style={srButton("primary")} disabled={saving} onClick={save}>
            {saving ? "Saving..." : "Save layout"}
          </button>
        </div>
        {msg && <p style={{ color: msg === "Saved." ? SR.success : SR.danger }}>{msg}</p>}
      </div>

      <div style={srStyles.card}>
        <h3 style={{ margin: "0 0 12px", color: SR.text, fontSize: 16 }}>
          Status Progress
        </h3>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!!detail.statusProgress?.enabled}
            onChange={(e) => patch("statusProgress.enabled", e.target.checked)}
          />
          Enabled
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <input
            type="checkbox"
            checked={!!detail.statusProgress?.defaultOpen}
            onChange={(e) => patch("statusProgress.defaultOpen", e.target.checked)}
          />
          Open by default
        </label>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {detail.statusProgress.steps.map((step: any, i: number) => (
            <div
              key={step.code}
              style={{
                ...cardBox,
                display: "grid",
                gridTemplateColumns: "80px 1fr 120px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={step.enabled}
                  onChange={(e) => updateStep(i, { enabled: e.target.checked })}
                />
                {step.code}
              </label>
              <input
                style={ctrl}
                value={step.label}
                onChange={(e) => updateStep(i, { label: e.target.value })}
              />
              <span style={{ color: SR.sub, fontSize: 12 }}>Status step</span>
            </div>
          ))}
        </div>
      </div>

      <ConfigList
        title="Body Cards"
        list={detail.cards}
        onChange={(i, update) => updateList("cards", i, update)}
        label={label}
        ctrl={ctrl}
        includeWidth
      />

      <ConfigList
        title="Tabs"
        list={detail.tabs}
        onChange={(i, update) => updateList("tabs", i, update)}
        label={label}
        ctrl={ctrl}
      />
    </div>
  );
};

const ConfigList: React.FC<{
  title: string;
  list: any[];
  onChange: (index: number, update: any) => void;
  label: React.CSSProperties;
  ctrl: React.CSSProperties;
  includeWidth?: boolean;
}> = ({ title, list, onChange, label, ctrl, includeWidth }) => (
  <div style={srStyles.card}>
    <h3 style={{ margin: "0 0 12px", color: SR.text, fontSize: 16 }}>{title}</h3>
    <div style={{ display: "grid", gap: 12 }}>
      {list.map((item, i) => (
        <div
          key={item.key}
          style={{
            ...cardBox,
            display: "grid",
            gridTemplateColumns: includeWidth
              ? "110px 1fr 90px 110px 180px"
              : "110px 1fr 90px 180px",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={item.enabled}
              onChange={(e) => onChange(i, { enabled: e.target.checked })}
            />
            Enabled
          </label>
          <div>
            <label style={label}>Label</label>
            <input
              style={ctrl}
              value={item.label}
              onChange={(e) => onChange(i, { label: e.target.value })}
            />
          </div>
          <div>
            <label style={label}>Order</label>
            <input
              type="number"
              style={ctrl}
              value={item.order}
              onChange={(e) => onChange(i, { order: Number(e.target.value) })}
            />
          </div>
          {includeWidth && (
            <div>
              <label style={label}>Width</label>
              <select
                style={ctrl}
                value={item.width}
                onChange={(e) => onChange(i, { width: e.target.value as Width })}
              >
                <option value="full">Full</option>
                <option value="half">Half</option>
                <option value="third">Third</option>
              </select>
            </div>
          )}
          <div>
            <label style={label}>Permission</label>
            <select
              style={ctrl}
              value={item.requiredPermission || ""}
              onChange={(e) =>
                onChange(i, { requiredPermission: e.target.value || undefined })
              }
            >
              {permissionOptions.map((p) => (
                <option key={p || "none"} value={p}>
                  {p || "None"}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default PsrDetailLayoutSettings;
