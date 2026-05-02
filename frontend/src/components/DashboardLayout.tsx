import {
  ReactNode,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import WhatsAppFloatingIcon from "./WhatsAppFloatingIcon";
import { SkipLink } from "./accessible/SkipLink";
import { LanguageToggle } from "./LanguageToggle";
import { HeaderProjectSwitcher } from "./HeaderProjectSwitcher";
import { ViewModeToggle } from "./ViewModeToggle";
import NotificationPermissionBanner from "./NotificationPermissionBanner";
import { designSystem } from "../styles/designSystem";
import { useEmailActivityPolling } from "../hooks/useEmailActivityPolling";
import { usePermissions } from "../hooks/usePermissions";
import { useBranding } from "../contexts/BrandingContext";
import {
  menuConfig,
  projectPortalMenuConfig,
  getFilteredMenuItems,
} from "../config/menuConfig";
import { API_CONFIG } from "../config/constants";
import {
  MdDashboard,
  MdFolder,
  MdSettings,
  MdSecurity,
  MdPeople,
  MdDescription,
  MdConfirmationNumber,
  MdDynamicForm,
  MdFlashOn,
  MdPerson,
  MdPhone,
  MdLink,
  MdAutoMode,
  MdAdd,
  MdUpdate,
  MdTimer,
  MdCheckCircle,
  MdAccountTree,
  MdSchedule,
  MdIntegrationInstructions,
  MdBarChart,
  MdFactCheck,
  MdHistory,
  MdLogin,
  MdBook,
  MdBlock,
  MdError,
  MdMailOutline,
  MdSyncProblem,
  MdWebhook,
  MdChat,
  MdLogout,
  MdMenu,
  MdChevronLeft,
  MdExpandMore,
  MdLabel,
  MdPriorityHigh,
  MdCategory,
  MdStyle,
} from "react-icons/md";

interface DashboardLayoutProps {
  children: ReactNode;
  logoutRedirectPath?: string; // Optional custom logout redirect path
}

const DashboardLayout = ({
  children,
  logoutRedirectPath,
}: DashboardLayoutProps) => {
  const location = useLocation();
  const { i18n } = useTranslation();

  // Enable email activity polling for real-time ticket notifications
  useEmailActivityPolling({
    enabled: true,
    showNotifications: true,
  });

  // Load expanded menus from sessionStorage on mount
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(() => {
    const saved = sessionStorage.getItem("expandedMenus");
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch {
        return new Set();
      }
    }
    return new Set();
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [roleDocument, setRoleDocument] = useState<{
    fileName: string;
    fileUrl: string;
  } | null>(null);

  // Fetch user's role document with caching
  useEffect(() => {
    let isMounted = true;

    const fetchRoleDocument = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const user = JSON.parse(localStorage.getItem("user") || "{}");

        if (!user.role) return;

        // Extract role ID - user.role can be string (name/code) or object with _id
        const roleId = typeof user.role === "object" ? user.role._id : null;

        // Skip API call if we don't have a valid role ID (MongoDB ObjectId)
        if (!roleId || !/^[a-f\d]{24}$/i.test(roleId)) {
          console.log("⚠️ Role document fetch skipped - no valid role ID");
          return;
        }

        // Check session cache first (5 minute TTL)
        const cacheKey = `roleDoc_${roleId}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < 300000 && isMounted) {
            // 5 minutes
            setRoleDocument(data);
            return;
          }
        }

        // Deduplicate concurrent requests
        const fetchKey = `__roleDocFetch_${roleId}`;
        if ((window as any)[fetchKey]) {
          const result = await (window as any)[fetchKey];
          if (isMounted && result) setRoleDocument(result);
          return;
        }

        const fetchPromise = (async () => {
          const response = await fetch(
            `${API_CONFIG.API_URL}/roles/${roleId}?includePermissions=false`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );

          if (response.ok) {
            const data = await response.json();
            if (data.data?.document) {
              const docData = {
                fileName: data.data.document.fileName,
                fileUrl: data.data.document.fileUrl,
              };
              // Cache for 5 minutes
              sessionStorage.setItem(
                cacheKey,
                JSON.stringify({
                  data: docData,
                  timestamp: Date.now(),
                }),
              );
              return docData;
            }
          }
          return null;
        })();

        (window as any)[fetchKey] = fetchPromise;
        const result = await fetchPromise;
        delete (window as any)[fetchKey];

        if (isMounted && result) {
          setRoleDocument(result);
        }
      } catch (error) {
        console.error("Error fetching role document:", error);
      }
    };

    fetchRoleDocument();

    return () => {
      isMounted = false;
    };
  }, []);

  // Save sidebar scroll position to sessionStorage
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const handleScroll = () => {
      sessionStorage.setItem(
        "sidebarScrollPosition",
        sidebar.scrollTop.toString(),
      );
    };

    sidebar.addEventListener("scroll", handleScroll);
    return () => sidebar.removeEventListener("scroll", handleScroll);
  }, []);

  // Restore sidebar scroll position on mount and location change
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const savedPosition = sessionStorage.getItem("sidebarScrollPosition");
    if (savedPosition) {
      sidebar.scrollTop = parseInt(savedPosition, 10);
    }
  }, [location.pathname]);

  // Save expanded menus to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem(
      "expandedMenus",
      JSON.stringify(Array.from(expandedMenus)),
    );
  }, [expandedMenus]);

  // Get user permissions from the permission context
  const { permissions } = usePermissions();

  // Get branding from context instead of fetching directly
  const { branding: projectBranding } = useBranding();

  // Debug permissions
  useEffect(() => {
    console.log("🔐 DashboardLayout - User Permissions:", permissions);
    console.log("🔐 Total permissions:", permissions?.length || 0);
    console.log(
      "🔐 Has TICKET_ASSIGN:",
      permissions?.includes("TICKET_ASSIGN"),
    );
  }, [permissions]);

  // Auto-expand menu that contains the active route on initial load only
  useEffect(() => {
    const currentPath = location.pathname;
    const activeMenuItem = menuConfig.find((item) =>
      item.subItems?.some((sub) => {
        if (!sub.path) return false;
        return currentPath === sub.path || currentPath.includes(sub.path);
      }),
    );

    if (activeMenuItem?.label && !isSidebarCollapsed) {
      setExpandedMenus((prev) => {
        const newSet = new Set(prev);
        newSet.add(activeMenuItem.label);
        return newSet;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount

  // Helper function to get label in current language
  const getLabel = (item: any): string => {
    if (i18n.language === "hi" && item.labelHi) return item.labelHi;
    if (i18n.language === "mr" && item.labelMr) return item.labelMr;
    return item.label; // Default to English
  };

  // Helper function for common UI text
  const getText = (en: string, hi: string, mr: string): string => {
    if (i18n.language === "hi") return hi;
    if (i18n.language === "mr") return mr;
    return en;
  };

  // Determine if this is a project portal - check both localStorage AND current URL
  const [projectContext, setProjectContext] = useState<{
    customUrlPath: string;
    projectId: string;
  } | null>(() => {
    const projectContextStr = localStorage.getItem("projectContext");
    return projectContextStr ? JSON.parse(projectContextStr) : null;
  });

  // Define main system routes (Super Admin routes) - these should NEVER use project portal mode
  const currentPath = location.pathname;
  const mainSystemRoutes = [
    "/dashboard",
    "/projects",
    "/users",
    "/rbac",
    "/master-data",
    "/settings",
    "/tickets",
    "/reports",
    "/audit-logs",
    "/knowledge-base",
    "/kb-",
    "/email-config",
    "/escalation",
    "/sla",
    "/approval",
    "/offline-support",
    "/faq",
    "/assets",
    "/db-monitoring",
    "/login",
    "/no-access",
  ];
  const isMainSystemRoute = mainSystemRoutes.some((route) =>
    currentPath.startsWith(route),
  );

  // Derive isProjectPortal from BOTH URL and localStorage
  // If URL contains /portal/, we're definitely in project portal mode
  // If URL is a main system route, we're definitely NOT in project portal mode
  const urlHasPortal = currentPath.includes("/portal/");
  const customUrlPathFromUrl = urlHasPortal ? currentPath.split("/")[1] : null;

  // IMPORTANT: Main system routes take priority - they should never be treated as project portal
  const isProjectPortal = urlHasPortal && !isMainSystemRoute;
  const customUrlPath = customUrlPathFromUrl || projectContext?.customUrlPath;

  // Clear stale projectContext when accessing main system routes
  useEffect(() => {
    if (isMainSystemRoute && projectContext) {
      console.log(
        "🧹 Clearing stale projectContext for main system route:",
        currentPath,
      );
      localStorage.removeItem("projectContext");
      localStorage.removeItem("projectBranding");
      localStorage.removeItem("projectId");
      setProjectContext(null);
    }
  }, [isMainSystemRoute, currentPath, projectContext]);

  // Update projectContext when URL changes
  useEffect(() => {
    if (urlHasPortal && customUrlPathFromUrl) {
      const projectContextStr = localStorage.getItem("projectContext");
      const existingContext = projectContextStr
        ? JSON.parse(projectContextStr)
        : null;

      // Update state if URL-derived context is different
      if (
        !existingContext ||
        existingContext.customUrlPath !== customUrlPathFromUrl
      ) {
        const newContext = {
          customUrlPath: customUrlPathFromUrl,
          projectId: existingContext?.projectId || "",
        };
        setProjectContext(newContext);
      }
    }
  }, [urlHasPortal, customUrlPathFromUrl]);

  // Get filtered menu items based on permissions - memoized for performance
  const menuItems = useMemo(() => {
    if (isProjectPortal) {
      return getFilteredMenuItems(
        projectPortalMenuConfig.map((item) => ({
          ...item,
          path: item.path ? `/${customUrlPath}/portal/${item.path}` : undefined,
          subItems: item.subItems?.map((subItem) => ({
            ...subItem,
            path: subItem.path
              ? `/${customUrlPath}/portal/${subItem.path}`
              : undefined,
          })),
        })),
        permissions,
      );
    }
    return getFilteredMenuItems(menuConfig, permissions);
  }, [isProjectPortal, customUrlPath, permissions]);

  const userName = localStorage.getItem("userName") || "Super Admin";

  // Get user role for display
  const getUserRole = (): string => {
    try {
      // First try to get role name from project portal login
      const userRoleName = localStorage.getItem("userRoleName");
      if (userRoleName) {
        return userRoleName;
      }

      // Try to get from user object (for legacy logins)
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.role) {
          if (typeof user.role === "object" && user.role.name) {
            return user.role.name;
          }
          if (typeof user.role === "object" && user.role.code) {
            return user.role.code;
          }
          if (typeof user.role === "string") {
            return user.role;
          }
        }
        if (user.roleCode) {
          return user.roleCode;
        }
      }

      // Fallback to userRole code if name not available
      const userRole = localStorage.getItem("userRole");
      if (userRole) {
        return userRole;
      }
    } catch (error) {
      console.error("Error getting user role:", error);
    }
    return "User";
  };

  const userRole = getUserRole();
  const sidebarWidth = isSidebarCollapsed ? "64px" : "240px";

  return (
    <>
      {/* Skip Navigation Link for Keyboard Users */}
      <SkipLink />

      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          overflow: "visible",
          fontFamily:
            i18n.language === "mr"
              ? '"Noto Sans Devanagari", sans-serif'
              : designSystem.typography.fontFamily.primary,
        }}
      >
        {/* Sidebar Navigation */}
        <aside
          ref={sidebarRef}
          role="navigation"
          aria-label={getText(
            "Main navigation",
            "मुख्य नेविगेशन",
            "मुख्य नेव्हिगेशन",
          )}
          style={{
            width: sidebarWidth,
            background: "var(--background-primary)",
            borderRight: "1px solid var(--border-light)",
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            height: "100vh",
            overflowY: "auto",
            overflowX: "visible",
            transition: "width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            zIndex: 100,
            // Custom scrollbar styles
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(0, 0, 0, 0.1) transparent",
          }}
          className="custom-scrollbar"
        >
          {/* Logo at Top */}
          <div
            style={{
              height: "64px",
              boxSizing: "border-box",
              padding: isSidebarCollapsed ? "0 12px" : "0 16px",
              borderBottom: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: isSidebarCollapsed ? "center" : "flex-start",
              gap: "12px",
              flexShrink: 0,
              transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            {projectBranding?.logo ? (
              <img
                src={projectBranding.logo}
                alt={projectBranding.name}
                loading="lazy"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  backgroundColor:
                    projectBranding?.colorTheme?.primary ||
                    "var(--primary-main)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  flexShrink: 0,
                  color: "white",
                }}
              >
                <MdFolder />
              </div>
            )}
            {!isSidebarCollapsed && (
              <div
                style={{
                  flex: 1,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  opacity: isSidebarCollapsed ? 0 : 1,
                  transition: "opacity 0.3s ease 0.1s",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {userName}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                  }}
                >
                  {userRole}
                </div>
              </div>
            )}
          </div>

          {/* Language Toggle — own section so the dropdown can overflow freely */}
          {!isSidebarCollapsed && (
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border-light)",
                position: "relative",
                zIndex: 200,
                overflow: "visible",
                flexShrink: 0,
              }}
            >
              <LanguageToggle />
            </div>
          )}

          {/* Collapse Button */}
          <div
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid var(--border-light)",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="btn btn-icon"
              style={{
                width: "100%",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "transparent",
                color: "var(--text-secondary)",
                fontSize: "20px",
                cursor: "pointer",
              }}
              aria-label={
                isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? <MdMenu /> : <MdChevronLeft />}
            </button>
          </div>

          {/* Menu Items */}
          <nav
            style={{
              flex: 1,
              padding: isSidebarCollapsed ? "8px 4px" : "8px 12px",
              overflow: "visible",
              position: "relative",
            }}
            aria-label={getText(
              "Primary menu",
              "प्राथमिक मेनू",
              "प्राथमिक मेनू",
            )}
          >
            {menuItems.map((item, index) => {
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isExpanded =
                expandedMenus.has(item.label) && !isSidebarCollapsed;

              // Smart path matching that handles dynamic route prefixes
              const isActive = item.path
                ? (() => {
                    const currentPath = location.pathname;
                    const menuPath = item.path;

                    // Exact match - fastest check
                    if (currentPath === menuPath) return true;

                    // Check if both paths contain 'portal' - indicates project-specific route
                    if (
                      currentPath.includes("/portal/") &&
                      menuPath.includes("/portal/")
                    ) {
                      // Compare everything after 'portal/'
                      const currentAfterPortal = currentPath.substring(
                        currentPath.indexOf("/portal/"),
                      );
                      const menuAfterPortal = menuPath.substring(
                        menuPath.indexOf("/portal/"),
                      );
                      return currentAfterPortal === menuAfterPortal;
                    }

                    return false;
                  })()
                : false;

              const isSubItemActive =
                hasSubItems &&
                item.subItems?.some((sub) => {
                  if (!sub.path) return false;
                  const currentPath = location.pathname;
                  const subPath = sub.path;

                  // Exact match
                  if (currentPath === subPath) return true;

                  // For nested routes (like audit/*), check if current path ends with the sub-path
                  // Example: /audit/activity-logs should match regardless of prefix
                  if (
                    subPath.includes("/") &&
                    currentPath.endsWith(
                      subPath.substring(subPath.lastIndexOf("/")),
                    )
                  ) {
                    // Additional check: ensure the parent path also matches
                    const subParent = subPath.substring(
                      0,
                      subPath.lastIndexOf("/"),
                    );
                    return currentPath.includes(subParent);
                  }

                  return false;
                });

              const showTooltip =
                isSidebarCollapsed && hoveredItem === item.label;

              return (
                <div
                  key={item.label || index}
                  style={{
                    marginBottom: "4px",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    setHoveredItem(item.label);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltipPosition({
                      top: rect.top + rect.height / 2,
                      left: rect.right + 12,
                    });
                  }}
                  onMouseLeave={() => {
                    setHoveredItem(null);
                    setTooltipPosition(null);
                  }}
                >
                  {/* Tooltip for collapsed state - rendered with fixed positioning */}
                  {showTooltip && tooltipPosition && (
                    <div
                      style={{
                        position: "fixed",
                        left: `${tooltipPosition.left}px`,
                        top: `${tooltipPosition.top}px`,
                        transform: "translateY(-50%)",
                        backgroundColor: "#333",
                        color: "#fff",
                        padding: "8px 14px",
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontWeight: "500",
                        whiteSpace: "nowrap",
                        zIndex: 99999,
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
                        pointerEvents: "none",
                      }}
                    >
                      {getLabel(item)}
                      {/* Tooltip arrow */}
                      <div
                        style={{
                          position: "absolute",
                          right: "100%",
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 0,
                          height: 0,
                          borderTop: "6px solid transparent",
                          borderBottom: "6px solid transparent",
                          borderRight: "6px solid #333",
                        }}
                      />
                    </div>
                  )}

                  {/* Main Menu Item */}
                  {hasSubItems ? (
                    <button
                      onClick={() => {
                        if (isSidebarCollapsed) {
                          setIsSidebarCollapsed(false);
                          setExpandedMenus((prev) =>
                            new Set(prev).add(item.label),
                          );
                        } else {
                          setExpandedMenus((prev) => {
                            const newSet = new Set(prev);
                            if (isExpanded) {
                              newSet.delete(item.label);
                            } else {
                              newSet.add(item.label);
                            }
                            return newSet;
                          });
                        }
                      }}
                      aria-expanded={isExpanded}
                      aria-controls={`submenu-${index}`}
                      aria-label={`${getLabel(item)}. ${hasSubItems ? (isExpanded ? "Expanded" : "Collapsed") : ""}`}
                      disabled={false}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: isSidebarCollapsed ? "0" : "12px",
                        padding: isSidebarCollapsed ? "10px" : "12px 16px",
                        borderRadius: "var(--radius-lg)",
                        backgroundColor:
                          isSubItemActive || isActive
                            ? "var(--primary-main)"
                            : "transparent",
                        color:
                          isSubItemActive || isActive
                            ? "var(--primary-on)"
                            : "var(--text-primary)",
                        textDecoration: "none",
                        fontSize: "16px",
                        fontWeight: "400",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                        cursor: "pointer",
                        userSelect: "none",
                        width: "100%",
                        border: "none",
                        textAlign: "left",
                        justifyContent: isSidebarCollapsed
                          ? "center"
                          : "flex-start",
                        boxShadow:
                          isSubItemActive || isActive
                            ? "0 1px 3px rgba(0, 0, 0, 0.12)"
                            : "none",
                      }}
                      onMouseOver={(e) => {
                        if (!isSubItemActive && !isActive) {
                          e.currentTarget.style.backgroundColor =
                            "var(--surface-variant)";
                          e.currentTarget.style.color = "var(--text-primary)";
                          e.currentTarget.style.boxShadow =
                            "0 1px 2px rgba(0, 0, 0, 0.08)";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!isSubItemActive && !isActive) {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "var(--text-primary)";
                          e.currentTarget.style.boxShadow = "none";
                        }
                      }}
                      onMouseDown={(e) => {
                        if (!isSubItemActive && !isActive) {
                          const primaryColor = getComputedStyle(
                            document.documentElement,
                          )
                            .getPropertyValue("--primary-main")
                            .trim();
                          e.currentTarget.style.backgroundColor =
                            primaryColor + "30";
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!isSubItemActive && !isActive) {
                          e.currentTarget.style.backgroundColor =
                            "var(--surface-variant)";
                        }
                      }}
                    >
                      <span
                        style={{
                          fontSize: "24px",
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                      {!isSidebarCollapsed && (
                        <>
                          <span
                            style={{
                              flex: 1,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: "1.5",
                            }}
                          >
                            {getLabel(item)}
                          </span>
                          <span
                            style={{
                              fontSize: "20px",
                              flexShrink: 0,
                              transform: isExpanded
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                              transition: "transform 0.2s ease-in-out",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            aria-hidden="true"
                          >
                            <MdExpandMore />
                          </span>
                        </>
                      )}
                    </button>
                  ) : (
                    <Link
                      to={item.path!}
                      aria-label={getLabel(item)}
                      aria-current={isActive ? "page" : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: isSidebarCollapsed ? "0" : "12px",
                        padding: isSidebarCollapsed ? "10px" : "12px 16px",
                        borderRadius: "var(--radius-lg)",
                        backgroundColor: isActive
                          ? "var(--primary-main)"
                          : "transparent",
                        color: isActive
                          ? "var(--primary-on)"
                          : "var(--text-primary)",
                        textDecoration: "none",
                        fontSize: "16px",
                        fontWeight: "400",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                        cursor: "pointer",
                        justifyContent: isSidebarCollapsed
                          ? "center"
                          : "flex-start",
                        boxShadow: isActive
                          ? "0 1px 3px rgba(0, 0, 0, 0.12)"
                          : "none",
                        lineHeight: "1.5",
                      }}
                      onMouseOver={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor =
                            "var(--surface-variant)";
                          e.currentTarget.style.color = "var(--text-primary)";
                          e.currentTarget.style.boxShadow =
                            "0 1px 2px rgba(0, 0, 0, 0.08)";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "var(--text-primary)";
                          e.currentTarget.style.boxShadow = "none";
                        }
                      }}
                      onMouseDown={(e) => {
                        if (!isActive) {
                          const primaryColor = getComputedStyle(
                            document.documentElement,
                          )
                            .getPropertyValue("--primary-main")
                            .trim();
                          e.currentTarget.style.backgroundColor =
                            primaryColor + "30";
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor =
                            "var(--surface-variant)";
                        }
                      }}
                    >
                      <span
                        style={{
                          fontSize: "24px",
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                      {!isSidebarCollapsed && (
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            lineHeight: "1.5",
                          }}
                        >
                          {getLabel(item)}
                        </span>
                      )}
                    </Link>
                  )}

                  {/* Sub Menu Items */}
                  {hasSubItems && !isSidebarCollapsed && (
                    <div
                      id={`submenu-${index}`}
                      role="group"
                      aria-label={`${getLabel(item)} submenu`}
                      style={{
                        maxHeight: isExpanded
                          ? `${item.subItems!.length * 44}px`
                          : "0px",
                        overflow: "hidden",
                        transition:
                          "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        opacity: isExpanded ? 1 : 0,
                        marginTop: isExpanded ? "8px" : "0px",
                        marginBottom: isExpanded ? "8px" : "0px",
                        marginLeft: "0px",
                        transform: isExpanded
                          ? "translateY(0)"
                          : "translateY(-10px)",
                      }}
                    >
                      {item.subItems!.map((subItem) => {
                        // Smart matching for sub-items
                        const isSubActive = subItem.path
                          ? (() => {
                              const currentPath = location.pathname;
                              const subPath = subItem.path;

                              // Exact match
                              if (currentPath === subPath) return true;

                              // For nested routes, check if path ends with the route
                              // Example: /audit/activity-logs should match regardless of prefix
                              if (
                                subPath.includes("/") &&
                                currentPath.endsWith(
                                  subPath.substring(subPath.lastIndexOf("/")),
                                )
                              ) {
                                const subParent = subPath.substring(
                                  0,
                                  subPath.lastIndexOf("/"),
                                );
                                return currentPath.includes(subParent);
                              }

                              return false;
                            })()
                          : false;

                        return (
                          <Link
                            key={subItem.path}
                            to={subItem.path!}
                            aria-label={getLabel(subItem)}
                            aria-current={isSubActive ? "page" : undefined}
                            onClick={(e) => {
                              // Prevent submenu from collapsing when clicking on a link
                              e.stopPropagation();
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "10px 16px 10px 40px",
                              marginBottom: "4px",
                              marginLeft: "0px",
                              borderRadius: "8px",
                              background: isSubActive
                                ? "linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)"
                                : "transparent",
                              color: isSubActive
                                ? "#667eea"
                                : "var(--text-primary)",
                              textDecoration: "none",
                              fontSize: "14px",
                              fontWeight: isSubActive ? "600" : "400",
                              lineHeight: "1.5",
                              transition:
                                "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                              cursor: "pointer",
                              borderLeft: isSubActive
                                ? "3px solid #667eea"
                                : "3px solid transparent",
                              boxShadow: isSubActive
                                ? "0 2px 8px rgba(102, 126, 234, 0.15)"
                                : "none",
                            }}
                            onMouseOver={(e) => {
                              if (!isSubActive) {
                                e.currentTarget.style.backgroundColor =
                                  "rgba(102, 126, 234, 0.05)";
                                e.currentTarget.style.color = "#667eea";
                                e.currentTarget.style.borderLeft =
                                  "3px solid rgba(102, 126, 234, 0.3)";
                                e.currentTarget.style.boxShadow =
                                  "0 1px 4px rgba(102, 126, 234, 0.1)";
                              }
                            }}
                            onMouseOut={(e) => {
                              if (!isSubActive) {
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                                e.currentTarget.style.color =
                                  "var(--text-primary)";
                                e.currentTarget.style.borderLeft =
                                  "3px solid transparent";
                                e.currentTarget.style.boxShadow = "none";
                              }
                            }}
                            onMouseDown={(e) => {
                              if (!isSubActive) {
                                const primaryColor = getComputedStyle(
                                  document.documentElement,
                                )
                                  .getPropertyValue("--primary-main")
                                  .trim();
                                e.currentTarget.style.backgroundColor =
                                  primaryColor + "20"; // Add 20% opacity
                              }
                            }}
                            onMouseUp={(e) => {
                              if (!isSubActive) {
                                e.currentTarget.style.backgroundColor =
                                  "var(--surface-variant)";
                              }
                            }}
                          >
                            <span
                              style={{
                                fontSize: "20px",
                                width: "20px",
                                height: "20px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                              aria-hidden="true"
                            >
                              {subItem.icon}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                lineHeight: "1.5",
                                minWidth: 0,
                              }}
                            >
                              {getLabel(subItem)}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Logout Button at Bottom */}
          <div
            style={{
              padding: isSidebarCollapsed ? "12px 4px" : "16px 12px",
              borderTop: "1px solid var(--border-light)",
              marginTop: "auto",
            }}
          >
            <button
              onClick={async () => {
                try {
                  // Call logout API to log the activity
                  const token = localStorage.getItem("authToken"); // Changed from 'token' to 'authToken'
                  console.log(
                    "Logging out with token:",
                    token ? "Token exists" : "No token found",
                  );

                  if (token) {
                    const response = await fetch(
                      `${API_CONFIG.API_URL}/auth/logout`,
                      {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${token}`,
                          "Content-Type": "application/json",
                        },
                      },
                    );
                    console.log("Logout API response:", response.status);
                  } else {
                    console.log("No token found for logout API call");
                  }
                } catch (error) {
                  console.error("Logout API error:", error);
                } finally {
                  // Clear ALL local storage - complete cleanup for fresh login
                  localStorage.removeItem("authToken");
                  localStorage.removeItem("userName");
                  localStorage.removeItem("userEmail");
                  localStorage.removeItem("userId");
                  localStorage.removeItem("userRole");
                  localStorage.removeItem("userRoleName");
                  localStorage.removeItem("user");
                  localStorage.removeItem("userPermissions");
                  localStorage.removeItem("projectContext");
                  localStorage.removeItem("projectBranding");
                  localStorage.removeItem("projectId");
                  localStorage.removeItem("selectedProject");
                  localStorage.removeItem("permissions"); // Clear cached permissions
                  localStorage.removeItem("moduleAccess"); // Legacy - can be removed after full migration
                  localStorage.removeItem("viewMode");
                  localStorage.removeItem("recentProjects");
                  localStorage.removeItem("favoriteProjects");

                  // Clear sessionStorage as well
                  sessionStorage.clear();

                  window.location.href = logoutRedirectPath || "/login";
                }
              }}
              className="btn btn-outline"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: isSidebarCollapsed ? "center" : "flex-start",
                gap: isSidebarCollapsed ? "0" : "12px",
                padding: isSidebarCollapsed ? "12px" : "10px 12px",
                fontSize: "12px",
                fontWeight: "400",
                textTransform: "none",
                color: "var(--text-secondary)",
                borderColor: "var(--border-default)",
              }}
              aria-label={getText("Logout", "लॉगआउट", "लॉगआउट")}
              title={
                isSidebarCollapsed ? getText("Logout", "लॉगआउट", "लॉगआउट") : ""
              }
            >
              <span
                style={{
                  fontSize: "24px",
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MdLogout />
              </span>
              {!isSidebarCollapsed && (
                <span>{getText("Logout", "लॉगआउट", "लॉगआउट")}</span>
              )}
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main
          id="main-content"
          role="main"
          aria-label={getText("Main content", "मुख्य सामग्री", "मुख्य सामग्री")}
          tabIndex={-1}
          style={{
            marginLeft: sidebarWidth,
            flex: 1,
            backgroundColor: "var(--background-secondary)",
            transition: "margin-left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Top Header Bar */}
          <header
            style={{
              height: "64px",
              backgroundColor: "var(--background-primary)",
              borderBottom: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "0 24px",
              gap: "16px",
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <ViewModeToggle />
            <HeaderProjectSwitcher />
          </header>

          {/* Main Content */}
          <NotificationPermissionBanner />
          <div style={{ flex: 1 }}>{children}</div>

          {/* Footer with Role Document */}
          {roleDocument && (
            <footer
              style={{
                backgroundColor: "var(--background-primary)",
                borderTop: "1px solid var(--border-light)",
                padding: "16px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                fontSize: "14px",
                color: "var(--text-secondary)",
              }}
            >
              <span>📄</span>
              <a
                href={roleDocument.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--primary-color)",
                  textDecoration: "underline",
                  fontWeight: 500,
                }}
              >
                {roleDocument.fileName}
              </a>
            </footer>
          )}
        </main>
      </div>
      <WhatsAppFloatingIcon
        projectId={projectContext?.projectId}
        isAuthenticated={true}
      />
    </>
  );
};

export default DashboardLayout;
