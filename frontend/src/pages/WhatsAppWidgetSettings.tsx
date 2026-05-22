import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { FaWhatsapp } from "react-icons/fa";
import API_BASE_URL from "../config/api";

interface WidgetConfig {
  enabled: boolean;
  visibility: "always" | "pre-login" | "post-login";
  roleVisibility: "all" | "roles";
  visibleRoles: string[];
  phoneNumber: string;
  predefinedMessage: string;
  position: "bottom-right" | "bottom-left";
  iconSize: "small" | "medium" | "large";
}

interface ProjectOption {
  _id: string;
  name: string;
  code: string;
}

interface RoleOption {
  _id: string;
  name?: string;
  code?: string;
}

const DEFAULT_CONFIG: WidgetConfig = {
  enabled: false,
  visibility: "always",
  roleVisibility: "all",
  visibleRoles: [],
  phoneNumber: "",
  predefinedMessage: "",
  position: "bottom-right",
  iconSize: "medium",
};

const ICON_SIZES: Record<WidgetConfig["iconSize"], number> = {
  small: 40,
  medium: 56,
  large: 72,
};

function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

function normalizeRoleIdentifier(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
}

export default function WhatsAppWidgetSettings() {
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);

  useEffect(() => {
    const resolveProject = async () => {
      const ctx = JSON.parse(localStorage.getItem("projectContext") || "{}");
      if (ctx.projectId) {
        setProjectId(ctx.projectId);
        return;
      }

      const direct = localStorage.getItem("projectId");
      if (direct) {
        setProjectId(direct);
        return;
      }

      try {
        const token = localStorage.getItem("authToken");
        const response = await axios.get(`${API_BASE_URL}/projects?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        let projectsList: ProjectOption[] = [];
        if (response.data.success && response.data.data) {
          if (Array.isArray(response.data.data.projects)) {
            projectsList = response.data.data.projects;
          } else if (Array.isArray(response.data.data)) {
            projectsList = response.data.data;
          } else if (typeof response.data.data === "object") {
            projectsList = [response.data.data];
          }
        } else if (Array.isArray(response.data)) {
          projectsList = response.data;
        }

        setProjects(projectsList);
        if (projectsList.length > 0) {
          setProjectId(projectsList[0]._id);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching projects:", error);
        setLoading(false);
      }
    };

    resolveProject();
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const { data } = await axios.get(
        `${API_BASE_URL}/projects/${projectId}/whatsapp-widget`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (data.success && data.data) {
        const widget = data.data;
        setConfig({
          enabled: widget.enabled ?? false,
          visibility: widget.visibility ?? "always",
          roleVisibility: widget.roleVisibility ?? "all",
          visibleRoles: Array.isArray(widget.visibleRoles)
            ? widget.visibleRoles.map((role: string) =>
                normalizeRoleIdentifier(role),
              )
            : [],
          phoneNumber: widget.phoneNumber ?? "",
          predefinedMessage: widget.predefinedMessage ?? "",
          position: widget.position ?? "bottom-right",
          iconSize: widget.iconSize ?? "medium",
        });
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    } catch {
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchRoles = useCallback(async () => {
    if (!projectId) {
      setRoles([]);
      return;
    }

    setLoadingRoles(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_BASE_URL}/roles?projectId=${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success && Array.isArray(response.data.data)) {
        setRoles(response.data.data);
      } else {
        setRoles([]);
      }
    } catch {
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchConfig();
    fetchRoles();
  }, [fetchConfig, fetchRoles]);

  const roleOptions = useMemo(
    () =>
      roles
        .map((role) => ({
          id: normalizeRoleIdentifier(role.code || role.name || ""),
          label: role.name || role.code || "Unknown",
          secondary: role.code && role.name ? role.code : "",
        }))
        .filter((role) => role.id),
    [roles],
  );

  const update = <K extends keyof WidgetConfig>(
    key: K,
    value: WidgetConfig[K],
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleVisibleRole = (roleId: string) => {
    setConfig((prev) => {
      const exists = prev.visibleRoles.includes(roleId);
      return {
        ...prev,
        visibleRoles: exists
          ? prev.visibleRoles.filter((id) => id !== roleId)
          : [...prev.visibleRoles, roleId],
      };
    });
  };

  const handleSave = async () => {
    if (!projectId) return;

    const digits = normalizePhone(config.phoneNumber);
    if (config.enabled && !digits) {
      toast.error("Please enter a valid WhatsApp phone number");
      return;
    }

    if (
      config.enabled &&
      config.roleVisibility === "roles" &&
      config.visibleRoles.length === 0
    ) {
      toast.error("Please select at least one role, or choose All Users");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("authToken");
      await axios.put(
        `${API_BASE_URL}/projects/${projectId}/whatsapp-widget`,
        {
          ...config,
          phoneNumber: digits,
          visibleRoles: config.visibleRoles.map((role) =>
            normalizeRoleIdentifier(role),
          ),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      toast.success("WhatsApp widget settings saved successfully");
      setConfig((prev) => ({ ...prev, phoneNumber: digits }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const previewUrl = config.phoneNumber
    ? `https://wa.me/${normalizePhone(config.phoneNumber)}${config.predefinedMessage ? "?text=" + encodeURIComponent(config.predefinedMessage) : ""}`
    : "";

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "999px",
            border: "3px solid #E2E8F0",
            borderTopColor: "#7F56D9",
            animation: "spin 1s linear infinite",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "24px 20px 36px",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E4E7EC",
          borderRadius: "14px",
          boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
          padding: "22px 24px",
          marginBottom: "16px",
        }}
      >
        <h1
          style={{
            margin: "0 0 6px 0",
            fontSize: "24px",
            fontWeight: 700,
            color: "#101828",
            letterSpacing: "-0.01em",
          }}
        >
          WhatsApp Widget
        </h1>
        <p style={{ margin: 0, fontSize: "14px", color: "#667085" }}>
          Configure floating icon behavior, appearance, and role-based
          visibility.
        </p>
      </div>

      {projects.length > 1 && (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E4E7EC",
            borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "13px",
              color: "#344054",
              fontWeight: 600,
              marginBottom: "8px",
            }}
          >
            Select Project
          </label>
          <select
            value={projectId || ""}
            onChange={(e) => setProjectId(e.target.value)}
            style={{
              width: "100%",
              maxWidth: "420px",
              border: "1px solid #D0D5DD",
              borderRadius: "8px",
              padding: "10px 12px",
              background: "#F9FAFB",
              fontSize: "14px",
              color: "#344054",
            }}
          >
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name} ({project.code})
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E4E7EC",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,.06)",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3
              style={{
                margin: "0 0 4px 0",
                fontSize: "16px",
                color: "#101828",
              }}
            >
              Widget Status
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#667085" }}>
              Turn this on to show the floating WhatsApp icon.
            </p>
          </div>
          <button
            type="button"
            onClick={() => update("enabled", !config.enabled)}
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              width: "50px",
              height: "28px",
              borderRadius: "999px",
              border: "none",
              background: config.enabled ? "#16A34A" : "#98A2B3",
              cursor: "pointer",
              transition: "all .2s ease",
            }}
          >
            <span
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "999px",
                background: "#FFFFFF",
                marginLeft: config.enabled ? "26px" : "4px",
                transition: "all .2s ease",
              }}
            />
          </button>
        </div>
      </div>

      {config.enabled && (
        <>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: "10px",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              padding: "16px",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                margin: "0 0 14px 0",
                fontSize: "16px",
                color: "#101828",
              }}
            >
              Number and Message
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: "14px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "13px",
                    color: "#344054",
                    fontWeight: 600,
                  }}
                >
                  WhatsApp Number (with country code)
                </label>
                <input
                  type="text"
                  value={config.phoneNumber}
                  onChange={(e) => update("phoneNumber", e.target.value)}
                  placeholder="e.g. 919876543210"
                  style={{
                    width: "100%",
                    maxWidth: "520px",
                    border: "1px solid #D0D5DD",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    background: "#F9FAFB",
                    fontSize: "14px",
                    color: "#344054",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "13px",
                    color: "#344054",
                    fontWeight: 600,
                  }}
                >
                  Predefined Message (optional)
                </label>
                <textarea
                  value={config.predefinedMessage}
                  onChange={(e) => update("predefinedMessage", e.target.value)}
                  rows={3}
                  placeholder="e.g. Hi, I need help with..."
                  style={{
                    width: "100%",
                    border: "1px solid #D0D5DD",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    background: "#F9FAFB",
                    fontSize: "14px",
                    color: "#344054",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: "10px",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              padding: "16px",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                margin: "0 0 14px 0",
                fontSize: "16px",
                color: "#101828",
              }}
            >
              Display Rules
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "10px",
                marginBottom: "14px",
              }}
            >
              {[
                {
                  value: "always",
                  label: "Always",
                  desc: "Before and after login",
                },
                {
                  value: "pre-login",
                  label: "Pre-login",
                  desc: "Only on public/login pages",
                },
                {
                  value: "post-login",
                  label: "Post-login",
                  desc: "Only for authenticated users",
                },
              ].map((option) => {
                const active = config.visibility === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      update(
                        "visibility",
                        option.value as WidgetConfig["visibility"],
                      )
                    }
                    style={{
                      textAlign: "left",
                      borderRadius: "10px",
                      border: active
                        ? "2px solid #7F56D9"
                        : "1px solid #E4E7EC",
                      background: active ? "#F4F3FF" : "#FFFFFF",
                      padding: "12px",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: active ? "#6941C6" : "#101828",
                      }}
                    >
                      {option.label}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#667085",
                        marginTop: "2px",
                      }}
                    >
                      {option.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{ borderTop: "1px dashed #D0D5DD", paddingTop: "14px" }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  marginBottom: "12px",
                }}
              >
                <button
                  type="button"
                  onClick={() => update("roleVisibility", "all")}
                  style={{
                    borderRadius: "999px",
                    border:
                      config.roleVisibility === "all"
                        ? "1px solid #7F56D9"
                        : "1px solid #D0D5DD",
                    background:
                      config.roleVisibility === "all" ? "#F4F3FF" : "#FFFFFF",
                    color:
                      config.roleVisibility === "all" ? "#6941C6" : "#344054",
                    padding: "7px 12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  All Users
                </button>
                <button
                  type="button"
                  onClick={() => update("roleVisibility", "roles")}
                  style={{
                    borderRadius: "999px",
                    border:
                      config.roleVisibility === "roles"
                        ? "1px solid #7F56D9"
                        : "1px solid #D0D5DD",
                    background:
                      config.roleVisibility === "roles" ? "#F4F3FF" : "#FFFFFF",
                    color:
                      config.roleVisibility === "roles" ? "#6941C6" : "#344054",
                    padding: "7px 12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Role Based
                </button>
              </div>

              {config.roleVisibility === "roles" && (
                <div
                  style={{
                    border: "1px solid #E4E7EC",
                    borderRadius: "10px",
                    background: "#F9FAFB",
                    padding: "12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#344054",
                      fontWeight: 600,
                      marginBottom: "8px",
                    }}
                  >
                    Select roles that can see the icon
                  </div>
                  {loadingRoles ? (
                    <div style={{ fontSize: "13px", color: "#667085" }}>
                      Loading roles...
                    </div>
                  ) : roleOptions.length === 0 ? (
                    <div style={{ fontSize: "13px", color: "#667085" }}>
                      No roles found for this project.
                    </div>
                  ) : (
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                    >
                      {roleOptions.map((role) => {
                        const selected = config.visibleRoles.includes(role.id);
                        return (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => toggleVisibleRole(role.id)}
                            style={{
                              borderRadius: "8px",
                              border: selected
                                ? "1px solid #7F56D9"
                                : "1px solid #D0D5DD",
                              background: selected ? "#F4F3FF" : "#FFFFFF",
                              color: selected ? "#6941C6" : "#344054",
                              padding: "8px 10px",
                              fontSize: "13px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{role.label}</div>
                            {role.secondary && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#667085",
                                  marginTop: "1px",
                                }}
                              >
                                {role.secondary}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: "10px",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              padding: "16px",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                margin: "0 0 14px 0",
                fontSize: "16px",
                color: "#101828",
              }}
            >
              Appearance and Preview
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(["bottom-right", "bottom-left"] as const).map((position) => {
                  const active = config.position === position;
                  return (
                    <button
                      key={position}
                      type="button"
                      onClick={() => update("position", position)}
                      style={{
                        borderRadius: "8px",
                        border: active
                          ? "1px solid #7F56D9"
                          : "1px solid #D0D5DD",
                        background: active ? "#F4F3FF" : "#FFFFFF",
                        color: active ? "#6941C6" : "#344054",
                        padding: "8px 12px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {position === "bottom-right"
                        ? "Bottom Right"
                        : "Bottom Left"}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(["small", "medium", "large"] as const).map((size) => {
                  const active = config.iconSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => update("iconSize", size)}
                      style={{
                        borderRadius: "8px",
                        border: active
                          ? "1px solid #7F56D9"
                          : "1px solid #D0D5DD",
                        background: active ? "#F4F3FF" : "#FFFFFF",
                        color: active ? "#6941C6" : "#344054",
                        padding: "8px 12px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  position: "relative",
                  height: "180px",
                  borderRadius: "10px",
                  background:
                    "linear-gradient(180deg, #F9FAFB 0%, #F2F4F7 100%)",
                  border: "1px solid #E4E7EC",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    left: "10px",
                    fontSize: "12px",
                    color: "#667085",
                  }}
                >
                  Live preview
                </div>
                <div
                  style={{
                    position: "absolute",
                    bottom: "16px",
                    [config.position === "bottom-right" ? "right" : "left"]:
                      "16px",
                    width: ICON_SIZES[config.iconSize],
                    height: ICON_SIZES[config.iconSize],
                    borderRadius: "50%",
                    background: "#25D366",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 20px rgba(0,0,0,.2)",
                  }}
                >
                  <FaWhatsapp
                    color="#FFFFFF"
                    size={ICON_SIZES[config.iconSize] * 0.55}
                  />
                </div>
                {previewUrl && (
                  <div
                    style={{
                      position: "absolute",
                      left: "10px",
                      right: "10px",
                      bottom: "10px",
                      fontSize: "11px",
                      color: "#667085",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    Link: {previewUrl}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            border: "none",
            background: saving ? "#98A2B3" : "#7F56D9",
            color: "#FFFFFF",
            fontSize: "14px",
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: saving ? "none" : "0 4px 12px rgba(127, 86, 217, 0.28)",
          }}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      <style>
        {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
}
