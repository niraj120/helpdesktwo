import { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from "../config/api";
import { FaWhatsapp } from "react-icons/fa";

interface WidgetData {
  enabled: boolean;
  visibility: "always" | "pre-login" | "post-login";
  roleVisibility?: "all" | "roles";
  visibleRoles?: string[];
  whatsappUrl: string;
  predefinedMessage: string;
  position: "bottom-right" | "bottom-left";
  iconSize: "small" | "medium" | "large";
}

interface Props {
  projectId: string | null | undefined;
  /** Whether the current user is authenticated */
  isAuthenticated?: boolean;
  /** Current role code/name used for role-based widget visibility */
  currentRole?: string | null;
}

const ICON_SIZES: Record<string, number> = {
  small: 48,
  medium: 60,
  large: 76,
};

export default function WhatsAppFloatingIcon({
  projectId,
  isAuthenticated = false,
  currentRole,
}: Props) {
  const [widget, setWidget] = useState<WidgetData | null>(null);

  const normalizeRole = (value: string | null | undefined): string =>
    String(value || "")
      .trim()
      .replace(/\s+/g, "_")
      .toUpperCase();

  const resolveRole = (): string => {
    const explicitRole = normalizeRole(currentRole);
    if (explicitRole) return explicitRole;

    const localStorageRole = normalizeRole(localStorage.getItem("userRole"));
    if (localStorageRole) return localStorageRole;

    try {
      const rawUser = localStorage.getItem("user");
      if (!rawUser) return "";
      const user = JSON.parse(rawUser);
      const nestedRole =
        user?.role?.code || user?.role?.name || user?.role || user?.type || "";
      return normalizeRole(nestedRole);
    } catch {
      return "";
    }
  };

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    axios
      .get(`${API_BASE_URL}/projects/${projectId}/whatsapp-widget`)
      .then(({ data }) => {
        if (!cancelled && data.success && data.data?.enabled) {
          setWidget(data.data);
        }
      })
      .catch(() => {
        // widget not configured — silently do nothing
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!widget) return null;

  // Visibility check
  if (widget.visibility === "pre-login" && isAuthenticated) return null;
  if (widget.visibility === "post-login" && !isAuthenticated) return null;

  // Role-based visibility check
  if (widget.roleVisibility === "roles") {
    if (!isAuthenticated) return null;

    const effectiveRole = resolveRole();
    const allowedRoles = new Set(
      (widget.visibleRoles || []).map((role) => normalizeRole(role)),
    );

    if (!effectiveRole || !allowedRoles.has(effectiveRole)) {
      return null;
    }
  }

  const size = ICON_SIZES[widget.iconSize] || ICON_SIZES.medium;
  const url = widget.predefinedMessage
    ? `${widget.whatsappUrl}?text=${encodeURIComponent(widget.predefinedMessage)}`
    : widget.whatsappUrl;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      style={{
        position: "fixed",
        bottom: 24,
        [widget.position === "bottom-left" ? "left" : "right"]: 24,
        zIndex: 9999,
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#25D366",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.1)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
      }}
    >
      <FaWhatsapp color="#fff" size={size * 0.55} />
    </a>
  );
}
