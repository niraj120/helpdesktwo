import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PERMISSIONS } from "../../constants/permissions";
import { usePermissions } from "../../hooks/usePermissions";
import { serviceRequestApi } from "../../services/serviceRequests";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import { SR, srButton } from "../../utils/srTheme";
import MessageBanner, { SrMessage } from "./MessageBanner";

const userName = (u: any) =>
  !u
    ? "-"
    : u.fullName ||
      `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
      u.email ||
      u._id;

// Label/colour come from the project's status master (SLA & Escalation).
const StatusPill: React.FC<{ status: number; projectId?: string }> = ({
  status,
  projectId,
}) => {
  const { metaFor } = useProjectStatuses(projectId);
  const m = metaFor(status);
  return (
    <span
      style={{
        padding: "1px 9px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        color: m.color,
        background: m.bg,
      }}
    >
      {m.label}
    </span>
  );
};

const LinkedIsrPanel: React.FC<{
  psrId?: string;
  parentTicketId?: string;
  projectId?: string;
  variant?: "card" | "tab";
  allowCreate?: boolean;
  allowLink?: boolean;
}> = ({
  psrId,
  parentTicketId,
  projectId,
  variant = "card",
  allowCreate = true,
  allowLink = true,
}) => {
  const parentId = parentTicketId || psrId || "";
  const navigate = useNavigate();
  const location = useLocation();
  const isProjectPortal = location.pathname.includes("/portal/");
  const serviceRequestPath = (suffix: string) =>
    isProjectPortal
      ? `${location.pathname.replace(/\/service-requests(?:\/.*)?$/, "")}/service-requests${suffix}`
      : `/service-requests${suffix}`;
  const { hasPermission } = usePermissions();
  const canCreate = allowCreate && hasPermission(PERMISSIONS.SR_ISR_CREATE);
  const canLink =
    allowLink &&
    (hasPermission(PERMISSIONS.SR_ISR_LINK) ||
      canCreate ||
      hasPermission(PERMISSIONS.SR_REASSIGN));

  const [data, setData] = useState<{ items: any[]; total: number; done: number }>({
    items: [],
    total: 0,
    done: 0,
  });
  const [loading, setLoading] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<SrMessage | null>(null);
  const deb = useRef<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await serviceRequestApi.linkedIsrs(parentId);
      setData({ items: r.items || [], total: r.total || 0, done: r.done || 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (parentId) load();
  }, [parentId]); // eslint-disable-line

  const searchIsr = (val: string) => {
    setQ(val);
    if (deb.current) clearTimeout(deb.current);
    if (val.trim().length < 2) {
      setResults([]);
      return;
    }
    deb.current = setTimeout(async () => {
      try {
        const r = await serviceRequestApi.list({
          interactionType: "ISR",
          search: val.trim(),
          projectId,
          limit: 8,
        });
        setResults(
          (r.items || []).filter((i: any) => String(i.linkedPsrId || "") !== parentId),
        );
      } catch (e) {
        console.error(e);
      }
    }, 350);
  };

  const link = async (isrId: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await serviceRequestApi.linkParentTicket(isrId, parentId);
      setMsg({ type: "ok", text: "ISR linked." });
      setShowLink(false);
      setQ("");
      setResults([]);
      load();
    } catch (e: any) {
      setMsg({ type: "err", text: e?.response?.data?.message || "Link failed." });
    } finally {
      setBusy(false);
    }
  };

  const createLinked = () =>
    navigate(serviceRequestPath("?tab=new"), {
      state: { linkedParentTicketId: parentId, interactionType: "ISR" },
    });

  const pending = Math.max(0, data.total - data.done);
  const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
  const barColor =
    data.total === 0 ? "#e5e7eb" : pending === 0 ? "#10b981" : "#f59e0b";
  const wrap = variant === "card";

  const body = (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <strong style={{ color: SR.text }}>
          Linked ISRs{" "}
          <span style={{ color: SR.sub, fontWeight: 500 }}>
            ({data.done}/{data.total})
          </span>
        </strong>
        <div style={{ display: "flex", gap: 8 }}>
          {canCreate && (
            <button style={srButton("primary")} onClick={createLinked}>
              + Create linked ISR
            </button>
          )}
          {canLink && (
            <button
              style={srButton("neutral")}
              onClick={() => setShowLink((s) => !s)}
            >
              Link existing
            </button>
          )}
        </div>
      </div>

      <MessageBanner message={msg} />

      {data.total > 0 && (
        <div
          style={{
            height: 6,
            borderRadius: 9999,
            background: "#eef1f6",
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 9999,
              background: barColor,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}

      {showLink && (
        <div style={{ marginBottom: 12 }}>
          <input
            placeholder="Search ISR by number or subject..."
            value={q}
            onChange={(e) => searchIsr(e.target.value)}
            style={{
              width: "100%",
              minHeight: 38,
              padding: "8px 12px",
              border: `1px solid ${SR.inputBorder}`,
              borderRadius: 10,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
          {results.length > 0 && (
            <div
              style={{
                border: `1px solid ${SR.border}`,
                borderRadius: 10,
                marginTop: 6,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {results.map((isr) => (
                <div
                  key={isr._id}
                  onClick={() => !busy && link(isr._id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <span>
                    <strong style={{ color: "#2563EB" }}>{isr.ticketNumber}</strong>{" "}
                    <span style={{ color: SR.sub }}>{isr.subject}</span>
                  </span>
                  <StatusPill status={isr.status} projectId={projectId} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: SR.sub, fontSize: 13 }}>Loading...</p>
      ) : data.items.length === 0 ? (
        <p style={{ color: SR.sub, fontSize: 13 }}>No ISRs linked yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.items.map((isr) => (
            <div
              key={isr._id}
              onClick={() => navigate(serviceRequestPath(`/${isr._id}`))}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "9px 12px",
                border: `1px solid ${SR.border}`,
                borderRadius: 10,
                cursor: "pointer",
                background: "#fff",
              }}
            >
              <span style={{ fontSize: 13, minWidth: 0 }}>
                <strong style={{ color: "#2563EB" }}>{isr.ticketNumber}</strong>{" "}
                <span style={{ color: SR.sub }}>{isr.subject}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: SR.sub }}>
                  {userName(isr.assignedTo)}
                </span>
                <StatusPill status={isr.status} projectId={projectId} />
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (!wrap) return <div>{body}</div>;
  return (
    <div
      style={{
        background: SR.bg,
        border: `1px solid ${SR.border}`,
        borderRadius: 14,
        boxShadow: SR.cardShadow,
        padding: 16,
      }}
    >
      {body}
    </div>
  );
};

export default LinkedIsrPanel;
