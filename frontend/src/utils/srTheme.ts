/**
 * Shared Service-Request UI tokens + style helpers.
 * Mirrors the View Queries (ViewTickets) page exactly so the whole SR module
 * looks native: Noto Sans, #f6f8fc canvas, white 14px cards with the same
 * border + shadow, #2563EB primary / #059669 success, 10px inputs, 20px pills.
 */
import type { CSSProperties } from "react";

export const SR = {
  pageBg: "#f6f8fc",
  font: '"Noto Sans", system-ui, -apple-system, sans-serif',
  primary: "#2563EB",
  primaryHover: "#1d4ed8",
  success: "#059669",
  successHover: "#047857",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  successBg: "#ecfdf5",
  warn: "#b45309",
  warnBg: "#fffbeb",
  text: "#111827",
  sub: "#6b7280",
  border: "#e7ebf3",
  cardShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
  rowBorder: "#eef1f6",
  inputBorder: "#d7deea",
  bg: "#ffffff",
};

export const srStyles: Record<string, CSSProperties> = {
  page: {
    padding: "24px 20px 32px",
    maxWidth: 1380,
    margin: "0 auto",
    background: SR.pageBg,
    minHeight: "100vh",
    fontFamily: SR.font,
  },
  headerCard: {
    background: SR.bg,
    padding: "22px 24px",
    borderRadius: 14,
    marginBottom: 16,
    border: `1px solid ${SR.border}`,
    boxShadow: SR.cardShadow,
  },
  title: {
    margin: "0 0 6px 0",
    fontSize: 24,
    fontWeight: 700,
    color: SR.text,
    letterSpacing: "-0.01em",
  },
  subtitle: { margin: 0, fontSize: 14, color: SR.sub, fontWeight: 400 },
  card: {
    background: SR.bg,
    border: `1px solid ${SR.border}`,
    borderRadius: 14,
    boxShadow: SR.cardShadow,
    padding: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    display: "block",
    marginBottom: 6,
  },
  ctrl: {
    minHeight: 40,
    padding: "8px 12px",
    border: `1px solid ${SR.inputBorder}`,
    borderRadius: 10,
    fontSize: 14,
    fontFamily: SR.font,
    background: SR.bg,
    boxSizing: "border-box",
  },
  th: {
    textAlign: "left",
    padding: "12px 14px",
    fontSize: 12,
    fontWeight: 600,
    color: SR.sub,
    background: "#f9fafc",
    borderBottom: `1px solid ${SR.border}`,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 14px",
    fontSize: 13,
    color: "#374151",
    borderBottom: `1px solid ${SR.rowBorder}`,
  },
};

export function srButton(
  variant: "primary" | "success" | "neutral" | "danger" = "primary",
): CSSProperties {
  const bg: Record<string, string> = {
    primary: SR.primary,
    success: SR.success,
    neutral: SR.sub,
    danger: SR.danger,
  };
  return {
    background: bg[variant],
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "9px 18px",
    fontWeight: 600,
    fontSize: 14,
    fontFamily: SR.font,
    cursor: "pointer",
  };
}

export function chip(color: string, bg: string): CSSProperties {
  return {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    color,
    background: bg,
  };
}
