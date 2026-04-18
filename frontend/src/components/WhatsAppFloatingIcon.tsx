import { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from "../config/api";
import { FaWhatsapp } from "react-icons/fa";

interface WidgetData {
  enabled: boolean;
  visibility: "always" | "pre-login" | "post-login";
  whatsappUrl: string;
  predefinedMessage: string;
  position: "bottom-right" | "bottom-left";
  iconSize: "small" | "medium" | "large";
}

interface Props {
  projectId: string | null | undefined;
  /** Whether the current user is authenticated */
  isAuthenticated?: boolean;
}

const ICON_SIZES: Record<string, number> = {
  small: 48,
  medium: 60,
  large: 76,
};

export default function WhatsAppFloatingIcon({
  projectId,
  isAuthenticated = false,
}: Props) {
  const [widget, setWidget] = useState<WidgetData | null>(null);

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
