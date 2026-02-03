import React, { useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useProjectContext } from '../contexts/ProjectContext';

/**
 * URL Routing Strategy for Multi-Tenant
 * 
 * Implements Option A: Project in Path
 * - /projects/{projectSlug}/dashboard
 * - /projects/{projectSlug}/tickets
 * - /unified/dashboard
 * - /unified/tickets
 * 
 * Benefits:
 * - Better SEO
 * - Clear context in URL
 * - Bookmarkable project views
 * - Browser history works intuitively
 */

/**
 * ProjectRouteWrapper Component
 * 
 * Wraps routes to handle project context from URL
 * Syncs URL with ProjectContext state
 */
export const ProjectRouteWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    currentProjectId, 
    viewMode, 
    userProjects, 
    switchProject, 
    setViewMode
  } = useProjectContext();

  useEffect(() => {
    // Handle unified view
    if (location.pathname.startsWith('/unified')) {
      if (viewMode !== 'unified') {
        setViewMode('unified');
      }
      return;
    }

    // Check if URL has project slug
    if (projectSlug) {
      // Find project by slug (or code)
      const project = userProjects.find(
        p => p.code?.toLowerCase() === projectSlug.toLowerCase() ||
             p.name?.toLowerCase().replace(/\s+/g, '-') === projectSlug.toLowerCase()
      );

      if (project) {
        // Switch to this project if not already selected
        if (currentProjectId !== project._id) {
          switchProject(project._id, {
            reload: false,
            navigate: false
          });
        }
      } else {
        // Invalid project slug - redirect to unified view
        console.warn(`Invalid project slug: ${projectSlug}`);
        navigate(location.pathname.replace(`/projects/${projectSlug}`, '/unified'), { replace: true });
      }
    }
  }, [projectSlug, location.pathname, currentProjectId, viewMode, userProjects]);

  return <>{children}</>;
};

/**
 * Hook to get project-aware URLs
 * 
 * Usage:
 * const { getUrl } = useProjectUrls();
 * const ticketsUrl = getUrl('/tickets'); // Returns /projects/sac/tickets or /unified/tickets
 */
export const useProjectUrls = () => {
  const { viewMode, currentProjectId, userProjects } = useProjectContext();

  const getProjectSlug = (projectId: string): string => {
    const project = userProjects.find(p => p._id === projectId);
    return project?.code?.toLowerCase() || project?._id || '';
  };

  const getUrl = (path: string): string => {
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;

    if (viewMode === 'unified') {
      return `/unified/${cleanPath}`;
    } else if (currentProjectId) {
      const slug = getProjectSlug(currentProjectId);
      return `/projects/${slug}/${cleanPath}`;
    }

    return `/${cleanPath}`;
  };

  const getDashboardUrl = () => getUrl('dashboard');
  const getTicketsUrl = () => getUrl('tickets');
  const getKnowledgeBaseUrl = () => getUrl('knowledge-base');
  const getSettingsUrl = () => getUrl('settings');

  return {
    getUrl,
    getDashboardUrl,
    getTicketsUrl,
    getKnowledgeBaseUrl,
    getSettingsUrl
  };
};

/**
 * ProjectLink Component
 * 
 * Smart link that automatically uses correct URL format
 * 
 * Usage:
 * <ProjectLink to="/tickets">View Tickets</ProjectLink>
 */
interface ProjectLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const ProjectLink: React.FC<ProjectLinkProps> = ({ 
  to, 
  children, 
  className, 
  style,
  onClick 
}) => {
  const { getUrl } = useProjectUrls();
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onClick) onClick();
    navigate(getUrl(to));
  };

  return (
    <a 
      href={getUrl(to)} 
      onClick={handleClick}
      className={className}
      style={style}
    >
      {children}
    </a>
  );
};

/**
 * Route configuration helper
 * 
 * Returns routes array for React Router
 */
export const getProjectRoutes = () => {
  return [
    // Unified routes
    {
      path: '/unified/dashboard',
      element: <div>Unified Dashboard</div>
    },
    {
      path: '/unified/tickets',
      element: <div>Unified Tickets</div>
    },
    {
      path: '/unified/knowledge-base',
      element: <div>Unified Knowledge Base Selector</div>
    },

    // Project-specific routes
    {
      path: '/projects/:projectSlug/dashboard',
      element: <div>Project Dashboard</div>
    },
    {
      path: '/projects/:projectSlug/tickets',
      element: <div>Project Tickets</div>
    },
    {
      path: '/projects/:projectSlug/tickets/:ticketId',
      element: <div>Ticket Detail</div>
    },
    {
      path: '/projects/:projectSlug/knowledge-base',
      element: <div>Project Knowledge Base</div>
    },
    {
      path: '/projects/:projectSlug/settings',
      element: <div>Project Settings</div>
    }
  ];
};

/**
 * URL Sync Hook
 * 
 * Keeps URL in sync with ProjectContext
 * Updates URL when project/view mode changes
 */
export const useUrlSync = () => {
  const { viewMode, currentProjectId, userProjects } = useProjectContext();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Get current path without project prefix
    let currentPath = location.pathname;
    
    // Remove /unified or /projects/{slug} prefix
    if (currentPath.startsWith('/unified/')) {
      currentPath = currentPath.replace('/unified', '');
    } else if (currentPath.startsWith('/projects/')) {
      const parts = currentPath.split('/');
      if (parts.length > 3) {
        currentPath = '/' + parts.slice(3).join('/');
      }
    }

    // Build new URL based on current context
    let newPath = '';
    if (viewMode === 'unified') {
      newPath = `/unified${currentPath}`;
    } else if (currentProjectId) {
      const project = userProjects.find(p => p._id === currentProjectId);
      const slug = project?.code?.toLowerCase() || currentProjectId;
      newPath = `/projects/${slug}${currentPath}`;
    } else {
      newPath = currentPath;
    }

    // Only navigate if URL needs to change
    if (newPath !== location.pathname && newPath !== '') {
      navigate(newPath, { replace: true });
    }
  }, [viewMode, currentProjectId]);
};

export default ProjectRouteWrapper;
