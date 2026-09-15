/**
 * Status rules — the part of the status editor (Query Config → Ticket
 * Statuses) that says how a status behaves, per record type.
 *
 * Queries and service requests share the project's status list but not its
 * rules: SRs may allow one re-open and need SR_REOPEN while the query desk
 * allows any, so each status has a rule set for "query" and one for "sr".
 * A rule set left unconfigured keeps the old behaviour for that type.
 */
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../utils/api";

export interface StatusRule {
  restrictNext?: boolean;
  allowedNext?: number[];
  restrictPrev?: boolean;
  allowedPrev?: number[];
  maxPerTicket?: number;
  permission?: string;
  allowedActors?: ("assignee" | "raiser")[];
  assignOnApply?: {
    mode: "keep" | "role" | "user" | "reopenRouting";
    roleId?: string;
    userId?: string;
  };
}

export interface StatusRuleFields {
  code: number;
  name: string;
  requireConfirmation?: boolean;
  isReopen?: boolean;
  showInProgress?: boolean;
  rules?: { query?: StatusRule; sr?: StatusRule };
}

type Scope = "query" | "sr";

const SCOPE_LABEL: Record<Scope, string> = {
  query: "Queries",
  sr: "Service Requests (PSR / ISR)",
};

const UNCONFIGURED_NOTE: Record<Scope, string> = {
  query: "Not configured — any status may follow, no limit, no extra permission.",
  sr: "Not configured — the built-in service request lifecycle applies.",
};

const box: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  marginTop: 10,
  background: "#fafafa",
};
const hint: React.CSSProperties = { display: "block", fontSize: 11, color: "#6b7280", fontWeight: 400 };
const ctl: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontSize: 13,
  background: "#fff",
};
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginTop: 8 };

