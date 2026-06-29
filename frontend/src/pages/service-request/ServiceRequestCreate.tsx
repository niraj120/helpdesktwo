import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SrPage from "../../components/sr/SrPage";
import { srStyles, srButton, SR } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { api } from "../../utils/api";
import { serviceRequestApi } from "../../services/serviceRequests";

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
interface StudentOpt {
  _id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  uniqueId?: string;
  mobile?: string;
}

const MODE_OPTS = [
  { v: "walk_in", l: "Walk-In" },
  { v: "telephone", l: "Telephone" },
  { v: "email", l: "Email" },
  { v: "portal", l: "Portal / App" },
  { v: "digital", l: "Digital" },
];

const studentName = (s: StudentOpt) =>
  s.fullName || `${s.firstName || ""} ${s.lastName || ""}`.trim() || s.email || "—";

const ServiceRequestCreate: React.FC<{ embedded?: boolean }> = ({
  embedded,
}) => {
  const navigate = useNavigate();
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [modeOfContact, setModeOfContact] = useState("walk_in");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<StudentOpt[]>([]);
  const [student, setStudent] = useState<StudentOpt | null>(null);

  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const debounce = useRef<any>(null);

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
    if (!projectId) {
      setCategories([]);
      return;
    }
    (async () => {
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

  // Leaf categories only (those that are not a parent of any other category).
  const leafCategories = useMemo(() => {
    const parentIds = new Set(
      categories.map((c) => (c.parentId ? String(c.parentId) : "")).filter(Boolean),
    );
    return categories
      .filter((c) => !parentIds.has(String(c._id)))
      .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name));
  }, [categories]);

  const selectedCategory = useMemo(
    () => categories.find((c) => String(c._id) === categoryId),
    [categories, categoryId],
  );

  const onStudentQuery = (q: string) => {
    setStudentQuery(q);
    setStudent(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setStudentResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const r = await serviceRequestApi.studentLookup(q.trim(), projectId);
        setStudentResults(r.data || []);
      } catch (e) {
        console.error(e);
      }
    }, 350);
  };

  // Surface possible duplicates once a student + category are chosen.
  useEffect(() => {
    if (!projectId || !categoryId || !student) {
      setDuplicates([]);
      return;
    }
    (async () => {
      try {
        const r = await serviceRequestApi.duplicates({
          projectId,
          subCategoryId: categoryId,
          studentUserId: student._id,
        });
        setDuplicates(r.data || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [projectId, categoryId, student]);

  const canSubmit =
    projectId && categoryId && subject.trim() && student && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const r = await serviceRequestApi.create({
        projectId,
        interactionType: "PSR",
        requestType: "SR",
        channel: "walk_in",
        modeOfContact,
        categoryId,
        subject: subject.trim(),
        description: description.trim(),
        studentUserId: student!._id,
        metadata: { studentName: studentName(student!) },
        skipDuplicateCheck: true,
      });
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

  const card: React.CSSProperties = { ...srStyles.card, maxWidth: 720 };
  const label = srStyles.label;
  const ctrl: React.CSSProperties = { ...srStyles.ctrl, width: "100%" };

  return (
    <SrPage
      title="Generate Service Request"
      subtitle="Raise a PSR on behalf of a parent (walk-in / phone)."
      embedded={embedded}
    >

        <div style={card}>
          <label style={label}>Project</label>
          <select
            style={{ ...ctrl, marginBottom: 14 }}
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

          <label style={label}>Student / Parent</label>
          <input
            style={ctrl}
            placeholder="Search by name, enrolment, email, mobile…"
            value={student ? studentName(student) : studentQuery}
            onChange={(e) => onStudentQuery(e.target.value)}
          />
          {!student && studentResults.length > 0 && (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                marginTop: 4,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {studentResults.map((s) => (
                <div
                  key={s._id}
                  onClick={() => {
                    setStudent(s);
                    setStudentResults([]);
                  }}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f3f4f6",
                    fontSize: 13,
                  }}
                >
                  <strong>{studentName(s)}</strong>{" "}
                  <span style={{ color: "#6b7280" }}>
                    {s.uniqueId || s.email || s.mobile || ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {projectId && (
          <div style={card}>
            <label style={label}>Category / Sub-category</label>
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
                  background: "#ecfdf5",
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

            {duplicates.length > 0 && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                  color: "#92400e",
                  marginTop: 10,
                }}
              >
                ⚠️ {duplicates.length} possible duplicate SR(s) for this student &
                sub-category:{" "}
                {duplicates
                  .slice(0, 5)
                  .map((d: any) => d.ticketNumber)
                  .join(", ")}
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <label style={label}>Mode of contact</label>
              <select
                style={{ ...ctrl, marginBottom: 14 }}
                value={modeOfContact}
                onChange={(e) => setModeOfContact(e.target.value)}
              >
                {MODE_OPTS.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.l}
                  </option>
                ))}
              </select>

              <label style={label}>Subject</label>
              <input
                style={{ ...ctrl, marginBottom: 14 }}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief subject"
              />

              <label style={label}>Description / Comments</label>
              <textarea
                style={{ ...ctrl, minHeight: 100 }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details of the request/complaint"
              />
            </div>
          </div>
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
            {submitting ? "Submitting…" : "Create Service Request"}
          </button>
          {msg && (
            <span
              style={{
                fontSize: 13,
                color: msg.type === "ok" ? "#047857" : "#b91c1c",
              }}
            >
              {msg.text}
            </span>
          )}
        </div>
    </SrPage>
  );
};

export default ServiceRequestCreate;
