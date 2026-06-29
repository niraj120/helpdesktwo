/**
 * OneOS Design System — canonical tokens + style helpers (app-wide).
 * See docs/ONEOS_DESIGN_SYSTEM.md. Import these anywhere:
 *   import { tokens, styles, button, chip } from "../theme/oneos";
 * The SR module's utils/srTheme.ts re-exports these for back-compat.
 */
import type { CSSProperties } from "react";

export const tokens = {
  pageBg: "#f8fafc",
  font: '"Instrument Sans", "Helvetica Neue", Arial, sans-serif',
  displayFont: '"DM Serif Display", Georgia, serif',
  monoFont: '"DM Mono", "Fira Code", monospace',

  primary: "#4f46e5",
  primaryHover: "#4338ca",
  primarySoft: "#eef2ff",

  success: "#22a55f",
  successBg: "#dcfce7",
  danger: "#ef4444",
  dangerBg: "#fee2e2",
  warn: "#d97706",
  warnBg: "#fef3c7",
  info: "#2563eb",
  infoBg: "#dbeafe",

  text: "#0f172a",
  sub: "#475569",
  muted: "#94a3b8",
  border: "#e2e8f0",
  cardShadow: "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
  rowBorder: "rgba(148,163,184,.14)",
  inputBorder: "#e2e8f0",
  bg: "#ffffff",
};

export const styles: Record<string, CSSProperties> = {
  page: {
    padding: "24px 20px 32px",
    maxWidth: 1380,
    margin: "0 auto",
    background: tokens.pageBg,
    minHeight: "100vh",
    fontFamily: tokens.font,
    color: tokens.text,
  },
  headerCard: {
    background: tokens.bg,
    padding: "22px 24px",
    borderRadius: 16,
    marginBottom: 16,
    border: `1px solid ${tokens.border}`,
    boxShadow: tokens.cardShadow,
  },
  title: {
    margin: "0 0 6px 0",
    fontFamily: tokens.displayFont,
    fontSize: 28,
    fontWeight: 700,
    color: tokens.text,
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
  },
  subtitle: { margin: 0, fontSize: 14, color: tokens.sub, fontWeight: 400 },
  card: {
    background: tokens.bg,
    border: `1px solid ${tokens.border}`,
    borderRadius: 16,
    boxShadow: tokens.cardShadow,
    padding: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    display: "block",
    marginBottom: 6,
  },
  ctrl: {
    minHeight: 40,
    padding: "9px 13px",
    border: `1.5px solid ${tokens.inputBorder}`,
    borderRadius: 8,
    fontSize: 14,
    fontFamily: tokens.font,
    color: tokens.text,
    background: tokens.bg,
    boxSizing: "border-box",
  },
  th: {
    textAlign: "left",
    padding: "11px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#94a3b8",
    background: "#f8fafc",
    borderBottom: `1px solid ${tokens.border}`,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 14px",
    fontSize: 13,
    color: "#334155",
    borderBottom: `1px solid ${tokens.rowBorder}`,
  },
};

const BTN_BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: "none",
  borderRadius: 8,
  padding: "9px 18px",
  fontWeight: 600,
  fontSize: 14,
  fontFamily: tokens.font,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export function button(
  variant: "primary" | "success" | "neutral" | "danger" = "primary",
): CSSProperties {
  switch (variant) {
    case "success":
      return {
        ...BTN_BASE,
        background: "linear-gradient(160deg, #4ade80, #22a55f)",
        color: "#fff",
        boxShadow: "0 4px 14px rgba(34,165,95,.3)",
      };
    case "danger":
      return {
        ...BTN_BASE,
        background: "linear-gradient(160deg, #f87171, #ef4444)",
        color: "#fff",
        boxShadow: "0 4px 14px rgba(239,68,68,.3)",
      };
    case "neutral":
      return {
        ...BTN_BASE,
        background: "#fff",
        color: "#334155",
        border: "1.5px solid #e2e8f0",
        boxShadow: tokens.cardShadow,
      };
    case "primary":
    default:
      return {
        ...BTN_BASE,
        background: `linear-gradient(160deg, ${tokens.primary}, ${tokens.primaryHover})`,
        color: "#fff",
        boxShadow: "0 4px 14px rgba(67,56,202,.35)",
      };
  }
}

export function chip(color: string, bg: string): CSSProperties {
  return {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: tokens.font,
    color,
    background: bg,
  };
}