const StatusRulesEditor: React.FC<{
  status: StatusRuleFields;
  allStatuses: { code: number; name: string }[];
  onChange: (patch: Partial<StatusRuleFields>) => void;
}> = ({ status, allStatuses, onChange }) => {
  const [scope, setScope] = useState<Scope>("sr");
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [roles, setRoles] = useState<{ _id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ _id: string; name: string }[]>([]);

  // Pickers. Each is optional — if the admin cannot read a list, the field
  // falls back to typing the value.
  useEffect(() => {
    api
      .get("/permissions/grouped")
      .then((r: any) => {
        const grouped = r?.data?.data || {};
        const codes = Object.values(grouped)
          .flat()
          .map((p: any) => p?.code)
          .filter((c: any) => typeof c === "string" && /^(SR_|TICKET_)/.test(c));
        setPermissionCodes([...new Set(codes as string[])].sort());
      })
      .catch(() => setPermissionCodes([]));
    api
      .get("/roles")
      .then((r: any) => setRoles((r?.data?.data || []).map((x: any) => ({ _id: x._id, name: x.name }))))
      .catch(() => setRoles([]));
    api
      .get("/users", { params: { isActive: true, limit: 500 } })
      .then((r: any) => {
        const list = r?.data?.data?.users ?? r?.data?.data ?? r?.data?.users ?? [];
        setUsers(
          (Array.isArray(list) ? list : []).map((u: any) => ({
            _id: u._id,
            name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
          })),
        );
      })
      .catch(() => setUsers([]));
  }, []);

  const rule = status.rules?.[scope];
  const configured = !!rule;
  const others = useMemo(
    () => [...allStatuses].sort((a, b) => a.code - b.code),
    [allStatuses],
  );

  const setRule = (next: StatusRule | undefined) =>
    onChange({ rules: { ...(status.rules || {}), [scope]: next } });
  const patchRule = (p: Partial<StatusRule>) => setRule({ ...(rule || {}), ...p });

  const toggleNext = (code: number) => {
    const cur = new Set(rule?.allowedNext || []);
    cur.has(code) ? cur.delete(code) : cur.add(code);
    patchRule({ allowedNext: [...cur].sort((a, b) => a - b) });
  };
  const togglePrev = (code: number) => {
    const cur = new Set(rule?.allowedPrev || []);
    cur.has(code) ? cur.delete(code) : cur.add(code);
    patchRule({ allowedPrev: [...cur].sort((a, b) => a - b) });
  };

  const assign = rule?.assignOnApply?.mode || "keep";

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Behaviour</div>

      <label style={row}>
        <input
          type="checkbox"
          checked={!!status.requireConfirmation}
          onChange={(e) => onChange({ requireConfirmation: e.target.checked })}
        />
        <span>
          Ask for confirmation before applying
          <span style={hint}>The agent confirms in a dialog; nothing changes on a single click.</span>
        </span>
      </label>
      <label style={row}>
        <input
          type="checkbox"
          checked={!!status.isReopen}
          onChange={(e) => onChange({ isReopen: e.target.checked })}
        />
        <span>
          Part of the re-open cycle
          <span style={hint}>
            Moving from a closing status into this one counts as a re-open; the progress
            bar shows it as a second leg instead of going backwards.
          </span>
        </span>
      </label>
      <label style={row}>
        <input
          type="checkbox"
          checked={status.showInProgress !== false}
          onChange={(e) => onChange({ showInProgress: e.target.checked })}
        />
        <span>
          Show as a step of the progress bar
          <span style={hint}>Turn off for side exits such as Cancelled.</span>
        </span>
      </label>

      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginTop: 16 }}>Rules</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {(["sr", "query"] as Scope[]).map((sc) => (
          <button
            key={sc}
            type="button"
            onClick={() => setScope(sc)}
            style={{
              ...ctl,
              cursor: "pointer",
              fontWeight: 600,
              borderColor: scope === sc ? "#4f46e5" : "#e5e7eb",
              color: scope === sc ? "#4338ca" : "#374151",
              background: scope === sc ? "#eef2ff" : "#fff",
            }}
          >
            {SCOPE_LABEL[sc]}
            {status.rules?.[sc] ? " ●" : ""}
          </button>
        ))}
      </div>

      <div style={box}>
        <label style={{ ...row, marginTop: 0 }}>
          <input
            type="checkbox"
            checked={configured}
            onChange={(e) =>
              setRule(e.target.checked ? { restrictNext: false, allowedNext: [], assignOnApply: { mode: "keep" } } : undefined)
            }
          />
          <strong style={{ fontSize: 13 }}>Configure rules for {SCOPE_LABEL[scope]}</strong>
        </label>
        {!configured && <span style={{ ...hint, marginTop: 6 }}>{UNCONFIGURED_NOTE[scope]}</span>}

        {configured && (
          <>
            {/* Allowed next statuses */}
            <label style={row}>
              <input
                type="checkbox"
                checked={!!rule?.restrictNext}
                onChange={(e) => patchRule({ restrictNext: e.target.checked })}
              />
              <span>
                Only these statuses may follow "{status.name || "this status"}"
                <span style={hint}>
                  Untick to allow any status. Tick this status itself to allow re-applying it
                  (e.g. revising a Work In Progress date).
                </span>
              </span>
            </label>
            {rule?.restrictNext && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginLeft: 24 }}>
                {others.map((s) => {
                  const on = (rule.allowedNext || []).includes(s.code);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => toggleNext(s.code)}
                      style={{
                        ...ctl,
                        padding: "4px 10px",
                        borderRadius: 999,
                        cursor: "pointer",
                        borderColor: on ? "#4f46e5" : "#e5e7eb",
                        background: on ? "#eef2ff" : "#fff",
                        color: on ? "#4338ca" : "#374151",
                        fontWeight: 600,
                      }}
                      aria-pressed={on}
                    >
                      {on ? "✓ " : ""}
                      {s.name}
                      {s.code === status.code ? " (itself)" : ""}
                    </button>
                  );
                })}
                {!(rule.allowedNext || []).length && (
                  <span style={hint}>None selected — this becomes a final status for {SCOPE_LABEL[scope]}.</span>
                )}
              </div>
            )}

            {/* Which statuses may lead INTO this one */}
            <label style={row}>
              <input
                type="checkbox"
                checked={!!rule?.restrictPrev}
                onChange={(e) => patchRule({ restrictPrev: e.target.checked })}
              />
              <span>
                "{status.name || "This status"}" may only follow these statuses
                <span style={hint}>
                  The other direction. Use it to say where a status may appear at all —
                  e.g. Re-open only after Closed — without editing every other status.
                </span>
              </span>
            </label>
            {rule?.restrictPrev && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginLeft: 24 }}>
                {others.map((s) => {
                  const on = (rule.allowedPrev || []).includes(s.code);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => togglePrev(s.code)}
                      style={{
                        ...ctl,
                        padding: "4px 10px",
                        borderRadius: 999,
                        cursor: "pointer",
                        borderColor: on ? "#4f46e5" : "#e5e7eb",
                        background: on ? "#eef2ff" : "#fff",
                        color: on ? "#4338ca" : "#374151",
                        fontWeight: 600,
                      }}
                      aria-pressed={on}
                    >
                      {on ? "✓ " : ""}
                      {s.name}
                      {s.code === status.code ? " (itself)" : ""}
                    </button>
                  );
                })}
                {!(rule.allowedPrev || []).length && (
                  <span style={hint}>
                    None selected — "{status.name}" cannot be reached for {SCOPE_LABEL[scope]}.
                  </span>
                )}
              </div>
            )}

            {/* Max per ticket */}
            <div style={{ ...row, marginTop: 12 }}>
              <span style={{ fontSize: 13, minWidth: 190 }}>Max times per ticket</span>
              <input
                type="number"
                min={0}
                value={rule?.maxPerTicket ?? ""}
                placeholder="No limit"
                onChange={(e) =>
                  patchRule({ maxPerTicket: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })
                }
                style={{ ...ctl, width: 110 }}
              />
              <span style={hint}>e.g. 1 on Re-open = a ticket can be re-opened once.</span>
            </div>

            {/* Who, by their part in the request, may apply it */}
            <div style={{ ...row, marginTop: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 13, minWidth: 190, marginTop: 6 }}>
                Who may apply it
              </span>
              <div>
                {(
                  [
                    ["assignee", "The assignee"],
                    ["raiser", "The person who raised it"],
                  ] as const
                ).map(([key, text]) => {
                  const on = (rule?.allowedActors || []).includes(key);
                  return (
                    <label key={key} style={{ ...row, marginTop: 4 }}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const cur = new Set(rule?.allowedActors || []);
                          on ? cur.delete(key) : cur.add(key);
                          patchRule({ allowedActors: [...cur] as any });
                        }}
                      />
                      {text}
                    </label>
                  );
                })}
                <span style={hint}>
                  Tick none to leave it open to anyone holding the permission. Tick
                  only "the assignee" to stop the raiser moving it themselves.
                </span>
              </div>
            </div>

            {/* Permission */}
            <div style={{ ...row, marginTop: 12 }}>
              <span style={{ fontSize: 13, minWidth: 190 }}>Permission needed to apply</span>
              {permissionCodes.length ? (
                <select
                  value={rule?.permission || ""}
                  onChange={(e) => patchRule({ permission: e.target.value || undefined })}
                  style={{ ...ctl, minWidth: 220 }}
                >
                  <option value="">Anyone who can change status</option>
                  {permissionCodes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={rule?.permission || ""}
                  placeholder="e.g. SR_CLOSE (blank = anyone)"
                  onChange={(e) => patchRule({ permission: e.target.value.trim() || undefined })}
                  style={{ ...ctl, minWidth: 220 }}
                />
              )}
            </div>

            {/* Assign on apply */}
            <div style={{ ...row, marginTop: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, minWidth: 190 }}>When applied, assign to</span>
              <select
                value={assign}
                onChange={(e) =>
                  patchRule({ assignOnApply: { mode: e.target.value as any } })
                }
                style={{ ...ctl, minWidth: 220 }}
              >
                <option value="keep">Keep the current assignee</option>
                <option value="role">A user with a role…</option>
                <option value="user">A specific user…</option>
                {scope === "sr" && (
                  <option value="reopenRouting">SR re-open routing (category / project setup)</option>
                )}
              </select>
              {assign === "role" &&
                (roles.length ? (
                  <select
                    value={rule?.assignOnApply?.roleId || ""}
                    onChange={(e) => patchRule({ assignOnApply: { mode: "role", roleId: e.target.value } })}
                    style={{ ...ctl, minWidth: 200 }}
                  >
                    <option value="">Select a role…</option>
                    {roles.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={hint}>Role list unavailable — you need permission to view roles.</span>
                ))}
              {assign === "user" &&
                (users.length ? (
                  <select
                    value={rule?.assignOnApply?.userId || ""}
                    onChange={(e) => patchRule({ assignOnApply: { mode: "user", userId: e.target.value } })}
                    style={{ ...ctl, minWidth: 200 }}
                  >
                    <option value="">Select a user…</option>
                    {users.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={hint}>User list unavailable — you need permission to view users.</span>
                ))}
            </div>
            {assign === "role" && (
              <span style={{ ...hint, marginLeft: 198, marginTop: 4 }}>
                The first active user with that role on this project receives the ticket.
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StatusRulesEditor;
