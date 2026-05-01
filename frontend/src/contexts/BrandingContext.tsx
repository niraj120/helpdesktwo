import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
  useCallback,
} from "react";
import axios from "axios";
import { useLocation } from "react-router-dom";
import { API_CONFIG } from "../config/constants";

interface ColorTheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

interface ProjectBranding {
  projectId?: string;
  name?: string;
  code?: string;
  projectName?: string;
  logo?: string | null;
  favicon?: string | null;
  colorTheme?: ColorTheme;
  browserTitle?: string;
  headerText?: string;
  branding?: {
    logo?: string | null;
    favicon?: string | null;
    colorTheme?: ColorTheme;
    browserTitle?: string;
    headerText?: string;
    logoLinkbackUrl?: string;
  };
}

interface BrandingContextType {
  branding: ProjectBranding | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType | undefined>(
  undefined,
);

// Cache to store branding data per project
const brandingCache = new Map<
  string,
  { data: ProjectBranding; timestamp: number }
>();
const CACHE_DURATION = 30 * 1000; // 30 seconds — short TTL so admin changes propagate quickly

interface BrandingProviderProps {
  children: ReactNode;
}

export const BrandingProvider: React.FC<BrandingProviderProps> = ({
  children,
}) => {
  const location = useLocation();
  const [branding, setBranding] = useState<ProjectBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract customUrlPath from URL pathname
  const customUrlPath = React.useMemo(() => {
    const path = location.pathname;
    console.log("🎨 Current pathname:", path);

    // Match pattern: /customUrlPath/portal/*
    const match = path.match(/^\/([^/]+)\/portal/);
    if (match) {
      console.log("🎨 Extracted customUrlPath:", match[1]);
      return match[1];
    }

    console.log("🎨 No customUrlPath found in path");
    return null;
  }, [location.pathname]);

  console.log("🎨 BrandingProvider rendered, customUrlPath:", customUrlPath);

  const fetchBranding = async () => {
    console.log("🎨 fetchBranding called with customUrlPath:", customUrlPath);
    if (!customUrlPath) {
      console.log("🎨 No customUrlPath, skipping branding fetch");
      setLoading(false);
      return;
    }

    // List of internal admin routes that should NOT trigger branding fetch
    const internalRoutes = [
      "login",
      "dashboard",
      "reports",
      "tickets",
      "projects",
      "users",
      "roles",
      "permissions",
      "master-data",
      "offline-module",
      "settings",
      "profile",
      "categories",
      "priorities",
      "statuses",
      "sla-policies",
      "approval-workflows",
      "feedback-surveys",
      "register",
      "forgot-password",
      "reset-password",
    ];

    // Skip branding fetch for internal routes
    if (internalRoutes.includes(customUrlPath)) {
      setLoading(false);
      return;
    }

    // Check cache first
    const cached = brandingCache.get(customUrlPath);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log("🎨 Using cached branding for:", customUrlPath);
      setBranding(cached.data);
      setLoading(false);
      return;
    }

    try {
      console.log("🎨 Fetching branding for:", customUrlPath);
      setLoading(true);
      setError(null);

      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`,
      );

      const brandingData = response.data.success
        ? response.data.data
        : response.data;

      // Cache the branding data
      brandingCache.set(customUrlPath, {
        data: brandingData,
        timestamp: Date.now(),
      });

      setBranding(brandingData);
    } catch (err: any) {
      console.error("Error fetching branding:", err);
      setError(err.message || "Failed to fetch branding");

      // Try fallback to project context
      try {
        const projectContextStr = localStorage.getItem("projectContext");
        if (projectContextStr) {
          const projectContext = JSON.parse(projectContextStr);
          const fallbackBranding: ProjectBranding = {
            name: projectContext.projectName || "Dashboard",
            code: projectContext.projectCode || "",
            projectId: projectContext.projectId,
            colorTheme: {
              primary: "#667eea",
              secondary: "#764ba2",
              accent: "#3b82f6",
              background: "#ffffff",
            },
          };
          setBranding(fallbackBranding);
        }
      } catch (fallbackError) {
        console.error("Fallback error:", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, [customUrlPath]);

  // Apply color theme to CSS variables when branding changes
  useEffect(() => {
    if (branding) {
      console.log("🎨 Applying branding:", branding);
      const colorTheme = branding.branding?.colorTheme || branding.colorTheme;
      console.log("🎨 Color theme:", colorTheme);
      if (colorTheme) {
        const root = document.documentElement;
        root.style.setProperty("--primary-main", colorTheme.primary);
        root.style.setProperty("--primary-dark", colorTheme.secondary);
        root.style.setProperty("--accent-main", colorTheme.accent);
        console.log("🎨 Applied colors to CSS variables");

        // Create lighter version of primary color
        const hexToRgb = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result
            ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16),
              }
            : null;
        };

        const rgb = hexToRgb(colorTheme.primary);
        if (rgb) {
          root.style.setProperty(
            "--primary-light",
            `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
          );
        }
      }

      // Update page title
      const browserTitle =
        branding.branding?.browserTitle ||
        branding.branding?.headerText ||
        branding.projectName ||
        branding.name ||
        "Helpdesk Portal";
      document.title = browserTitle;
      console.log("🎨 Updated page title to:", browserTitle);
    } else {
      console.log("🎨 No branding data available");
    }
  }, [branding]);

  // Memoize refetch callback to maintain stable reference
  // Always bypasses the cache so admin changes propagate immediately
  const memoizedRefetch = useCallback(async () => {
    if (customUrlPath) {
      brandingCache.delete(customUrlPath);
    }
    await fetchBranding();
  }, [customUrlPath, fetchBranding]);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({
      branding,
      loading,
      error,
      refetch: memoizedRefetch,
    }),
    [branding, loading, error, memoizedRefetch],
  );

  return (
    <BrandingContext.Provider value={contextValue}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
};

// Utility function to clear cache (useful for testing or manual refresh)
export const clearBrandingCache = () => {
  brandingCache.clear();
  console.log("🎨 Branding cache cleared");
};
