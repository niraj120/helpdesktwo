import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { API_CONFIG } from "../config/constants";

interface Project {
  _id: string;
  name: string;
  code: string;
  customUrlPath?: string; // Root level for easy access
  branding?: {
    logo?: string;
    colorTheme?: {
      primary?: string;
    };
    customUrlPath?: string;
  };
  status: string;
}

interface ProjectContextType {
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  viewMode: "single" | "unified";
  setViewMode: (mode: "single" | "unified") => void;
  userProjects: Project[];
  setUserProjects: (projects: Project[]) => void;
  recentProjects: string[];
  addRecentProject: (projectId: string) => void;
  favoriteProjects: string[];
  toggleFavorite: (projectId: string) => void;
  switchProject: (projectId: string, options?: SwitchOptions) => Promise<void>;
  getCurrentProject: () => Project | null;
  isProjectAccessible: (projectId: string) => boolean;
  isLoading: boolean;
  isSwitching: boolean;
}

interface SwitchOptions {
  reload?: boolean; // Force page reload
  navigate?: boolean; // Navigate to project home
  preserveRoute?: boolean; // Keep current route path
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectContextProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    () => {
      const context = localStorage.getItem("projectContext");
      return context ? JSON.parse(context).projectId : null;
    },
  );

  const [viewMode, setViewMode] = useState<"single" | "unified">(() => {
    return (
      (localStorage.getItem("viewMode") as "single" | "unified") || "single"
    );
  });

  // Start with empty projects - will be fetched from API
  const [userProjects, setUserProjects] = useState<Project[]>([]);

  const [recentProjects, setRecentProjects] = useState<string[]>(() => {
    const recent = localStorage.getItem("recentProjects");
    return recent ? JSON.parse(recent) : [];
  });

  const [favoriteProjects, setFavoriteProjects] = useState<string[]>(() => {
    const favorites = localStorage.getItem("favoriteProjects");
    return favorites ? JSON.parse(favorites) : [];
  });

  // Initialize isLoading to true since we fetch projects on mount
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  const navigate = useNavigate();

  // Fetch fresh projects from API on mount and when auth token changes
  // Uses /projects/my-projects endpoint which doesn't require PROJECT_VIEW_ALL permission
  useEffect(() => {
    let isMounted = true; // Prevent state updates if unmounted

    const fetchUserProjects = async () => {
      try {
        const token = localStorage.getItem("authToken");

        if (!token) {
          if (isMounted) {
            setUserProjects([]); // Clear projects when no token
          }
          return;
        }

        setIsLoading(true);

        // Fetch user's assigned projects from dedicated endpoint
        const response = await fetch(
          `${API_CONFIG.API_URL}/projects/my-projects`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (response.ok) {
          const data = await response.json();

          if (data.success && data.data?.projects && isMounted) {
            const projects = data.data.projects.filter(
              (p: Project) => p.status === "active",
            );

            setUserProjects(projects);

            // Check if user is Super Admin - Super Admins should NOT have a project auto-selected
            const userRole = localStorage.getItem("userRole");
            const isSuperAdmin =
              userRole === "SUPER_ADMIN" || userRole === "Super Admin";

            // For Super Admin: use unified mode, no project auto-selection
            // For other users: auto-select first project if none selected
            if (isSuperAdmin) {
              // Don't auto-select a project for Super Admin
              // They should see all data across all projects by default
              if (!localStorage.getItem("viewMode")) {
                setViewMode("unified");
                localStorage.setItem("viewMode", "unified");
              }
            } else if (projects.length > 0 && !currentProjectId) {
              const firstProject = projects[0];
              setCurrentProjectId(firstProject._id);
            }
          } else {
            if (isMounted) {
              setUserProjects([]);
            }
          }
        } else {
          console.error(
            "❌ ProjectContext: API request failed with status:",
            response.status,
          );
          if (isMounted) {
            setUserProjects([]);
          }
        }
      } catch (error) {
        console.error(
          "❌ ProjectContext: Error fetching user projects:",
          error,
        );
        if (isMounted) {
          setUserProjects([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchUserProjects();

    return () => {
      isMounted = false;
    };
  }, []); // Run once on mount

  // Listen for login events and refetch projects
  useEffect(() => {
    const handleAuthChange = () => {
      const token = localStorage.getItem("authToken");
      if (token) {
        // Token added/changed - refetch projects
        fetchProjectsAfterLogin();
      } else {
        // Token removed - clear projects
        setUserProjects([]);
        setCurrentProjectId(null);
      }
    };

    const fetchProjectsAfterLogin = async () => {
      try {
        const token = localStorage.getItem("authToken");
        if (!token) return;

        setIsLoading(true);

        const response = await fetch(
          `${API_CONFIG.API_URL}/projects/my-projects`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.projects) {
            const projects = data.data.projects.filter(
              (p: Project) => p.status === "active",
            );
            setUserProjects(projects);

            // Auto-select first project if none selected
            if (projects.length > 0 && !currentProjectId) {
              setCurrentProjectId(projects[0]._id);
            }
          }
        }
      } catch (error) {
        console.error(
          "❌ ProjectContext: Error fetching projects after login:",
          error,
        );
      } finally {
        setIsLoading(false);
      }
    };

    // Listen for custom login event
    window.addEventListener("userLoggedIn", handleAuthChange);

    return () => {
      window.removeEventListener("userLoggedIn", handleAuthChange);
    };
  }, [currentProjectId]);

  // Persist viewMode to localStorage
  useEffect(() => {
    localStorage.setItem("viewMode", viewMode);
  }, [viewMode]);

  // Persist currentProjectId to localStorage
  useEffect(() => {
    if (currentProjectId) {
      const project = userProjects.find((p) => p._id === currentProjectId);
      if (project) {
        const customUrlPath =
          project.branding?.customUrlPath || project.code.toLowerCase();
        localStorage.setItem(
          "projectContext",
          JSON.stringify({
            projectId: currentProjectId,
            customUrlPath: customUrlPath,
          }),
        );
      }
    }
  }, [currentProjectId, userProjects]);

  // Persist recent projects to localStorage
  useEffect(() => {
    localStorage.setItem("recentProjects", JSON.stringify(recentProjects));
  }, [recentProjects]);

  // Persist favorite projects to localStorage
  useEffect(() => {
    localStorage.setItem("favoriteProjects", JSON.stringify(favoriteProjects));
  }, [favoriteProjects]);

  const addRecentProject = useCallback((projectId: string) => {
    setRecentProjects((prev) => {
      const newRecent = [
        projectId,
        ...prev.filter((id) => id !== projectId),
      ].slice(0, 5); // Keep last 5
      return newRecent;
    });
  }, []);

  const toggleFavorite = useCallback((projectId: string) => {
    setFavoriteProjects((prev) => {
      return prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId];
    });
  }, []);

  /**
   * Switch to a different project with smooth transitions
   * Supports multiple strategies for switching
   */
  const switchProject = useCallback(
    async (projectId: string, options: SwitchOptions = {}): Promise<void> => {
      const {
        reload = false,
        navigate = false,
        preserveRoute = false,
      } = options;

      try {
        setIsSwitching(true);

        // Find target project
        const targetProject = userProjects.find((p) => p._id === projectId);
        if (!targetProject) {
          console.error("Project not found:", projectId);
          return;
        }

        // Update state
        setCurrentProjectId(projectId);
        setViewMode("single");
        addRecentProject(projectId);

        // Get custom URL path
        const customUrlPath =
          targetProject.branding?.customUrlPath ||
          targetProject.code.toLowerCase();

        // Dispatch custom event for other components
        window.dispatchEvent(
          new CustomEvent("projectSwitched", {
            detail: {
              projectId,
              project: targetProject,
            },
          }),
        );

        // Wait a bit for state to settle
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Handle navigation/reload
        if (reload) {
          // Full page reload to refresh all context
          window.location.href = `/${customUrlPath}/portal/dashboard`;
        } else if (navigate) {
          // Use React Router navigation (smoother)
          const currentPath = window.location.pathname;
          const pathParts = currentPath.split("/").filter(Boolean);

          if (preserveRoute && pathParts.length > 2) {
            // Preserve current route (e.g., /sac/portal/tickets → /nirf/portal/tickets)
            const route = pathParts.slice(2).join("/"); // Get everything after /portal/
            window.location.href = `/${customUrlPath}/portal/${route}`;
          } else {
            // Navigate to project home
            window.location.href = `/${customUrlPath}/portal/dashboard`;
          }
        }

        console.log(
          `✅ [PROJECT_SWITCH] Switched to project: ${targetProject.name}`,
        );
      } catch (error) {
        console.error("❌ [PROJECT_SWITCH] Error switching project:", error);
        throw error;
      } finally {
        setIsSwitching(false);
      }
    },
    [userProjects, addRecentProject],
  );

  const getCurrentProject = useCallback((): Project | null => {
    return userProjects.find((p) => p._id === currentProjectId) || null;
  }, [userProjects, currentProjectId]);

  const isProjectAccessible = useCallback(
    (projectId: string): boolean => {
      return userProjects.some((p) => p._id === projectId);
    },
    [userProjects],
  );

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({
      currentProjectId,
      setCurrentProjectId,
      viewMode,
      setViewMode,
      userProjects,
      setUserProjects,
      recentProjects,
      addRecentProject,
      favoriteProjects,
      toggleFavorite,
      switchProject,
      getCurrentProject,
      isProjectAccessible,
      isLoading,
      isSwitching,
    }),
    [
      currentProjectId,
      viewMode,
      userProjects,
      recentProjects,
      favoriteProjects,
      isLoading,
      isSwitching,
      addRecentProject,
      toggleFavorite,
      switchProject,
      getCurrentProject,
      isProjectAccessible,
    ],
  );

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error(
      "useProjectContext must be used within ProjectContextProvider",
    );
  }
  return context;
};
