/**
 * Parent self-service webview (/portal/service-requests).
 *
 * A mobile-first, no-login page the app loads inside a modal WebView. For
 * TESTING without the app, open it directly in a browser:
 *   /portal/service-requests?parent_mobile=99900011&key=pub_xxx
 * or leave them blank and fill the test bar shown on the page.
 *
 * It calls the public /api/v1/service-requests endpoints with X-API-Key.
 * (Production hardening: swap the pub_ key for a short-lived parent session
 * token minted by the app backend — same endpoints.)
 */
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

const API = "/api/v1";

async function call(
  path: string,
  opts: {
    key?: string;
    token?: string;
    method?: string;
    body?: any;
    params?: Record<string, any>;
  },
): Promise<any> {
  const url = new URL(API + path, window.location.origin);
  if (opts.params)
    Object.entries(opts.params).forEach(
      ([k, v]) => v != null && v !== "" && url.searchParams.set(k, String(v)),
    );
  // Prefer the parent session token (browser-safe); fall back to the pub_ key
  // only in test mode. The pub_ key is NEVER needed when a token is present.
  const headers: Record<string, string> = {
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
  };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  else if (opts.key) headers["X-API-Key"] = opts.key;
  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || "Request failed");
  return data;
}

const ParentServiceRequestPortal: React.FC = () => {
  const [sp] = useSearchParams();
  // Production: the app/web backend passes a short-lived session token (browser-
  // safe). Test: a pub_ key + mobile can be entered directly.
  const token = sp.get("token") || "";
  const [key, setKey] = useState(sp.get("key") || "");
  const [mobile, setMobile] = useState(sp.get("parent_mobile") || "");
  const configured = !!token || (!!key && !!mobile);
  // Auth passed to every call: token wins; else the test key.
  const auth = token ? { token } : { key };
  // In token mode the server derives the mobile from the token — don't send it.
  const mob = token ? undefined : mobile;

  const [view, setView] = useState<"raise" | "mine" | "detail">("raise");
  const [schema, setSchema] = useState<any>(null);
  const [parent, setParent] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [studentsMsg, setStudentsMsg] = useState<string>("");
  const [studentId, setStudentId] = useState("");
  const [subCat, setSubCat] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [mine, setMine] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const appFields = useMemo(
    () => (schema?.form_fields || []).filter((f: any) => !f.auto),
    [schema],
  );

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3500);
  };

  // Load form schema + student list once identity is present.
  useEffect(() => {
    if (!configured) return;
    (async () => {
      try {
        const s = await call("/service-requests/form-schema", { ...auth });
        setSchema(s);
      } catch (e: any) {
        flash(false, e.message);
      }
      try {
        const st = await call("/service-requests/students", {
          ...auth,
          params: { parent_mobile: mob },
        });
        setParent(st.parent || null);
        setStudents(st.students || []);
        setStudentsMsg(
          (st.students || []).length === 0
            ? st.message ||
                "No students found for this parent in the master data (check the MDM lookup config / parent mobile)."
            : "",
        );
      } catch (e: any) {
        setStudentsMsg(e.message || "Could not load students.");
      }
    })();
  }, [configured, key, mobile]);

  // Auto-select a single option (student / category / single-option fields);
  // leave multi-option dropdowns for the user to pick.
  useEffect(() => {
    if (students.length === 1 && !studentId) setStudentId(students[0].id);
  }, [students, studentId]);

  useEffect(() => {
    const opts = schema?.category_field?.options || [];
    if (opts.length === 1 && !subCat) setSubCat(opts[0].id);
    setFormData((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const f of appFields) {
        if (
          Array.isArray(f.options) &&
          f.options.length === 1 &&
          next[f.key] === undefined
        ) {
          next[f.key] = String(f.options[0]);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [schema, appFields, subCat]);

  const loadMine = async () => {
    try {
      const r = await call("/service-requests/mine", {
        ...auth,
        params: { parent_mobile: mob, limit: 50 },
      });
      setMine(r.requests || []);
    } catch (e: any) {
      flash(false, e.message);
    }
  };

  const openDetail = async (ticketNumber: string) => {
    try {
      const r = await call(`/service-requests/${ticketNumber}`, {
        ...auth,
        params: { parent_mobile: mob },
      });
      setDetail(r.request);
      setView("detail");
    } catch (e: any) {
      flash(false, e.message);
    }
  };

  const submit = async () => {
    if (!subject.trim()) return flash(false, "Subject is required.");
    if (schema?.category_field?.required && !subCat)
      return flash(false, "Please select a category.");
    setBusy(true);
    try {
      const r = await call("/service-requests", {
        ...auth,
        method: "POST",
        body: {
          parent_mobile: mob,
          student_id: studentId || undefined,
          sub_category_id: subCat || undefined,
          subject,
          description,
          form_data: formData,
        },
      });
      flash(true, `Raised ${r.ticket_number}`);
      setSubject("");
      setDescription("");
      setFormData({});
    } catch (e: any) {
      flash(false, e.message);
    } finally {
      setBusy(false);
    }
  };

  const postReply = async () => {
    if (!reply.trim() || !detail) return;
    setBusy(true);
    try {
      await call(`/service-requests/${detail.ticket_number}/reply`, {
        ...auth,
        method: "POST",
        body: { parent_mobile: mob, message: reply },
      });
      setReply("");
      await openDetail(detail.ticket_number);
    } catch (e: any) {
      flash(false, e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── styles (mobile-first) ──
  const wrap: React.CSSProperties = { maxWidth: 480, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "#111827" };
  const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginBottom: 12 };
  const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginTop: 4 };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginTop: 12 };
  const btn = (primary = true): React.CSSProperties => ({ padding: "10px 16px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", background: primary ? "#4f46e5" : "#eef2ff", color: primary ? "#fff" : "#4338ca" });
  const tab = (active: boolean): React.CSSProperties => ({ flex: 1, padding: "10px 0", textAlign: "center", fontWeight: 700, fontSize: 14, cursor: "pointer", borderBottom: `2px solid ${active ? "#4f46e5" : "transparent"}`, color: active ? "#4f46e5" : "#6b7280" });

  if (!configured) {
    return (
      <div style={wrap}>
        <h2 style={{ fontSize: 18 }}>Self-service — test access</h2>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          In the app this opens with the parent already identified. To test in a
          browser, enter a public API key and a parent mobile that exists in your
          MDM.
        </p>
        <div style={card}>
          <label style={label}>Public API key (pub_…)</label>
          <input style={input} value={key} onChange={(e) => setKey(e.target.value)} placeholder="pub_xxxxxxxx" />
          <label style={label}>Parent mobile</label>
          <input style={input} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="9990001111" />
          <button style={{ ...btn(), marginTop: 14 }} onClick={() => setView("raise")}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 12 }}>
        <div style={tab(view === "raise")} onClick={() => setView("raise")}>Raise a request</div>
        <div style={tab(view === "mine" || view === "detail")} onClick={() => { setView("mine"); loadMine(); }}>My requests</div>
      </div>

      {msg && (
        <div style={{ ...card, background: msg.ok ? "#ecfdf5" : "#fef2f2", color: msg.ok ? "#065f46" : "#991b1b", borderColor: msg.ok ? "#a7f3d0" : "#fecaca" }}>
          {msg.text}
        </div>
      )}

      {view === "raise" && (
        <div style={card}>
          {/* Auto-identified parent (from login / mobile) */}
          <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
            <span style={{ color: "#6b7280" }}>Raising as </span>
            <strong style={{ color: "#3730a3" }}>{parent?.name || "this parent"}</strong>
            <span style={{ color: "#6b7280" }}> · {mobile}</span>
            {!parent && (
              <div style={{ color: "#b45309", fontSize: 12, marginTop: 4 }}>
                Parent not matched in master data — student auto-fill may be unavailable.
              </div>
            )}
          </div>

          <label style={label}>Select student</label>
          <select style={input} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">{students.length ? "Select…" : "No students available"}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.grade ? ` · ${s.grade}` : ""}{s.school ? ` · ${s.school}` : ""}
              </option>
            ))}
          </select>
          {studentsMsg && (
            <div style={{ fontSize: 12, color: "#b45309", marginTop: 4 }}>{studentsMsg}</div>
          )}

          <label style={label}>Category</label>
          <select style={input} value={subCat} onChange={(e) => setSubCat(e.target.value)}>
            <option value="">Select…</option>
            {(schema?.category_field?.options || []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.path || c.name}</option>
            ))}
          </select>

          <label style={label}>Subject *</label>
          <input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} />

          <label style={label}>Description</label>
          <textarea style={{ ...input, minHeight: 90 }} value={description} onChange={(e) => setDescription(e.target.value)} />

          {appFields.map((f: any) => (
            <div key={f.key}>
              <label style={label}>{f.label}{f.required ? " *" : ""}</label>
              {f.type === "textarea" ? (
                <textarea style={{ ...input, minHeight: 70 }} value={formData[f.key] || ""} onChange={(e) => setFormData((p) => ({ ...p, [f.key]: e.target.value }))} />
              ) : f.options?.length ? (
                <select style={input} value={formData[f.key] || ""} onChange={(e) => setFormData((p) => ({ ...p, [f.key]: e.target.value }))}>
                  <option value="">Select…</option>
                  {f.options.map((o: any) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
                </select>
              ) : (
                <input style={input} value={formData[f.key] || ""} onChange={(e) => setFormData((p) => ({ ...p, [f.key]: e.target.value }))} />
              )}
            </div>
          ))}

          <button style={{ ...btn(), marginTop: 16, width: "100%" }} disabled={busy} onClick={submit}>
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </div>
      )}

      {view === "mine" && (
        <div>
          {mine.length === 0 ? (
            <div style={{ ...card, color: "#9ca3af" }}>No requests yet.</div>
          ) : (
            mine.map((r) => (
              <div key={r.ticket_number} style={{ ...card, cursor: "pointer" }} onClick={() => openDetail(r.ticket_number)}>
                <div style={{ fontWeight: 700 }}>{r.ticket_number}</div>
                <div style={{ fontSize: 13, color: "#374151" }}>{r.subject}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  {r.status_label}
                  {r.student_name ? ` · ${r.student_name}` : ""}
                  {/* A request about the same child raised by the other guardian. */}
                  {r.raised_by && r.raised_by_me === false
                    ? ` · Raised by ${r.raised_by}`
                    : ""}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {view === "detail" && detail && (
        <div style={card}>
          <button style={{ ...btn(false), marginBottom: 10 }} onClick={() => { setView("mine"); loadMine(); }}>← Back</button>
          <div style={{ fontWeight: 700 }}>{detail.ticket_number}</div>
          <div style={{ fontSize: 15, marginTop: 2 }}>{detail.subject}</div>
          <div style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 10px" }}>{detail.status_label}</div>
          <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>{detail.description}</div>

          <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>Conversation</div>
            {(detail.thread || []).length === 0 && <div style={{ fontSize: 13, color: "#9ca3af" }}>No replies yet.</div>}
            {(detail.thread || []).map((c: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: c.from === "you" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                <div style={{ maxWidth: "80%", padding: "8px 12px", borderRadius: 12, fontSize: 13, background: c.from === "you" ? "#eef2ff" : "#f3f4f6", color: "#111827" }}>
                  {c.text}
                </div>
              </div>
            ))}
          </div>

          <label style={label}>Reply</label>
          <textarea style={{ ...input, minHeight: 60 }} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a reply…" />
          <button style={{ ...btn(), marginTop: 10, width: "100%" }} disabled={busy || !reply.trim()} onClick={postReply}>
            {busy ? "Sending…" : "Send reply"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ParentServiceRequestPortal;
