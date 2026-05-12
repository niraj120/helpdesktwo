import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { API_CONFIG } from "../config/constants";
import DashboardLayout from "./DashboardLayout";
import { StarIcon } from "@heroicons/react/24/solid";
import {
  ChartBarIcon,
  FunnelIcon,
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  UserIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ArrowDownTrayIcon,
  QuestionMarkCircleIcon,
  ListBulletIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

const FONT = '"Noto Sans", system-ui, -apple-system, sans-serif';

interface FeedbackAnswer {
  questionId: string;
  questionLabel: string;
  questionType: string;
  answer: any;
}

interface FeedbackResponse {
  _id: string;
  ticketId: {
    _id: string;
    ticketNumber: string;
    subject: string;
  };
  formId: {
    _id: string;
    name: string;
  };
  studentId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  answers: FeedbackAnswer[];
  overallRating?: number;
  submittedAt: string;
}

interface FeedbackQuestion {
  id: string;
  type: "rating" | "text" | "textarea" | "radio" | "checkbox" | "select";
  label: string;
  required: boolean;
  options?: string[];
  maxRating?: number;
  order: number;
}

interface Project {
  _id: string;
  name: string;
  code: string;
}

// ─── Per-question computed stat ──────────────────────────────────────────────
interface QuestionStat {
  question: FeedbackQuestion;
  answeredCount: number;
  // For rating
  avg?: number;
  ratingDist?: Record<number, number>;
  // For choice (radio/checkbox/select)
  optionCounts?: Record<string, number>;
  // For text/textarea
  sampleAnswers?: string[];
}

const StarRating: React.FC<{ value: number; size?: number }> = ({
  value,
  size = 16,
}) => (
  <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <StarIcon
        key={i}
        style={{
          width: size,
          height: size,
          color: i <= value ? "#f59e0b" : "#d1d5db",
          flexShrink: 0,
        }}
      />
    ))}
  </span>
);

