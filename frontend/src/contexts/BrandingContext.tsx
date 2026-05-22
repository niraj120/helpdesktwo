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
// In-flight request deduplication — prevents N concurrent calls for the same path
const brandingInflight = new Map<string, Promise<ProjectBranding>>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
    // Match pattern: /customUrlPath/portal/* or /customUrlPath/student/*
    const match = path.match(/^\/([^/]+)\/(portal|student)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const fetchBranding = useCallback(async () => {
    if (!customUrlPath) {
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
    if (internalRoutes.includes(customUrlPath)) {
      setLoading(false);
      return;
    }

    // Check memory cache first (5-minute TTL)
    const cached = brandingCache.get(customUrlPath);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setBranding(cached.data);
      setLoading(false);
      return;
    }

    // In-flight deduplication: if a request is already in progress for this path,
    // wait for it instead of firing a duplicate request.
    let fetchPromise = brandingInflight.get(customUrlPath);
    if (!fetchPromise) {
      fetchPromise = axios
        .get(`${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`)
        .then((response) => {
          const data = response.data.success
            ? response.data.data
            : response.data;
          brandingCache.set(customUrlPath, { data, timestamp: Date.now() });
          brandingInflight.delete(customUrlPath);
          return data as ProjectBranding;
        })
        .catch((err) => {
          brandingInflight.delete(customUrlPath);
          throw err;
        });
      brandingInflight.set(customUrlPath, fetchPromise);
    }

    try {
      setLoading(true);
      setError(null);
      const brandingData = await fetchPromise;
      setBranding(brandingData);
    } catch (err: any) {
      setError(err.message || "Failed to fetch branding");
      // Fallback to projectContext in localStorage
      try {
        const projectContextStr = localStorage.getItem("projectContext");
        if (projectContextStr) {
          const projectContext = JSON.parse(projectContextStr);
          setBranding({
            name: projectContext.projectName || "Dashboard",
            code: projectContext.projectCode || "",
            projectId: projectContext.projectId,
          });
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [customUrlPath]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Apply color theme, page title, and favicon when branding data changes
  useEffect(() => {
    if (!branding) return;

    const colorTheme = branding.branding?.colorTheme || branding.colorTheme;
    if (colorTheme) {
      const root = document.documentElement;
      root.style.setProperty("--primary-main", colorTheme.primary);
      root.style.setProperty("--primary-dark", colorTheme.secondary);
      root.style.setProperty("--accent-main", colorTheme.accent);

      // Create a lighter version of the primary color for hover states etc.
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

    // Apply favicon
    const faviconUrl = branding.branding?.favicon || branding.favicon;
    if (faviconUrl) {
      let link = document.querySelector(
        "link[rel~='icon']",
      ) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
    }
  }, [branding]);

  // Memoize refetch callback — always bypasses cache so admin changes propagate immediately
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
};
