import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import API_BASE_URL from "../config/api";
import ModuleHeader from "../components/ModuleHeader";
import { toast } from "react-hot-toast";
import { FaWhatsapp } from "react-icons/fa";

interface WidgetConfig {
  enabled: boolean;
  visibility: "always" | "pre-login" | "post-login";
  phoneNumber: string;
  predefinedMessage: string;
  position: "bottom-right" | "bottom-left";
  iconSize: "small" | "medium" | "large";
}

const DEFAULT_CONFIG: WidgetConfig = {
  enabled: false,
  visibility: "always",
  phoneNumber: "",
  predefinedMessage: "",
  position: "bottom-right",
  iconSize: "medium",
};

const ICON_SIZES: Record<string, number> = {
  small: 40,
  medium: 56,
  large: 72,
};

/**
 * Normalize a phone number input to digits-only.
 * Accepts formats: +91 98765 43210, 91-9876543210, 9876543210, etc.
 */
function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

export default function WhatsAppWidgetSettings() {
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);

  // Resolve project ID from localStorage or fetch projects as fallback
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

      // Fallback: fetch all projects and pick the first one
      try {
        const token = localStorage.getItem("authToken");
        const response = await axios.get(`${API_BASE_URL}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        let projectsList: any[] = [];
        if (response.data.success && response.data.data) {
          if (
            response.data.data.projects &&
            Array.isArray(response.data.data.projects)
          ) {
            projectsList = response.data.data.projects;
          } else if (Array.isArray(response.data.data)) {
            projectsList = response.data.data;
          } else if (typeof response.data.data === "object") {
            projectsList = [response.data.data];
          }
        } else if (Array.isArray(response.data)) {
          projectsList = response.data;
        }

        if (projectsList.length > 0) {
          setProjects(projectsList);
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

  // Fetch current config when projectId is known
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
        const d = data.data;
        setConfig({
          enabled: d.enabled ?? false,
          visibility: d.visibility ?? "always",
          phoneNumber: d.phoneNumber ?? "",
          predefinedMessage: d.predefinedMessage ?? "",
          position: d.position ?? "bottom-right",
          iconSize: d.iconSize ?? "medium",
        });
      }
    } catch {
      // First time — no config saved yet, use defaults
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    if (!projectId) return;

    const digits = normalizePhone(config.phoneNumber);
    if (config.enabled && !digits) {
      toast.error("Please enter a valid WhatsApp phone number");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("authToken");
      await axios.put(
        `${API_BASE_URL}/projects/${projectId}/whatsapp-widget`,
        { ...config, phoneNumber: digits },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success("WhatsApp widget settings saved successfully");
      // Update local state with cleaned phone
      setConfig((prev) => ({ ...prev, phoneNumber: digits }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof WidgetConfig>(
    key: K,
    value: WidgetConfig[K],
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Build preview URL
  const previewUrl = config.phoneNumber
    ? `https://wa.me/${normalizePhone(config.phoneNumber)}${config.predefinedMessage ? "?text=" + encodeURIComponent(config.predefinedMessage) : ""}`
    : "";

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <ModuleHeader
        title="WhatsApp Widget"
        subtitle="Configure the floating WhatsApp chat icon displayed to students and visitors"
      />

      {/* Project Selector (if multiple projects available) */}
      {projects.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Project
          </label>
          <select
            value={projectId || ""}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full md:w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
          >
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name} ({project.code})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Enable / Disable */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Widget Status
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              When enabled, a floating WhatsApp icon will appear on the platform
            </p>
          </div>
          <button
            onClick={() => update("enabled", !config.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.enabled ? "bg-green-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Settings (visible only when enabled) */}
      {config.enabled && (
        <>
          {/* Phone Number */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              WhatsApp Number
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number (with country code)
              </label>
              <input
                type="text"
                value={config.phoneNumber}
                onChange={(e) => update("phoneNumber", e.target.value)}
                placeholder="e.g. 919876543210 or +91 98765 43210"
                className="w-full md:w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Non-digit characters will be stripped automatically. Include
                country code (e.g. 91 for India).
              </p>
            </div>
          </div>

          {/* Predefined Message */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Predefined Message
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default message (optional)
              </label>
              <textarea
                value={config.predefinedMessage}
                onChange={(e) => update("predefinedMessage", e.target.value)}
                placeholder="e.g. Hi, I need help with..."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                This message will be pre-filled when the user clicks the
                WhatsApp icon.
              </p>
            </div>
          </div>

          {/* Visibility */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Visibility
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  value: "always",
                  label: "Always",
                  desc: "Show on all pages (before & after login)",
                },
                {
                  value: "pre-login",
                  label: "Before Login",
                  desc: "Only on login & public portal pages",
                },
                {
                  value: "post-login",
                  label: "After Login",
                  desc: "Only after user is logged in",
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    update(
                      "visibility",
                      opt.value as WidgetConfig["visibility"],
                    )
                  }
                  className={`text-left p-4 rounded-lg border-2 transition-all ${
                    config.visibility === opt.value
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="font-medium text-gray-800">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Appearance
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Position */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Position
                </label>
                <div className="flex gap-3">
                  {[
                    { value: "bottom-right", label: "Bottom Right" },
                    { value: "bottom-left", label: "Bottom Left" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        update(
                          "position",
                          opt.value as WidgetConfig["position"],
                        )
                      }
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        config.position === opt.value
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Icon Size
                </label>
                <div className="flex gap-3">
                  {(["small", "medium", "large"] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => update("iconSize", size)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-medium capitalize transition-all ${
                        config.iconSize === size
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Preview
            </h3>
            <div className="relative bg-gray-100 rounded-lg h-48 overflow-hidden">
              <div
                className={`absolute ${config.position === "bottom-right" ? "right-4" : "left-4"} bottom-4`}
              >
                <div
                  className="bg-green-500 rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:bg-green-600 transition-colors"
                  style={{
                    width: ICON_SIZES[config.iconSize],
                    height: ICON_SIZES[config.iconSize],
                  }}
                >
                  <FaWhatsapp
                    color="#fff"
                    size={ICON_SIZES[config.iconSize] * 0.55}
                  />
                </div>
              </div>
              <div className="absolute top-3 left-3 text-xs text-gray-400">
                Page preview area
              </div>
              {previewUrl && (
                <div className="absolute bottom-3 left-3 right-3 text-xs text-gray-500 truncate">
                  Link: {previewUrl}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Save Button */}
      <div className="flex justify-end mb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