const FeedbackResponses: React.FC = () => {
  const projectContext = JSON.parse(
    localStorage.getItem("projectContext") || "{}",
  );

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projectContext?.projectId || "",
  );
  const [responses, setResponses] = useState<FeedbackResponse[]>([]);
  const [formQuestions, setFormQuestions] = useState<FeedbackQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedResponse, setSelectedResponse] =
    useState<FeedbackResponse | null>(null);
  const [filters, setFilters] = useState({
    minRating: "",
    maxRating: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchResponses();
      fetchFormQuestions();
    } else {
      setResponses([]);
      setFormQuestions([]);
    }
  }, [selectedProjectId, filters]);

  const fetchProjects = async () => {
    try {
      setProjectsLoading(true);
      const token = localStorage.getItem("authToken");
      const res = await axios.get(`${API_CONFIG.API_URL}/projects?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        const arr = Array.isArray(res.data.data?.projects)
          ? res.data.data.projects
          : Array.isArray(res.data.data)
            ? res.data.data
            : [];
        setProjects(arr);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    } finally {
      setProjectsLoading(false);
    }
  };

  const fetchResponses = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const queryParams = new URLSearchParams();
      if (filters.minRating) queryParams.append("minRating", filters.minRating);
      if (filters.maxRating) queryParams.append("maxRating", filters.maxRating);
      if (filters.startDate) queryParams.append("startDate", filters.startDate);
      if (filters.endDate) queryParams.append("endDate", filters.endDate);

      const res = await axios.get(
        `${API_CONFIG.API_URL}/feedback-responses/project/${selectedProjectId}?${queryParams}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data.success) setResponses(res.data.data);
    } catch (err) {
      console.error("Error fetching feedback responses:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, filters]);

  // Fetch the form's questions to drive the stats section
  const fetchFormQuestions = useCallback(async () => {
    try {
      const token = localStorage.getItem("authToken");
      // Try active form first; fall back to listing all forms and taking the first
      const res = await axios
        .get(
          `${API_CONFIG.API_URL}/feedback-forms/project/${selectedProjectId}/active`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        .catch(async () => {
          const listRes = await axios.get(
            `${API_CONFIG.API_URL}/feedback-forms/project/${selectedProjectId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          // Return a fake response shaped like a single-form response
          const forms = listRes.data?.data ?? [];
          return { data: { success: !!forms.length, data: forms[0] ?? null } };
        });
      const form = res.data?.data;
      if (form?.questions) {
        const sorted = [...form.questions].sort(
          (a: FeedbackQuestion, b: FeedbackQuestion) => a.order - b.order,
        );
        setFormQuestions(sorted);
      } else {
        setFormQuestions([]);
      }
    } catch (err) {
      console.error("Error fetching form questions:", err);
      setFormQuestions([]);
    }
  }, [selectedProjectId]);

  // ─── Compute per-question stats from the responses already in state ───────
  const questionStats = useMemo((): QuestionStat[] => {
    if (responses.length === 0) return [];

    // If we have the form's questions, use that as the ordered structure.
    // Otherwise derive questions from the response data itself.
    const questions: FeedbackQuestion[] =
      formQuestions.length > 0
        ? formQuestions
        : (() => {
            const seen = new Map<string, FeedbackQuestion>();
            responses.forEach((r) => {
              r.answers.forEach((a, idx) => {
                if (!seen.has(a.questionLabel)) {
                  seen.set(a.questionLabel, {
                    id: a.questionId || a.questionLabel,
                    type: a.questionType as any,
                    label: a.questionLabel,
                    required: false,
                    order: idx,
                  });
                }
              });
            });
            return Array.from(seen.values()).sort((a, b) => a.order - b.order);
          })();

    return questions.map((q) => {
      // Collect all answers for this question across all responses
      const rawAnswers = responses.flatMap((r) => {
        const match = r.answers.find(
          (a) => a.questionLabel === q.label || a.questionId === q.id,
        );
        return match ? [match.answer] : [];
      });

      const answeredCount = rawAnswers.length;

      if (q.type === "rating") {
        const nums = rawAnswers.map(Number).filter((n) => !isNaN(n) && n > 0);
        const avg = nums.length
          ? nums.reduce((s, n) => s + n, 0) / nums.length
          : 0;
        const ratingDist: Record<number, number> = {};
        nums.forEach((n) => {
          ratingDist[n] = (ratingDist[n] ?? 0) + 1;
        });
        return { question: q, answeredCount, avg, ratingDist };
      }

      if (q.type === "radio" || q.type === "select") {
        const optionCounts: Record<string, number> = {};
        rawAnswers.forEach((a) => {
          const key = String(a ?? "").trim();
          if (key) optionCounts[key] = (optionCounts[key] ?? 0) + 1;
        });
        return { question: q, answeredCount, optionCounts };
      }

      if (q.type === "checkbox") {
        const optionCounts: Record<string, number> = {};
        rawAnswers.forEach((a) => {
          const items: string[] = Array.isArray(a) ? a : [String(a ?? "")];
          items.forEach((item) => {
            const key = item.trim();
            if (key) optionCounts[key] = (optionCounts[key] ?? 0) + 1;
          });
        });
        return { question: q, answeredCount, optionCounts };
      }

      // text / textarea
      const sampleAnswers = rawAnswers
        .map((a) => String(a ?? "").trim())
        .filter(Boolean)
        .slice(0, 5);
      return { question: q, answeredCount, sampleAnswers };
    });
  }, [responses, formQuestions]);

  const renderAnswerValue = (answer: FeedbackAnswer) => {
    if (answer.questionType === "rating") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StarRating value={Number(answer.answer)} size={18} />
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            ({answer.answer}/5)
          </span>
        </div>
      );
    }
    if (answer.questionType === "checkbox" && Array.isArray(answer.answer)) {
      return (
        <ul
          style={{
            margin: "4px 0 0 16px",
            padding: 0,
            fontSize: 13,
            color: "#374151",
          }}
        >
          {answer.answer.map((item: string, i: number) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    }
    return (
      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151" }}>
        {answer.answer}
      </p>
    );
  };

  const selectedProject = projects.find((p) => p._id === selectedProjectId);

  // ─── CSV Export ──────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (responses.length === 0) return;

    // Collect all unique question labels across all responses
    const allLabels: string[] = [];
    responses.forEach((r) => {
      r.answers.forEach((a) => {
        if (!allLabels.includes(a.questionLabel))
          allLabels.push(a.questionLabel);
      });
    });

    // Build header row
    const headers = [
      "Ticket #",
      "Subject",
      "Student Name",
      "Student Email",
      "Overall Rating",
      "Form Name",
      "Submitted At",
      ...allLabels,
    ];

    // Build data rows
    const rows = responses.map((r) => {
      const answerMap: Record<string, string> = {};
      r.answers.forEach((a) => {
        const val = Array.isArray(a.answer)
          ? a.answer.join("; ")
          : String(a.answer ?? "");
        answerMap[a.questionLabel] = val;
      });

      return [
        r.ticketId.ticketNumber,
        r.ticketId.subject,
        `${r.studentId.firstName} ${r.studentId.lastName}`,
        r.studentId.email,
        r.overallRating ?? "",
        r.formId?.name ?? "",
        new Date(r.submittedAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        ...allLabels.map((label) => answerMap[label] ?? ""),
      ].map((cell) => {
        const str = String(cell).replace(/"/g, '""');
        return `"${str}"`;
      });
    });

    const csvContent = [
      headers.map((h) => `"${h}"`).join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const projectName = selectedProject?.code ?? "export";
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `feedback-responses-${projectName}-${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ─── Shared input / select style ─────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 13,
    color: "#111827",
    background: "#fff",
    outline: "none",
    fontFamily: FONT,
    boxSizing: "border-box",
  };

  return (
    <DashboardLayout>
      <div
        style={{
          padding: "24px 20px 32px",
          maxWidth: 1380,
          margin: "0 auto",
          background: "#f6f8fc",
          minHeight: "100vh",
          fontFamily: FONT,
        }}
      >
        {/* ── Page Header ──────────────────────────────────────────────── */}
        <div
          style={{
            background: "#ffffff",
            padding: "22px 24px",
            borderRadius: 14,
            marginBottom: 16,
            border: "1px solid #e7ebf3",
            boxShadow: "0 4px 18px rgba(15,23,42,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                margin: "0 0 4px",
                fontSize: 24,
                fontWeight: 700,
                color: "#111827",
                letterSpacing: "-0.01em",
                fontFamily: FONT,
              }}
            >
              Feedback Responses
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#6b7280",
                fontWeight: 400,
                fontFamily: FONT,
              }}
            >
              View and analyse student feedback submissions
            </p>
          </div>

          {/* Project selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#374151",
                fontFamily: FONT,
                whiteSpace: "nowrap",
              }}
            >
              Project:
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={projectsLoading}
                style={{
                  appearance: "none",
                  padding: "8px 36px 8px 12px",
                  border: "1.5px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: selectedProjectId ? "#111827" : "#9ca3af",
                  background: "#fff",
                  cursor: projectsLoading ? "wait" : "pointer",
                  outline: "none",
                  fontFamily: FONT,
                  minWidth: 200,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <option value="">
                  {projectsLoading
                    ? "Loading projects…"
                    : "— Select a project —"}
                </option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  color: "#6b7280",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        </div>

        {/* ── No project selected placeholder ─────────────────────────── */}
        {!selectedProjectId && (
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e7ebf3",
              boxShadow: "0 4px 18px rgba(15,23,42,0.05)",
              padding: "64px 24px",
              textAlign: "center",
            }}
          >
            <ChatBubbleLeftRightIcon
              style={{
                width: 48,
                height: 48,
                color: "#d1d5db",
                margin: "0 auto 16px",
              }}
            />
            <p
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#374151",
                margin: "0 0 6px",
                fontFamily: FONT,
              }}
            >
              Select a project to get started
            </p>
            <p
              style={{
                fontSize: 13,
                color: "#9ca3af",
                margin: 0,
                fontFamily: FONT,
              }}
            >
              Choose a project from the dropdown above to view its feedback
              responses.
            </p>
          </div>
        )}

        {/* ── Loading spinner ──────────────────────────────────────────── */}
        {selectedProjectId && loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 200,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                border: "3px solid #e5e7eb",
                borderTopColor: "#6366f1",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {selectedProjectId && !loading && (
          <>
            {/* ── Summary + Dynamic Question Stats ────────────────────── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 14,
                marginBottom: 16,
              }}
            >
              {/* Always-present: Total Responses */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid #e7ebf3",
                  boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
                  padding: "18px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "#eff6ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ChartBarIcon
                    style={{ width: 22, height: 22, color: "#3b82f6" }}
                  />
                </div>
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#6b7280",
                      fontWeight: 500,
                      fontFamily: FONT,
                    }}
                  >
                    Total Responses
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 26,
                      fontWeight: 700,
                      color: "#111827",
                      fontFamily: FONT,
                    }}
                  >
                    {responses.length}
                  </p>
                </div>
              </div>

              {/* Dynamic per-question stat cards */}
              {questionStats.map((qs) => {
                const {
                  question: q,
                  answeredCount,
                  avg,
                  ratingDist,
                  optionCounts,
                  sampleAnswers,
                } = qs;
                const maxRating = q.maxRating ?? 5;
                const totalForPct = responses.length;

                // ── Rating question card ──────────────────────────────
                if (q.type === "rating") {
                  return (
                    <div
                      key={q.id}
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        border: "1px solid #e7ebf3",
                        boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
                        padding: "18px 20px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: "#fffbeb",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <StarIcon
                            style={{ width: 16, height: 16, color: "#f59e0b" }}
                          />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#374151",
                              fontFamily: FONT,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={q.label}
                          >
                            {q.label}
                          </p>
                          <p
                            style={{
                              margin: "2px 0 0",
                              fontSize: 11,
                              color: "#9ca3af",
                              fontFamily: FONT,
                            }}
                          >
                            {answeredCount} of {totalForPct} answered
                          </p>
                        </div>
                      </div>
                      {/* Avg row */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 6,
                          marginBottom: 10,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 28,
                            fontWeight: 700,
                            color: "#111827",
                            fontFamily: FONT,
                          }}
                        >
                          {avg ? avg.toFixed(1) : "—"}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#9ca3af",
                            fontFamily: FONT,
                          }}
                        >
                          / {maxRating}
                        </span>
                        {avg ? (
                          <StarRating value={Math.round(avg)} size={14} />
                        ) : null}
                      </div>
                      {/* Distribution bars */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        {Array.from(
                          { length: maxRating },
                          (_, i) => maxRating - i,
                        ).map((star) => {
                          const count = ratingDist?.[star] ?? 0;
                          const pct = answeredCount
                            ? Math.round((count / answeredCount) * 100)
                            : 0;
                          return (
                            <div
                              key={star}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: "#374151",
                                  width: 8,
                                  fontFamily: FONT,
                                }}
                              >
                                {star}
                              </span>
                              <StarIcon
                                style={{
                                  width: 10,
                                  height: 10,
                                  color: "#f59e0b",
                                  flexShrink: 0,
                                }}
                              />
                              <div
                                style={{
                                  flex: 1,
                                  background: "#f3f4f6",
                                  borderRadius: 99,
                                  height: 5,
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: "100%",
                                    background: "#f59e0b",
                                    borderRadius: 99,
                                    transition: "width 0.4s ease",
                                  }}
                                />
                              </div>
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "#9ca3af",
                                  width: 18,
                                  textAlign: "right",
                                  fontFamily: FONT,
                                }}
                              >
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // ── Choice question card (radio / checkbox / select) ───
                if (
                  q.type === "radio" ||
                  q.type === "checkbox" ||
                  q.type === "select"
                ) {
                  const entries = Object.entries(optionCounts ?? {}).sort(
                    (a, b) => b[1] - a[1],
                  );
                  const maxCount = entries[0]?.[1] ?? 1;
                  const CHOICE_COLORS = [
                    "#6366f1",
                    "#10b981",
                    "#f59e0b",
                    "#ef4444",
                    "#06b6d4",
                    "#8b5cf6",
                    "#f97316",
                  ];
                  return (
                    <div
                      key={q.id}
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        border: "1px solid #e7ebf3",
                        boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
                        padding: "18px 20px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: "#eef2ff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <ListBulletIcon
                            style={{ width: 16, height: 16, color: "#6366f1" }}
                          />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#374151",
                              fontFamily: FONT,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={q.label}
                          >
                            {q.label}
                          </p>
                          <p
                            style={{
                              margin: "2px 0 0",
                              fontSize: 11,
                              color: "#9ca3af",
                              fontFamily: FONT,
                            }}
                          >
                            {answeredCount} of {totalForPct} answered
                          </p>
                        </div>
                      </div>
                      {entries.length === 0 ? (
                        <p
                          style={{
                            fontSize: 12,
                            color: "#9ca3af",
                            margin: 0,
                            fontFamily: FONT,
                          }}
                        >
                          No responses yet
                        </p>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          {entries.map(([option, count], idx) => {
                            const pct = maxCount
                              ? Math.round((count / maxCount) * 100)
                              : 0;
                            const color =
                              CHOICE_COLORS[idx % CHOICE_COLORS.length];
                            return (
                              <div key={option}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginBottom: 3,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 500,
                                      color: "#374151",
                                      fontFamily: FONT,
                                      maxWidth: "75%",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                    title={option}
                                  >
                                    {option}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "#6b7280",
                                      fontFamily: FONT,
                                    }}
                                  >
                                    {count}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    background: "#f3f4f6",
                                    borderRadius: 99,
                                    height: 5,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${pct}%`,
                                      height: "100%",
                                      background: color,
                                      borderRadius: 99,
                                      transition: "width 0.4s ease",
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // ── Text / Textarea card ──────────────────────────────
                return (
                  <div
                    key={q.id}
                    style={{
                      background: "#fff",
                      borderRadius: 12,
                      border: "1px solid #e7ebf3",
                      boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
                      padding: "18px 20px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "#f0fdf4",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <DocumentTextIcon
                          style={{ width: 16, height: 16, color: "#10b981" }}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#374151",
                            fontFamily: FONT,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={q.label}
                        >
                          {q.label}
                        </p>
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 11,
                            color: "#9ca3af",
                            fontFamily: FONT,
                          }}
                        >
                          {answeredCount} text response
                          {answeredCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    {(sampleAnswers ?? []).length === 0 ? (
                      <p
                        style={{
                          fontSize: 12,
                          color: "#9ca3af",
                          margin: 0,
                          fontFamily: FONT,
                        }}
                      >
                        No responses yet
                      </p>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {(sampleAnswers ?? []).map((text, i) => (
                          <p
                            key={i}
                            style={{
                              margin: 0,
                              fontSize: 11,
                              color: "#374151",
                              background: "#f9fafb",
                              borderRadius: 6,
                              padding: "5px 9px",
                              fontFamily: FONT,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={text}
                          >
                            "{text}"
                          </p>
                        ))}
                        {answeredCount > 5 && (
                          <p
                            style={{
                              margin: 0,
                              fontSize: 11,
                              color: "#9ca3af",
                              fontFamily: FONT,
                            }}
                          >
                            + {answeredCount - 5} more — click any row below to
                            read
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Filters ─────────────────────────────────────────────── */}
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e7ebf3",
                boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
                padding: "16px 20px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <FunnelIcon
                  style={{ width: 16, height: 16, color: "#6b7280" }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                    fontFamily: FONT,
                  }}
                >
                  Filters
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 4,
                      fontFamily: FONT,
                    }}
                  >
                    Min Rating
                  </label>
                  <select
                    value={filters.minRating}
                    onChange={(e) =>
                      setFilters({ ...filters, minRating: e.target.value })
                    }
                    style={inputStyle}
                  >
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <option key={r} value={r}>
                        {r} Stars
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 4,
                      fontFamily: FONT,
                    }}
                  >
                    Max Rating
                  </label>
                  <select
                    value={filters.maxRating}
                    onChange={(e) =>
                      setFilters({ ...filters, maxRating: e.target.value })
                    }
                    style={inputStyle}
                  >
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <option key={r} value={r}>
                        {r} Stars
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 4,
                      fontFamily: FONT,
                    }}
                  >
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) =>
                      setFilters({ ...filters, startDate: e.target.value })
                    }
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 4,
                      fontFamily: FONT,
                    }}
                  >
                    End Date
                  </label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) =>
                      setFilters({ ...filters, endDate: e.target.value })
                    }
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* ── Responses Table / List ───────────────────────────────── */}
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                border: "1px solid #e7ebf3",
                boxShadow: "0 4px 18px rgba(15,23,42,0.05)",
                overflow: "hidden",
              }}
            >
              {/* Table header */}
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid #f1f3f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#111827",
                    fontFamily: FONT,
                  }}
                >
                  {responses.length} response{responses.length !== 1 ? "s" : ""}
                  {selectedProject ? (
                    <span style={{ fontWeight: 400, color: "#6b7280" }}>
                      {" "}
                      for <strong>{selectedProject.name}</strong>
                    </span>
                  ) : null}
                </span>

                {/* Export button */}
                {responses.length > 0 && (
                  <button
                    onClick={handleExportCSV}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      background: "#f0fdf4",
                      border: "1.5px solid #86efac",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#15803d",
                      cursor: "pointer",
                      fontFamily: FONT,
                    }}
                    title="Export current filtered results as CSV"
                  >
                    <ArrowDownTrayIcon style={{ width: 14, height: 14 }} />
                    Export CSV
                  </button>
                )}
              </div>

              {responses.length === 0 ? (
                <div style={{ padding: "64px 24px", textAlign: "center" }}>
                  <ChatBubbleLeftRightIcon
                    style={{
                      width: 40,
                      height: 40,
                      color: "#d1d5db",
                      margin: "0 auto 12px",
                    }}
                  />
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#374151",
                      margin: "0 0 4px",
                      fontFamily: FONT,
                    }}
                  >
                    No feedback responses found
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#9ca3af",
                      margin: 0,
                      fontFamily: FONT,
                    }}
                  >
                    Try adjusting your filters or check back once students
                    submit feedback.
                  </p>
                </div>
              ) : (
                <div>
                  {responses.map((response, idx) => (
                    <div
                      key={response._id}
                      onClick={() => setSelectedResponse(response)}
                      style={{
                        padding: "16px 20px",
                        borderBottom:
                          idx < responses.length - 1
                            ? "1px solid #f1f3f9"
                            : "none",
                        cursor: "pointer",
                        transition: "background 0.15s",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 16,
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#f9fafb")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {/* Rating badge */}
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 10,
                          background: response.overallRating
                            ? response.overallRating >= 4
                              ? "#f0fdf4"
                              : response.overallRating >= 3
                                ? "#fffbeb"
                                : "#fef2f2"
                            : "#f3f4f6",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {response.overallRating ? (
                          <>
                            <StarIcon
                              style={{
                                width: 16,
                                height: 16,
                                color:
                                  response.overallRating >= 4
                                    ? "#16a34a"
                                    : response.overallRating >= 3
                                      ? "#f59e0b"
                                      : "#dc2626",
                              }}
                            />
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color:
                                  response.overallRating >= 4
                                    ? "#15803d"
                                    : response.overallRating >= 3
                                      ? "#d97706"
                                      : "#dc2626",
                                fontFamily: FONT,
                              }}
                            >
                              {response.overallRating}
                            </span>
                          </>
                        ) : (
                          <ChatBubbleLeftRightIcon
                            style={{ width: 20, height: 20, color: "#9ca3af" }}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#111827",
                              fontFamily: FONT,
                              background: "#f3f4f6",
                              padding: "2px 8px",
                              borderRadius: 6,
                            }}
                          >
                            #{response.ticketId.ticketNumber}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#374151",
                              fontFamily: FONT,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 320,
                            }}
                          >
                            {response.ticketId.subject}
                          </span>
                          {response.formId?.name && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#6366f1",
                                background: "#eef2ff",
                                padding: "2px 7px",
                                borderRadius: 20,
                                fontWeight: 500,
                                fontFamily: FONT,
                              }}
                            >
                              {response.formId.name}
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 12,
                              color: "#6b7280",
                              fontFamily: FONT,
                            }}
                          >
                            <UserIcon style={{ width: 13, height: 13 }} />
                            {response.studentId.firstName}{" "}
                            {response.studentId.lastName}
                          </span>
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 12,
                              color: "#6b7280",
                              fontFamily: FONT,
                            }}
                          >
                            <CalendarDaysIcon
                              style={{ width: 13, height: 13 }}
                            />
                            {new Date(response.submittedAt).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </span>
                          {response.overallRating && (
                            <StarRating
                              value={response.overallRating}
                              size={13}
                            />
                          )}
                        </div>

                        {/* Preview of first answer */}
                        {response.answers.length > 0 && (
                          <p
                            style={{
                              margin: "6px 0 0",
                              fontSize: 12,
                              color: "#9ca3af",
                              fontStyle: "italic",
                              fontFamily: FONT,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {response.answers[0].questionLabel}:{" "}
                            {Array.isArray(response.answers[0].answer)
                              ? response.answers[0].answer.join(", ")
                              : String(response.answers[0].answer)}
                          </p>
                        )}
                      </div>

                      {/* Arrow hint */}
                      <span
                        style={{
                          fontSize: 18,
                          color: "#d1d5db",
                          flexShrink: 0,
                          alignSelf: "center",
                        }}
                      >
                        ›
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Detail Modal ─────────────────────────────────────────────── */}
        {selectedResponse && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 16,
            }}
            onClick={() => setSelectedResponse(null)}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                width: "100%",
                maxWidth: 620,
                maxHeight: "90vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: "20px 24px 18px",
                  borderBottom: "1px solid #f1f3f9",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: "0 0 4px",
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#111827",
                      fontFamily: FONT,
                    }}
                  >
                    Feedback Details
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "#6b7280",
                      fontFamily: FONT,
                    }}
                  >
                    Ticket #{selectedResponse.ticketId.ticketNumber} ·{" "}
                    {selectedResponse.ticketId.subject}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginTop: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        color: "#6b7280",
                        fontFamily: FONT,
                      }}
                    >
                      <UserIcon style={{ width: 13, height: 13 }} />
                      {selectedResponse.studentId.firstName}{" "}
                      {selectedResponse.studentId.lastName}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        color: "#6b7280",
                        fontFamily: FONT,
                      }}
                    >
                      <CalendarDaysIcon style={{ width: 13, height: 13 }} />
                      {new Date(selectedResponse.submittedAt).toLocaleString(
                        "en-IN",
                        {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                    {selectedResponse.overallRating && (
                      <StarRating
                        value={selectedResponse.overallRating}
                        size={14}
                      />
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedResponse(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    color: "#6b7280",
                    flexShrink: 0,
                  }}
                >
                  <XMarkIcon style={{ width: 20, height: 20 }} />
                </button>
              </div>

              {/* Modal Body */}
              <div
                style={{
                  overflowY: "auto",
                  flex: 1,
                  padding: "16px 24px 24px",
                }}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 0 }}
                >
                  {selectedResponse.answers.map((answer, index) => (
                    <div
                      key={index}
                      style={{
                        padding: "14px 0",
                        borderBottom:
                          index < selectedResponse.answers.length - 1
                            ? "1px solid #f1f3f9"
                            : "none",
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 6px",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#374151",
                          fontFamily: FONT,
                        }}
                      >
                        {index + 1}. {answer.questionLabel}
                      </p>
                      {renderAnswerValue(answer)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  padding: "14px 24px",
                  borderTop: "1px solid #f1f3f9",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setSelectedResponse(null)}
                  style={{
                    padding: "8px 20px",
                    background: "#f3f4f6",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                    cursor: "pointer",
                    fontFamily: FONT,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default FeedbackResponses;
