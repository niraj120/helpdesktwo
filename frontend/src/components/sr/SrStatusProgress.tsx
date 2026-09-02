import React, { useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import { SR } from "../../utils/srTheme";

/**
 * One step of the bar = one row of the project's status master, the same list
 * SLA & Escalation drives off. Nothing about the ladder is defined here: the
 * codes, names, order, colours and which status ends the ticket all come from
 * that master, so adding or renaming a status there changes this bar with no
 * code change.
 */
interface Step {
  code: number;
  label: string;
  color?: string;
  isClosed: boolean;
}

/** Light → deep emerald. Completed steps deepen as the work progresses. */
const GREENS = ["#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46"];
const greenFor = (i: number, total: number) => {
  if (total <= 1) return GREENS[2];
  const idx = Math.round((i / (total - 1)) * (GREENS.length - 1));
  return GREENS[Math.min(GREENS.length - 1, idx)];
};

const RED = "#ef4444";
const RED_SOFT = "#fee2e2";

// Keyframes + reduced-motion guard (inline styles can't host @media / @keyframes).
const KEYFRAMES = `
@keyframes srPulseOk { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.5)} 50%{box-shadow:0 0 0 7px rgba(16,185,129,0)} }
@keyframes srPulseBad { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)} 50%{box-shadow:0 0 0 7px rgba(239,68,68,0)} }
@keyframes srShimmer { 0%{background-position:-160px 0} 100%{background-position:160px 0} }
.sr-node-ok{animation:srPulseOk 2.4s ease-in-out infinite}
.sr-node-bad{animation:srPulseBad 1.8s ease-in-out infinite}
.sr-meter-live{background-size:160px 100%;animation:srShimmer 1.6s linear infinite}
@media (prefers-reduced-motion: reduce){
  .sr-node-ok,.sr-node-bad,.sr-meter-live{animation:none!important}
}
`;

const SrStatusProgress: React.FC<{
  ticket: any;
  projectId?: string;
  defaultOpen?: boolean;
}> = ({ ticket, projectId, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  // Statuses come from the project's status master (SLA & Escalation), already
  // filtered to active and sorted by displayOrder by the API.
  const { statuses } = useProjectStatuses(projectId);
  const visible: Step[] = useMemo(
    () =>
      statuses.map((s) => ({
        code: s.code,
        label: s.label,
        color: s.color,
        isClosed: s.isClosed,
      })),
    [statuses],
  );

  const status = Number(ticket?.status);
  const total = visible.length;

  // No status master for this project → nothing to draw. Never fall back to a
  // built-in ladder; the master is the only source.
  if (!total) return null;

  const currentIndex = Math.max(
    0,
    visible.findIndex((s) => Number(s.code) === status),
  );
  const current = visible[currentIndex];

  const breached = !!(
    ticket?.roleLevelSLA?.breachedAt || ticket?.ticketLevelSLA?.breachedAt
  );
  // "Closed" is whatever the master marks as closing the ticket.
  const closed = !!ticket?.closedAt || !!current?.isClosed;
  const failed = breached && !closed;

  const pct = total > 1 ? Math.round((currentIndex / (total - 1)) * 100) : 100;
  // Colours follow the master too, so a recoloured status recolours the bar.
  const headColor = failed
    ? RED
    : current?.color || (closed ? GREENS[5] : GREENS[2]);

  return (
    <div
      style={{
        background: SR.bg,
        border: `1px solid ${failed ? "#fecaca" : SR.border}`,
        borderRadius: 16,
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
        padding: 18,
        marginBottom: 16,
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
        }}
      >
        <div style={{ minWidth: 0, textAlign: "left" }}>
          <div
            style={{
              fontSize: 11,
              color: SR.sub,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Service Request Progress
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 20,
              fontWeight: 800,
              color: headColor,
              lineHeight: 1.2,
            }}
          >
            {failed && <ExclamationTriangleIcon style={{ width: 18, height: 18 }} />}
            {current?.label || status}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: failed ? RED : GREENS[4],
              fontVariantNumeric: "tabular-nums",
              padding: "3px 10px",
              borderRadius: 9999,
              background: failed ? RED_SOFT : "#ecfdf5",
            }}
          >
            {failed ? "Needs attention" : closed ? "Complete" : `${pct}% complete`}
          </span>
          <ChevronDownIcon
            style={{
              width: 18,
              height: 18,
              color: SR.sub,
              transition: "transform .2s ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </button>

      {/* Overall meter — gradient green fill, red tail when failing */}
      <div
        style={{
          marginTop: 14,
          height: 8,
          borderRadius: 9999,
          background: "#eef2f7",
          overflow: "hidden",
        }}
      >
        <div
          className={!failed && !closed ? "sr-meter-live" : undefined}
          style={{
            height: "100%",
            width: `${failed ? 100 : pct}%`,
            borderRadius: 9999,
            transition: "width .45s cubic-bezier(.4,0,.2,1)",
            background: failed
              ? `linear-gradient(90deg, ${GREENS[1]} 0%, ${GREENS[3]} 55%, ${RED} 100%)`
              : `linear-gradient(90deg, ${GREENS[0]}, ${GREENS[2]} 50%, ${GREENS[4]}), linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.45) 50%, rgba(255,255,255,0) 100%)`,
          }}
        />
      </div>

      {/* Stepper */}
      {open && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`,
            marginTop: 18,
          }}
        >
          {visible.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            const isFail = active && failed;
            const isDoneOrActive = done || active;

            const dotColor = isFail
              ? RED
              : done
                ? step.color || greenFor(i, total)
                : active
                  ? step.color || (closed ? GREENS[5] : GREENS[2])
                  : "#e5e7eb";
            const textColor = isFail
              ? RED
              : isDoneOrActive
                ? "#065f46"
                : SR.sub;

            // Connector that runs INTO this node (left segment).
            const connColor =
              i === 0
                ? "transparent"
                : isFail
                  ? RED
                  : i <= currentIndex
                    ? greenFor(i - 1, total)
                    : "#e5e7eb";

            return (
              <div
                key={step.code}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minWidth: 0,
                }}
              >
                {/* rail + dot */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* left connector */}
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      right: "50%",
                      height: 4,
                      borderRadius: 9999,
                      background: connColor,
                      transition: "background .4s ease",
                    }}
                  />
                  {/* right connector */}
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      right: 0,
                      height: 4,
                      borderRadius: 9999,
                      background:
                        i === total - 1
                          ? "transparent"
                          : isFail
                            ? RED
                            : i < currentIndex
                              ? greenFor(i, total)
                              : "#e5e7eb",
                      transition: "background .4s ease",
                    }}
                  />
                  {/* dot */}
                  <span
                    className={active ? (isFail ? "sr-node-bad" : "sr-node-ok") : undefined}
                    style={{
                      position: "relative",
                      width: active ? 30 : 24,
                      height: active ? 30 : 24,
                      borderRadius: 9999,
                      background: dotColor,
                      color: i > currentIndex ? SR.sub : "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                      fontVariantNumeric: "tabular-nums",
                      border: i > currentIndex ? "2px solid #d1d5db" : "none",
                      transition: "background .35s ease, width .2s ease, height .2s ease",
                    }}
                  >
                    {isFail ? (
                      <ExclamationTriangleIcon style={{ width: 15, height: 15 }} />
                    ) : done ? (
                      <CheckIcon style={{ width: 15, height: 15 }} />
                    ) : (
                      i + 1
                    )}
                  </span>
                </div>

                {/* label */}
                <div
                  style={{
                    marginTop: 8,
                    maxWidth: "100%",
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: active ? 800 : 600,
                    color: textColor,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    padding: "0 4px",
                  }}
                  title={step.label}
                >
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SrStatusProgress;
