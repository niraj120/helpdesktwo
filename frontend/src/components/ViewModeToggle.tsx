import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { MdViewModule, MdViewDay } from 'react-icons/md';
import { useProjectContext } from '../contexts/ProjectContext';

/**
 * ViewModeToggle Component
 * 
 * Toggle switch between Single Project and Unified (All Projects) view modes.
 * Used in the header near the project switcher.
 * 
 * Features:
 * - Visual toggle with icons (Single/Unified)
 * - Updates viewMode in ProjectContext
 * - Navigates to appropriate URL on mode change
 * - Multi-language support (EN/HI/MR)
 * - Smooth animations
 * - Accessible (ARIA labels, keyboard navigation)
 */

export const ViewModeToggle: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { viewMode, setViewMode, userProjects, currentProjectId } = useProjectContext();

  // Don't show toggle if user has only one project
  if (!userProjects || userProjects.length <= 1) {
    return null;
  }

  const isSingleMode = viewMode === 'single';
  const isUnifiedMode = viewMode === 'unified';

  // Get current route name (dashboard, my-tickets, etc.)
  const getCurrentRouteName = () => {
    const path = location.pathname;
    // Extract route name from path like /hubblehox/portal/dashboard → dashboard
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'dashboard';
  };

  const handleSingleProjectMode = () => {
    if (isSingleMode) return;
    
    setViewMode('single');
    
    // Get current project from context or localStorage
    const projectContext = localStorage.getItem('projectContext');
    let customUrlPath = '';
    
    if (currentProjectId) {
      const project = userProjects.find(p => p._id === currentProjectId);
      // Check root level first, then branding, then code as fallback
      customUrlPath = project?.customUrlPath || project?.branding?.customUrlPath || project?.code?.toLowerCase() || '';
    } else if (projectContext) {
      const ctx = JSON.parse(projectContext);
      customUrlPath = ctx.customUrlPath || '';
    }
    
    // Navigate to project-specific URL
    if (customUrlPath) {
      const routeName = getCurrentRouteName();
      navigate(`/${customUrlPath}/portal/${routeName}`);
    }
    
    // Trigger custom event for other components to react
    window.dispatchEvent(new CustomEvent('viewModeChanged', { 
      detail: { viewMode: 'single' } 
    }));
  };

  const handleAllProjectsMode = () => {
    if (isUnifiedMode) return;
    
    setViewMode('unified');
    
    // Navigate to all-projects dashboard URL
    const routeName = getCurrentRouteName();
    
    // Map route names to their all-projects equivalents
    const routeMap: Record<string, string> = {
      'dashboard': '/dashboard',
      'my-tickets': '/my-tickets',
      'my-queries': '/my-tickets',
      'assign-tickets': '/assign-tickets',
      'assign-queries': '/assign-tickets',
      'users': '/users',
      'user-management': '/users',
    };
    
    const allProjectsRoute = routeMap[routeName] || '/dashboard';
    navigate(allProjectsRoute);
    
    // Trigger custom event for other components to react
    window.dispatchEvent(new CustomEvent('viewModeChanged', { 
      detail: { viewMode: 'unified' } 
    }));
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px',
        backgroundColor: 'var(--background-secondary, #f3f4f6)',
        borderRadius: '8px',
        border: '1px solid var(--border-light, #e5e7eb)',
      }}
      role="group"
      aria-label={t('viewMode.label', 'View mode')}
    >
      {/* Single Project View Button */}
      <button
        onClick={handleSingleProjectMode}
        disabled={isSingleMode}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          backgroundColor: isSingleMode 
            ? 'var(--background-primary, #ffffff)' 
            : 'transparent',
          color: isSingleMode 
            ? 'var(--primary-color, #667eea)' 
            : 'var(--text-secondary, #6b7280)',
          border: 'none',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: isSingleMode ? '600' : '400',
          cursor: isSingleMode ? 'default' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isSingleMode 
            ? '0 1px 3px rgba(0, 0, 0, 0.1)' 
            : 'none',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.outline = '2px solid var(--primary-color, #667eea)';
          e.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={(e) => {
          e.currentTarget.style.outline = 'none';
        }}
        onMouseEnter={(e) => {
          if (!isSingleMode) {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSingleMode) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
        aria-label={t('viewMode.singleProject', 'Single project view')}
        aria-pressed={isSingleMode}
      >
        <MdViewDay 
          style={{ 
            fontSize: '18px',
            flexShrink: 0
          }} 
          aria-hidden="true"
        />
        <span style={{ whiteSpace: 'nowrap' }}>
          {t('viewMode.single', 'Single Project')}
        </span>
      </button>

      {/* Unified View Button */}
      <button
        onClick={handleAllProjectsMode}
        disabled={isUnifiedMode}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          backgroundColor: isUnifiedMode 
            ? 'var(--background-primary, #ffffff)' 
            : 'transparent',
          color: isUnifiedMode 
            ? 'var(--primary-color, #667eea)' 
            : 'var(--text-secondary, #6b7280)',
          border: 'none',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: isUnifiedMode ? '600' : '400',
          cursor: isUnifiedMode ? 'default' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isUnifiedMode 
            ? '0 1px 3px rgba(0, 0, 0, 0.1)' 
            : 'none',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.outline = '2px solid var(--primary-color, #667eea)';
          e.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={(e) => {
          e.currentTarget.style.outline = 'none';
        }}
        onMouseEnter={(e) => {
          if (!isUnifiedMode) {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isUnifiedMode) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
        aria-label={t('viewMode.allProjects', 'All projects view')}
        aria-pressed={isUnifiedMode}
      >
        <MdViewModule 
          style={{ 
            fontSize: '18px',
            flexShrink: 0
          }} 
          aria-hidden="true"
        />
        <span style={{ whiteSpace: 'nowrap' }}>
          {t('viewMode.unified', 'All Projects')}
        </span>
      </button>
    </div>
  );
};

export default ViewModeToggle;
