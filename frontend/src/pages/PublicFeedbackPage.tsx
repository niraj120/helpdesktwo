import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API_CONFIG } from "../config/constants";
import { StarIcon } from "@heroicons/react/24/solid";
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";

interface FeedbackQuestion {
  id: string;
  type: "rating" | "text" | "textarea" | "radio" | "checkbox" | "select";
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  maxRating?: number;
  order: number;
}

interface FeedbackForm {
  _id: string;
  name: string;
  description?: string;
  questions: FeedbackQuestion[];
}

interface Branding {
  projectId: string;
  projectName?: string;
  primaryColor?: string;
  logo?: string;
  headerText?: string;
}

const PublicFeedbackPage: React.FC = () => {
  const { customUrlPath, ticketId } = useParams<{
    customUrlPath: string;
    ticketId: string;
  }>();

  const searchParams = new URLSearchParams(window.location.search);
  const studentId = searchParams.get("studentId") || undefined;
  const ticketNumber = searchParams.get("ticketNumber") || "Your Ticket";

  const [branding, setBranding] = useState<Branding | null>(null);
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [hoveredRating, setHoveredRating] = useState<Record<string, number>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [customUrlPath, ticketId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // 1. Load branding (public)
      const brandingRes = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`,
      );
      const brandingData = brandingRes.data.success
        ? brandingRes.data.data
        : brandingRes.data;
      setBranding(brandingData);

      // 2. Check if already submitted (public endpoint)
      try {
        const checkRes = await axios.get(
          `${API_CONFIG.API_URL}/feedback-responses/ticket/${ticketId}/check/public`,
        );
        if (checkRes.data.data?.hasSubmitted) {
          setAlreadySubmitted(true);
          setLoading(false);
          return;
        }
      } catch {
        // Ignore check errors - proceed to show form
      }

      // 3. Load feedback form (now public)
      const formRes = await axios.get(
        `${API_CONFIG.API_URL}/feedback-forms/project/${brandingData.projectId}/active`,
      );
      if (formRes.data.success && formRes.data.data) {
        setForm(formRes.data.data);
      } else {
        setError("No feedback form is currently available.");
      }
    } catch (err: any) {
      console.error("Error loading feedback page:", err);
      setError("Failed to load feedback form. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    // Validate required fields
    const missing = form.questions
      .filter((q) => q.required && !answers[q.id])
      .map((q) => q.label);
    if (missing.length > 0) {
      alert(
        `Please answer the following required questions:\n- ${missing.join("\n- ")}`,
      );
      return;
    }

    try {
      setSubmitting(true);
      const formattedAnswers = form.questions.map((q) => ({
        questionId: q.id,
        questionLabel: q.label,
        questionType: q.type,
        answer: answers[q.id],
      }));

      const body: any = {
        ticketId,
        formId: form._id,
        answers: formattedAnswers,
      };
      if (studentId) body.studentId = studentId;

      const res = await axios.post(
        `${API_CONFIG.API_URL}/feedback-responses/public`,
        body,
      );
      if (res.data.success) {
        setSubmitted(true);
      }
    } catch (err: any) {
      alert(
        err.response?.data?.message ||
          "Failed to submit feedback. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const accentColor = branding?.primaryColor || "#7F56D9";

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F8F9FC",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", color: "#667085" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: `3px solid ${accentColor}`,
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 14 }}>Loading feedback form…</p>
        </div>
      </div>
    );
  }

  // ── Already submitted ────────────────────────────────────────────────────
  if (alreadySubmitted || submitted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F8F9FC",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 16,
            padding: "40px 48px",
            textAlign: "center",
            maxWidth: 480,
            boxShadow: "0 4px 16px rgba(0,0,0,.10)",
            border: "1px solid #E4E7EC",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#101828",
              marginBottom: 8,
            }}
          >
            {submitted
              ? "Thank you for your feedback!"
              : "Feedback already submitted"}
          </h2>
          <p style={{ fontSize: 14, color: "#667085" }}>
            {submitted
              ? "Your response has been recorded. We appreciate you taking the time!"
              : "You have already submitted feedback for this ticket."}
          </p>
          {branding?.projectName && (
            <p style={{ fontSize: 13, color: "#667085", marginTop: 16 }}>
              — {branding.projectName} Team
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !form) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F8F9FC",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 16,
            padding: "40px 48px",
            textAlign: "center",
            maxWidth: 480,
            boxShadow: "0 4px 16px rgba(0,0,0,.10)",
            border: "1px solid #E4E7EC",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#101828",
              marginBottom: 8,
            }}
          >
            Form unavailable
          </h2>
          <p style={{ fontSize: 14, color: "#667085" }}>
            {error || "No active feedback form found for this project."}
          </p>
        </div>
      </div>
    );
  }

  // ── Feedback Form ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FC" }}>
      {/* Header */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #E4E7EC",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,.06)",
        }}
      >
        {branding?.logo && (
          <img
            src={branding.logo}
            alt="Logo"
            style={{ height: 36, objectFit: "contain" }}
          />
        )}
        <span style={{ fontSize: 16, fontWeight: 700, color: "#101828" }}>
          {branding?.projectName || branding?.headerText || "Support Center"}
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: 680,
          margin: "40px auto",
          padding: "0 16px 60px",
        }}
      >
        {/* Ticket info banner */}
        <div
          style={{
            background: "#F4F3FF",
            border: "1px solid #D9D6FE",
            borderRadius: 10,
            padding: "14px 20px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>🎫</span>
          <div>
            <p style={{ fontSize: 13, color: "#667085", margin: 0 }}>
              Feedback for
            </p>
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#5925DC",
                margin: 0,
              }}
            >
              Ticket #{ticketNumber}
            </p>
          </div>
        </div>

        {/* Form card */}
        <div
          style={{
            background: "white",
            borderRadius: 12,
            border: "1px solid #E4E7EC",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            overflow: "hidden",
          }}
        >
          {/* Form header */}
          <div
            style={{
              padding: "24px 28px 20px",
              borderBottom: "1px solid #E4E7EC",
            }}
          >
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#101828",
                margin: 0,
              }}
            >
              📝 {form.name}
            </h1>
            {form.description && (
              <p style={{ fontSize: 14, color: "#667085", margin: "6px 0 0" }}>
                {form.description}
              </p>
            )}
          </div>

          {/* Questions */}
          <form onSubmit={handleSubmit} style={{ padding: "24px 28px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {form.questions
                .sort((a, b) => a.order - b.order)
                .map((q, idx) => (
                  <div key={q.id}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#344054",
                        marginBottom: 8,
                      }}
                    >
                      {idx + 1}. {q.label}
                      {q.required && (
                        <span style={{ color: "#DC2626", marginLeft: 4 }}>
                          *
                        </span>
                      )}
                    </label>

                    {q.type === "rating" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {[...Array(q.maxRating || 5)].map((_, i) => {
                          const current = answers[q.id] || 0;
                          const display = hoveredRating[q.id] || current;
                          return (
                            <button
                              key={i}
                              type="button"
                              onMouseEnter={() =>
                                setHoveredRating({
                                  ...hoveredRating,
                                  [q.id]: i + 1,
                                })
                              }
                              onMouseLeave={() =>
                                setHoveredRating({
                                  ...hoveredRating,
                                  [q.id]: 0,
                                })
                              }
                              onClick={() =>
                                setAnswers({ ...answers, [q.id]: i + 1 })
                              }
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 2,
                              }}
                            >
                              {i < display ? (
                                <StarIcon
                                  style={{
                                    width: 32,
                                    height: 32,
                                    color: "#F59E0B",
                                  }}
                                />
                              ) : (
                                <StarOutlineIcon
                                  style={{
                                    width: 32,
                                    height: 32,
                                    color: "#D1D5DB",
                                  }}
                                />
                              )}
                            </button>
                          );
                        })}
                        {answers[q.id] > 0 && (
                          <span
                            style={{
                              fontSize: 14,
                              color: "#344054",
                              marginLeft: 8,
                            }}
                          >
                            {answers[q.id]} / {q.maxRating || 5}
                          </span>
                        )}
                      </div>
                    )}

                    {q.type === "text" && (
                      <input
                        type="text"
                        value={answers[q.id] || ""}
                        onChange={(e) =>
                          setAnswers({ ...answers, [q.id]: e.target.value })
                        }
                        placeholder={q.placeholder}
                        required={q.required}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          border: "1px solid #D0D5DD",
                          borderRadius: 8,
                          fontSize: 14,
                          color: "#101828",
                          background: "#F9FAFB",
                          boxSizing: "border-box",
                          outline: "none",
                        }}
                      />
                    )}

                    {q.type === "textarea" && (
                      <textarea
                        value={answers[q.id] || ""}
                        onChange={(e) =>
                          setAnswers({ ...answers, [q.id]: e.target.value })
                        }
                        placeholder={q.placeholder}
                        required={q.required}
                        rows={4}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          border: "1px solid #D0D5DD",
                          borderRadius: 8,
                          fontSize: 14,
                          color: "#101828",
                          background: "#F9FAFB",
                          boxSizing: "border-box",
                          outline: "none",
                          resize: "vertical",
                        }}
                      />
                    )}

                    {q.type === "radio" && q.options && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {q.options.map((opt) => (
                          <label
                            key={opt}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              cursor: "pointer",
                              fontSize: 14,
                              color: "#344054",
                            }}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={opt}
                              checked={answers[q.id] === opt}
                              onChange={() =>
                                setAnswers({ ...answers, [q.id]: opt })
                              }
                              required={q.required}
                              style={{ accentColor }}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}

                    {q.type === "select" && q.options && (
                      <select
                        value={answers[q.id] || ""}
                        onChange={(e) =>
                          setAnswers({ ...answers, [q.id]: e.target.value })
                        }
                        required={q.required}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          border: "1px solid #D0D5DD",
                          borderRadius: 8,
                          fontSize: 14,
                          color: "#101828",
                          background: "#F9FAFB",
                          boxSizing: "border-box",
                          outline: "none",
                        }}
                      >
                        <option value="">Select an option</option>
                        {q.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {q.type === "checkbox" && q.options && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {q.options.map((opt) => (
                          <label
                            key={opt}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              cursor: "pointer",
                              fontSize: 14,
                              color: "#344054",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                Array.isArray(answers[q.id]) &&
                                answers[q.id].includes(opt)
                              }
                              onChange={(e) => {
                                const prev: string[] = Array.isArray(
                                  answers[q.id],
                                )
                                  ? answers[q.id]
                                  : [];
                                setAnswers({
                                  ...answers,
                                  [q.id]: e.target.checked
                                    ? [...prev, opt]
                                    : prev.filter((v) => v !== opt),
                                });
                              }}
                              style={{ accentColor }}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {/* Submit button */}
            <div
              style={{
                marginTop: 32,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: "10px 28px",
                  background: submitting ? "#9E77ED" : accentColor,
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                {submitting ? "Submitting…" : "Submit Feedback"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PublicFeedbackPage;
