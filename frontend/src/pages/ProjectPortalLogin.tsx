import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import axios from "axios";
import DOMPurify from "dompurify";
import { useTranslation } from "react-i18next";
import ReCAPTCHA from "react-google-recaptcha";
import { getFirstAvailableRoute } from "../utils/loginRedirect";
import { API_CONFIG } from "../config/constants";
import { LanguageToggle } from "../components/LanguageToggle";
import WhatsAppFloatingIcon from "../components/WhatsAppFloatingIcon";

interface LoginFormData {
  email: string;
  password: string;
}

interface ProjectBranding {
  projectId: string;
  name: string;
  code: string;
  branding: {
    logo: string | null;
    logoLinkbackUrl?: string;
    browserTitle?: string;
    favicon?: string;
    colorTheme: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
    };
    footerText?: string;
  };
  announcementBanner?: {
    message: string;
    type: "plain" | "rich";
  };
  footerLinks?: {
    copyright?: string;
    termsOfUse?: string;
    privacyPolicy?: string;
    cookiePolicy?: string;
  };
  loginSettings?: {
    enableFormLogin?: boolean;
    enableGoogleRecaptcha?: boolean;
    recaptchaSiteKey?: string;
  };
}

const ProjectPortalLogin: React.FC = () => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams<{ customUrlPath: string }>();
  const { t } = useTranslation();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [projectBranding, setProjectBranding] =
    useState<ProjectBranding | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = viewportWidth <= 900;

  useEffect(() => {
    // Guard against stale global scroll locks from previous routes/modals.
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyOverflowY = document.body.style.overflowY;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevHtmlOverflowY = document.documentElement.style.overflowY;

    document.body.style.overflow = "auto";
    document.body.style.overflowY = "auto";
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.overflowY = "auto";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.overflowY = prevBodyOverflowY;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.style.overflowY = prevHtmlOverflowY;
    };
  }, []);

  // Validation schema
  const loginSchema = yup.object({
    email: yup.string().required(t("emailRequired")).email(t("emailInvalid")),
    password: yup
      .string()
      .required(t("passwordRequired"))
      .min(6, t("passwordMinLengthError")),
  });

  // Form hook
  const loginForm = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema),
    mode: "onBlur",
  });

  useEffect(() => {
    fetchProjectBranding();
  }, [customUrlPath]);

  // Set favicon and browser title when branding data is loaded
  useEffect(() => {
    if (projectBranding) {
      // Set browser title
      if (projectBranding.branding?.browserTitle) {
        document.title = projectBranding.branding.browserTitle;
      } else if (projectBranding.name) {
        document.title = `${projectBranding.name} - Login`;
      }

      // Set favicon dynamically
      if (projectBranding.branding?.favicon) {
        const favicon = projectBranding.branding.favicon;
        let link: HTMLLinkElement | null =
          document.querySelector("link[rel*='icon']");

        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }

        // Set the href to either the GCS URL or base64 data
        link.href = favicon;

        // Also set shortcut icon for legacy browser support
        let shortcutLink: HTMLLinkElement | null = document.querySelector(
          "link[rel='shortcut icon']",
        );
        if (!shortcutLink) {
          shortcutLink = document.createElement("link");
          shortcutLink.rel = "shortcut icon";
          document.head.appendChild(shortcutLink);
        }
        shortcutLink.href = favicon;

        console.log(
          "✅ Favicon set:",
          favicon.substring(0, 100) + (favicon.length > 100 ? "..." : ""),
        );
      }
    }

    // Cleanup - reset to default when component unmounts
    return () => {
      document.title = "SAC Helpdesk";
    };
  }, [projectBranding]);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem("authToken");
    if (token) {
      axios
        .get(`${API_CONFIG.API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then(() => {
          // Redirect to first available route based on permissions
          const redirectPath = getFirstAvailableRoute(
            JSON.parse(localStorage.getItem("userPermissions") || "[]"),
          );
          navigate(`/${customUrlPath}/portal/${redirectPath}`);
        })
        .catch(() => {
          localStorage.removeItem("authToken");
        });
    }
  }, [customUrlPath, navigate]);

  const fetchProjectBranding = async () => {
    try {
      setBrandingLoading(true);
      setErrorMessage(""); // Clear any previous errors
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`,
        {
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        },
      );

      console.log("Project branding response:", response.data);

      if (response.data.success) {
        setProjectBranding(response.data.data);

        // Apply theme colors
        if (response.data.data.branding?.colorTheme) {
          const { primary, secondary, accent } =
            response.data.data.branding.colorTheme;
          document.documentElement.style.setProperty("--primary-main", primary);
          document.documentElement.style.setProperty(
            "--primary-dark",
            secondary,
          );
          document.documentElement.style.setProperty("--accent-main", accent);
        }
      } else {
        console.error("Failed to fetch project branding:", response.data);
        // Use default branding if API fails
        setProjectBranding({
          projectId: "",
          name: "Portal",
          code: "",
          branding: {
            logo: null,
            colorTheme: {
              primary: "#667eea",
              secondary: "#1f2937",
              accent: "#764ba2",
              background: "#ffffff",
            },
          },
        });
      }
    } catch (err: any) {
      console.error("Error fetching project branding:", err);
      console.error("Error details:", {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });

      // Use default branding on error
      setProjectBranding({
        projectId: "",
        name: "Portal",
        code: "",
        branding: {
          logo: null,
          colorTheme: {
            primary: "#667eea",
            secondary: "#1f2937",
            accent: "#764ba2",
            background: "#ffffff",
          },
        },
      });

      // Only show error if it's not a connection issue
      if (err.response) {
        setErrorMessage(
          `Failed to load project information: ${err.response.data?.message || err.message}`,
        );
      } else if (err.request) {
        setErrorMessage(
          "Cannot connect to server. Please check if the backend is running on port 3003.",
        );
      } else {
        setErrorMessage(
          "Failed to load project information. Using default settings.",
        );
      }
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
    fetchProjectBranding();
  };

  const handleLogin = async (data: LoginFormData) => {
    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      // Build request payload
      const requestPayload: any = {
        email: data.email,
        password: data.password,
      };

      // Include reCAPTCHA token if enabled
      if (
        projectBranding?.loginSettings?.enableGoogleRecaptcha &&
        recaptchaToken
      ) {
        requestPayload.recaptchaToken = recaptchaToken;
      }

      const response = await axios.post(
        `${API_CONFIG.API_URL}/auth/project/${customUrlPath}/login`,
        requestPayload,
      );

      if (response.data.success) {
        const { token, user } = response.data.data;

        // Store authentication data
        localStorage.setItem("authToken", token);
        localStorage.setItem("userId", user.id);
        localStorage.setItem("userEmail", user.email);
        localStorage.setItem("userName", user.name);
        localStorage.setItem("userRole", user.role.code);
        localStorage.setItem("userRoleName", user.role.name);
        localStorage.setItem(
          "userPermissions",
          JSON.stringify(user.role.permissions || []),
        );

        setSuccessMessage("Login successful! Redirecting...");

        // Redirect to first available route based on permissions
        setTimeout(() => {
          const redirectPath = getFirstAvailableRoute(
            user.role.permissions || [],
          );
          navigate(`/${customUrlPath}/portal/${redirectPath}`);
        }, 500);
      } else {
        setErrorMessage(response.data.message || "Login failed");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.response?.data?.message) {
        setErrorMessage(err.response.data.message);
      } else if (err.response?.status === 401) {
        setErrorMessage("Invalid email or password");
      } else if (err.response?.status === 403) {
        setErrorMessage("Access denied. Students cannot access this portal.");
      } else {
        setErrorMessage("Login failed. Please try again.");
      }
      // Reset reCAPTCHA on error
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
        setRecaptchaToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (brandingLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "4px solid rgba(255, 255, 255, 0.3)",
            borderTopColor: "white",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        ></div>
      </div>
    );
  }

  const primaryColor =
    projectBranding?.branding?.colorTheme?.primary || "#667eea";
  const secondaryColor =
    projectBranding?.branding?.colorTheme?.secondary || "#1f2937";
  const accentColor =
    projectBranding?.branding?.colorTheme?.accent || "#764ba2";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
      }}
    >
      {/* Fixed Announcement Banner */}
      {projectBranding?.announcementBanner?.message && (
        <div
          style={{
            position: isMobile ? "static" : "fixed",
            top: isMobile ? undefined : 0,
            left: isMobile ? undefined : 0,
            right: isMobile ? undefined : 0,
            zIndex: 1100,
            background:
              "linear-gradient(90deg, #1e3a5f 0%, #2d5a87 50%, #1e3a5f 100%)",
            padding: "10px 16px",
            color: "white",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          {/* Info Icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            style={{ width: "18px", height: "18px", flexShrink: 0 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
            />
          </svg>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              fontWeight: "500",
              lineHeight: "1.4",
            }}
          >
            {projectBranding.announcementBanner.message}
          </p>
        </div>
      )}

      {/* Main Content - Add top padding when banner is present */}
      <div
        className="flex-1 flex"
        style={{
          flexDirection: isMobile ? "column" : "row",
          flex: isMobile ? "0 0 auto" : 1,
          marginTop: projectBranding?.announcementBanner?.message
            ? isMobile
              ? "0"
              : "44px"
            : "0",
        }}
      >
        {/* Language Toggle - Top Right */}
        <div
          style={{
            position: isMobile ? "static" : "fixed",
            top: isMobile
              ? undefined
              : projectBranding?.announcementBanner?.message
                ? "56px"
                : "1rem",
            right: isMobile ? undefined : "1rem",
            zIndex: 1000,
            display: "flex",
            justifyContent: isMobile ? "flex-end" : "initial",
            padding: isMobile ? "12px 12px 0" : 0,
          }}
        >
          <LanguageToggle />
        </div>

        {/* Left Side - Branding & Image */}
        <div
          style={{
            flex: isMobile ? "0 0 auto" : 1,
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: isMobile ? "20px 14px 18px" : "4rem",
            color: "white",
          }}
        >
          {/* Decorative Pattern Overlay */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              opacity: 0.4,
            }}
          ></div>

          {/* Content */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              textAlign: "center",
              maxWidth: isMobile ? "100%" : "500px",
              width: "100%",
            }}
          >
            {/* Logo/Icon */}
            {projectBranding?.branding?.logo ? (
              <div
                style={{
                  margin: isMobile ? "0 auto 1rem" : "0 auto 2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {projectBranding?.branding?.logoLinkbackUrl ? (
                  <a
                    href={
                      projectBranding.branding.logoLinkbackUrl.startsWith(
                        "http",
                      )
                        ? projectBranding.branding.logoLinkbackUrl
                        : `https://${projectBranding.branding.logoLinkbackUrl}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={projectBranding.branding.logo}
                      alt={projectBranding.name}
                      loading="lazy"
                      style={{
                        maxWidth: isMobile ? "150px" : "200px",
                        maxHeight: isMobile ? "88px" : "120px",
                        height: "auto",
                        cursor: "pointer",
                      }}
                      className="hover:opacity-80 transition-opacity"
                    />
                  </a>
                ) : (
                  <img
                    src={projectBranding.branding.logo}
                    alt={projectBranding.name}
                    loading="lazy"
                    style={{
                      maxWidth: isMobile ? "150px" : "200px",
                      maxHeight: isMobile ? "88px" : "120px",
                      height: "auto",
                    }}
                  />
                )}
              </div>
            ) : (
              <div
                style={{
                  width: isMobile ? "88px" : "120px",
                  height: isMobile ? "88px" : "120px",
                  margin: isMobile ? "0 auto 1rem" : "0 auto 2rem",
                  background: "rgba(255, 255, 255, 0.2)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
                  border: "2px solid rgba(255, 255, 255, 0.3)",
                }}
              >
                <svg
                  width={isMobile ? "48" : "64"}
                  height={isMobile ? "48" : "64"}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
            )}

            {/* Title */}
            <h1
              style={{
                fontSize: isMobile ? "1.9rem" : "2.5rem",
                fontWeight: 800,
                marginBottom: isMobile ? "0.5rem" : "1rem",
                lineHeight: 1.2,
                textShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                letterSpacing: "-0.02em",
              }}
            >
              {projectBranding?.name || "Portal"}
            </h1>

            <p
              style={{
                fontSize: isMobile ? "0.95rem" : "1.125rem",
                marginBottom: isMobile ? "1rem" : "2rem",
                opacity: 0.95,
                lineHeight: 1.6,
              }}
            >
              Streamline your support operations with our comprehensive query
              and management system
            </p>

            {/* Features List */}
            <div
              style={{
                textAlign: "left",
                marginTop: isMobile ? "1rem" : "3rem",
                display: isMobile ? "none" : "block",
              }}
            >
              {[
                { icon: "🎫", text: "Efficient Query Management" },
                { icon: "📊", text: "Real-time Analytics Dashboard" },
                { icon: "🔔", text: "Smart Notifications & Alerts" },
                { icon: "🛡️", text: "Enterprise-grade Security" },
              ].map((feature, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.9rem 1rem",
                    marginBottom: "0.75rem",
                    background: "rgba(255, 255, 255, 0.12)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.28)",
                    boxShadow: "0 8px 18px rgba(0, 0, 0, 0.08)",
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>{feature.icon}</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                    {feature.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Decoration */}
          <div
            style={{
              position: isMobile ? "static" : "absolute",
              bottom: isMobile ? undefined : "2rem",
              left: isMobile ? undefined : "50%",
              transform: isMobile ? "none" : "translateX(-50%)",
              fontSize: "0.875rem",
              opacity: 0.8,
              marginTop: isMobile ? "10px" : 0,
            }}
          >
            {projectBranding?.branding?.footerText ||
              `© 2025 ${projectBranding?.name || "Portal"}. All rights reserved.`}
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div
          style={{
            flex: isMobile ? "0 0 auto" : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? "14px 12px 18px" : "2.5rem 2rem",
            background:
              "radial-gradient(circle at 90% 10%, #dbeafe 0%, transparent 28%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
            position: "relative",
          }}
        >
          {/* Main Content Area */}
          <main
            id="main-content"
            style={{
              width: "100%",
              maxWidth: "500px",
              background: "rgba(255, 255, 255, 0.96)",
              border: "1px solid #e2e8f0",
              borderRadius: "20px",
              boxShadow: "0 24px 50px rgba(15, 23, 42, 0.14)",
              padding: isMobile ? "20px 14px" : "28px 24px",
              backdropFilter: "blur(8px)",
            }}
            role="main"
          >
            {/* Success Message */}
            {successMessage && (
              <div
                style={{
                  marginBottom: "1.5rem",
                  padding: "0.9rem 1rem",
                  background: "#ecfdf3",
                  border: "1px solid #86efac",
                  borderRadius: "10px",
                }}
                role="alert"
                aria-live="polite"
              >
                <p
                  style={{ fontSize: "0.875rem", color: "#047857", margin: 0 }}
                >
                  {successMessage}
                </p>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div
                style={{
                  marginBottom: "1.5rem",
                  padding: "0.9rem 1rem",
                  background: "#fff1f2",
                  border: "1px solid #fda4af",
                  borderRadius: "10px",
                }}
                role="alert"
                aria-live="polite"
              >
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "#DC2626",
                    margin: "0 0 0.5rem 0",
                  }}
                >
                  {errorMessage}
                </p>
                {errorMessage.includes("Cannot connect") && (
                  <button
                    onClick={handleRetry}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.5rem 1rem",
                      background: "#DC2626",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    Retry Connection
                  </button>
                )}
              </div>
            )}

            {/* Login Form */}
            {projectBranding?.loginSettings?.enableFormLogin !== false ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      margin: "0 auto 1rem",
                      background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
                      borderRadius: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      boxShadow: `0 8px 20px ${primaryColor}44`,
                      border: "1px solid rgba(255,255,255,0.35)",
                    }}
                  >
                    {projectBranding?.branding?.logo ? (
                      projectBranding?.branding?.logoLinkbackUrl ? (
                        <a
                          href={
                            projectBranding.branding.logoLinkbackUrl.startsWith(
                              "http",
                            )
                              ? projectBranding.branding.logoLinkbackUrl
                              : `https://${projectBranding.branding.logoLinkbackUrl}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ width: "100%", height: "100%" }}
                        >
                          <img
                            src={projectBranding.branding.logo}
                            alt={`${projectBranding?.name || "Portal"} logo`}
                            loading="lazy"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              background: "white",
                              padding: "6px",
                              cursor: "pointer",
                            }}
                            className="hover:opacity-80 transition-opacity"
                          />
                        </a>
                      ) : (
                        <img
                          src={projectBranding.branding.logo}
                          alt={`${projectBranding?.name || "Portal"} logo`}
                          loading="lazy"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            background: "white",
                            padding: "6px",
                          }}
                        />
                      )
                    ) : (
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    )}
                  </div>
                  <h1
                    style={{
                      fontSize: "1.875rem",
                      fontWeight: 700,
                      color: "#111827",
                      marginBottom: "0.5rem",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Welcome to {projectBranding?.name || "Portal"}
                  </h1>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: primaryColor,
                      fontWeight: 500,
                    }}
                  >
                    {t("signInToContinue")}
                  </p>
                </div>

                <form
                  onSubmit={loginForm.handleSubmit(handleLogin)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                  }}
                >
                  {/* Email Field */}
                  <div>
                    <label
                      htmlFor="email"
                      style={{
                        display: "block",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        color: "#111827",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {t("emailLabel")}
                      <span style={{ color: "#EF4444", marginLeft: "0.25rem" }}>
                        *
                      </span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      {...loginForm.register("email")}
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        fontSize: "0.875rem",
                        border: loginForm.formState.errors.email
                          ? "2px solid #EF4444"
                          : "1.5px solid #d1d5db",
                        borderRadius: "10px",
                        background: "#f8fafc",
                        outline: "none",
                        transition: "all 0.2s ease",
                        fontFamily:
                          '"Noto Sans", system-ui, -apple-system, sans-serif',
                      }}
                      placeholder={t("emailPlaceholder")}
                      onFocus={(e) => {
                        if (!loginForm.formState.errors.email) {
                          e.currentTarget.style.borderColor = primaryColor;
                          e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = loginForm.formState
                          .errors.email
                          ? "#EF4444"
                          : "#E5E7EB";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                    {loginForm.formState.errors.email && (
                      <p
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.75rem",
                          color: "#EF4444",
                        }}
                        role="alert"
                      >
                        {loginForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  {/* Password Field */}
                  <div>
                    <label
                      htmlFor="password"
                      style={{
                        display: "block",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        color: "#111827",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {t("passwordLabel")}
                      <span style={{ color: "#EF4444", marginLeft: "0.25rem" }}>
                        *
                      </span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        {...loginForm.register("password")}
                        style={{
                          width: "100%",
                          padding: "0.75rem 3rem 0.75rem 1rem",
                          fontSize: "0.875rem",
                          border: loginForm.formState.errors.password
                            ? "2px solid #EF4444"
                            : "1.5px solid #d1d5db",
                          borderRadius: "10px",
                          background: "#f8fafc",
                          outline: "none",
                          transition: "all 0.2s ease",
                          fontFamily:
                            '"Noto Sans", system-ui, -apple-system, sans-serif',
                        }}
                        placeholder="Enter your password"
                        onFocus={(e) => {
                          if (!loginForm.formState.errors.password) {
                            e.currentTarget.style.borderColor = primaryColor;
                            e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
                          }
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = loginForm
                            .formState.errors.password
                            ? "#EF4444"
                            : "#E5E7EB";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: "absolute",
                          right: "0.75rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "0.25rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {showPassword ? (
                          <EyeSlashIcon
                            style={{
                              width: "20px",
                              height: "20px",
                              color: "#6B7280",
                            }}
                          />
                        ) : (
                          <EyeIcon
                            style={{
                              width: "20px",
                              height: "20px",
                              color: "#6B7280",
                            }}
                          />
                        )}
                      </button>
                    </div>
                    {loginForm.formState.errors.password && (
                      <p
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.75rem",
                          color: "#EF4444",
                        }}
                        role="alert"
                      >
                        {loginForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  {/* Forgot Password Link */}
                  <div style={{ textAlign: "right" }}>
                    <Link
                      to={`/${customUrlPath}/portal/forgot-password`}
                      style={{
                        fontSize: "0.875rem",
                        color: primaryColor,
                        textDecoration: "underline",
                        fontFamily:
                          '"Noto Sans", system-ui, -apple-system, sans-serif',
                      }}
                    >
                      Forgot your password?
                    </Link>
                  </div>

                  {/* Google reCAPTCHA */}
                  {projectBranding?.loginSettings?.enableGoogleRecaptcha &&
                    projectBranding?.loginSettings?.recaptchaSiteKey && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          marginTop: "0.5rem",
                        }}
                      >
                        <ReCAPTCHA
                          ref={recaptchaRef}
                          sitekey={
                            projectBranding.loginSettings.recaptchaSiteKey
                          }
                          onChange={(token) => setRecaptchaToken(token)}
                          onExpired={() => setRecaptchaToken(null)}
                          onErrored={() => setRecaptchaToken(null)}
                        />
                      </div>
                    )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={
                      isLoading ||
                      (projectBranding?.loginSettings?.enableGoogleRecaptcha &&
                        !recaptchaToken)
                    }
                    style={{
                      width: "100%",
                      padding: "0.875rem 1.5rem",
                      background:
                        isLoading ||
                        (projectBranding?.loginSettings
                          ?.enableGoogleRecaptcha &&
                          !recaptchaToken)
                          ? "#9CA3AF"
                          : `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
                      color: "white",
                      border: "none",
                      borderRadius: "10px",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor:
                        isLoading ||
                        (projectBranding?.loginSettings
                          ?.enableGoogleRecaptcha &&
                          !recaptchaToken)
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        isLoading ||
                        (projectBranding?.loginSettings
                          ?.enableGoogleRecaptcha &&
                          !recaptchaToken)
                          ? 0.6
                          : 1,
                      boxShadow: `0 8px 18px ${primaryColor}55`,
                      transition: "all 0.2s ease",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                    onMouseEnter={(e) => {
                      if (
                        !isLoading &&
                        !(
                          projectBranding?.loginSettings
                            ?.enableGoogleRecaptcha && !recaptchaToken
                        )
                      ) {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = `0 4px 12px ${primaryColor}50`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (
                        !isLoading &&
                        !(
                          projectBranding?.loginSettings
                            ?.enableGoogleRecaptcha && !recaptchaToken
                        )
                      ) {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = `0 2px 6px ${primaryColor}40`;
                      }
                    }}
                  >
                    {isLoading ? t("signingIn") : t("loginButton")}
                  </button>
                </form>
              </div>
            ) : (
              /* Login Disabled Message */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "1.5rem",
                  padding: "2rem",
                }}
              >
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    background:
                      "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 14px rgba(239, 68, 68, 0.3)",
                  }}
                >
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                </div>
                <div style={{ textAlign: "center" }}>
                  <h1
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 600,
                      color: "#111827",
                      marginBottom: "0.75rem",
                    }}
                  >
                    Login Currently Disabled
                  </h1>
                  <p
                    style={{
                      fontSize: "0.95rem",
                      color: "#6B7280",
                      lineHeight: "1.6",
                      maxWidth: "320px",
                    }}
                  >
                    The login form for this portal has been temporarily disabled
                    by the administrator. Please contact support for assistance.
                  </p>
                </div>
                <div
                  style={{
                    marginTop: "0.5rem",
                    padding: "12px 24px",
                    background: "#f3f4f6",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    color: "#374151",
                  }}
                >
                  Portal: <strong>{projectBranding?.name || "Portal"}</strong>
                </div>
              </div>
            )}

            {/* Trust Indicators */}
            <div style={{ marginTop: "2rem", textAlign: "center" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  fontSize: "0.875rem",
                  color: "#6B7280",
                  marginBottom: "1rem",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>{t("sslSecured")}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "1rem",
                  fontSize: "0.75rem",
                  color: "#9CA3AF",
                }}
              >
                {projectBranding?.footerLinks?.privacyPolicy && (
                  <>
                    <a
                      href={projectBranding.footerLinks.privacyPolicy}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#9CA3AF", textDecoration: "none" }}
                    >
                      {t("privacyPolicy")}
                    </a>
                    <span>•</span>
                  </>
                )}
                {projectBranding?.footerLinks?.termsOfUse && (
                  <>
                    <a
                      href={projectBranding.footerLinks.termsOfUse}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#9CA3AF", textDecoration: "none" }}
                    >
                      {t("termsOfService")}
                    </a>
                    {projectBranding?.footerLinks?.cookiePolicy && (
                      <span>•</span>
                    )}
                  </>
                )}
                {projectBranding?.footerLinks?.cookiePolicy && (
                  <a
                    href={projectBranding.footerLinks.cookiePolicy}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#9CA3AF", textDecoration: "none" }}
                  >
                    {t("cookiePolicy")}
                  </a>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
      <WhatsAppFloatingIcon
        projectId={projectBranding?.projectId}
        isAuthenticated={false}
      />
    </div>
  );
};

export default ProjectPortalLogin;
