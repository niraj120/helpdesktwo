/**
 * useAdminProjects Hook
 * 
 * This hook is specifically for Super Admin pages that need to select from ALL projects.
 * 
 * Key differences from ProjectContext:
 * - ProjectContext: For project-specific logins (subdomains/URLs) - provides the single project
 * - useAdminProjects: For Super Admin - fetches ALL projects and lets admin select one
 * 
 * Use this hook in pages where Super Admin needs to select a project to manage.
 */

import { useState, useEffect, useCallback } from 'react';
import { API_CONFIG } from '../config/constants';
import { isSuperAdmin as checkIsSuperAdmin } from '../utils/permissionHelpers';

interface Project {
  _id: string;
  name: string;
  code: string;
  customUrlPath?: string;
  branding?: {
    logo?: string;
    colorTheme?: {
      primary?: string;
    };
    customUrlPath?: string;
  };
  status: string;
}

interface UseAdminProjectsResult {
  projects: Project[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  selectedProject: Project | undefined;
  isLoading: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook for Super Admin to fetch and select from all projects
 * Does NOT use ProjectContext - completely independent
 */
export const useAdminProjects = (): UseAdminProjectsResult => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = checkIsSuperAdmin();

  // Fetch ALL projects for Super Admin
  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = localStorage.getItem('authToken');
      if (!token) {
        setError('No authentication token');
        setProjects([]);
        return;
      }

      // Super Admin gets ALL projects
      // Regular users get their assigned projects
      const endpoint = isSuperAdmin 
        ? `${API_CONFIG.API_URL}/projects`
        : `${API_CONFIG.API_URL}/projects/my-projects`;

      console.log(`🔄 useAdminProjects: Fetching from ${endpoint}...`);

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Handle different response formats
        let projectsList: Project[] = [];
        
        if (data.success) {
          if (Array.isArray(data.data)) {
            // /projects returns { success: true, data: [...] }
            projectsList = data.data;
          } else if (data.data?.projects && Array.isArray(data.data.projects)) {
            // /projects/my-projects returns { success: true, data: { projects: [...] } }
            projectsList = data.data.projects;
          }
        }

        // Filter to active projects only
        const activeProjects = projectsList.filter((p: Project) => p.status === 'active');
        console.log(`✅ useAdminProjects: Fetched ${activeProjects.length} active projects`);
        setProjects(activeProjects);
      } else {
        console.error('❌ useAdminProjects: Failed to fetch projects, status:', response.status);
        setError('Failed to fetch projects');
        setProjects([]);
      }
    } catch (err) {
      console.error('❌ useAdminProjects: Error fetching projects:', err);
      setError('Error fetching projects');
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [isSuperAdmin]);

  // Fetch on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Get selected project object
  const selectedProject = projects.find(p => p._id === selectedProjectId);

  // Non-super-admin users should automatically land on their first assigned project.
  // Super Admin keeps manual selection behavior.
  useEffect(() => {
    if (!isSuperAdmin && !selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0]._id);
    }
  }, [isSuperAdmin, selectedProjectId, projects]);

  return {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    selectedProject,
    isLoading,
    error,
    isSuperAdmin,
    refetch: fetchProjects,
  };
};

export default useAdminProjects;
