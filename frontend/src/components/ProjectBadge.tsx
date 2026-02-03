import React from 'react';
import { useProjectContext } from '../contexts/ProjectContext';

/**
 * ProjectBadge Component
 * 
 * Visual badge for project identification in unified view mode.
 * Shows project name/initials with branded color.
 * 
 * Use Cases:
 * - Ticket list items (unified view)
 * - Search results
 * - Notifications
 * - Breadcrumbs
 * - Activity logs
 * 
 * Features:
 * - Uses project branding colors
 * - Shows full name or initials (configurable)
 * - Responsive sizing (small, medium, large)
 * - Optional icon/logo
 * - Hover tooltip with full project name
 */

export interface ProjectBadgeProps {
  /** Project ID to display badge for */
  projectId: string;
  
  /** Badge size variant */
  size?: 'small' | 'medium' | 'large';
  
  /** Show full name or initials only */
  variant?: 'full' | 'initials';
  
  /** Show project logo icon (if available) */
  showLogo?: boolean;
  
  /** Custom click handler */
  onClick?: () => void;
  
  /** Make badge interactive (shows pointer cursor) */
  interactive?: boolean;
  
  /** Additional CSS class name */
  className?: string;
  
  /** Additional inline styles */
  style?: React.CSSProperties;
}

/**
 * Generate initials from project name
 * Examples:
 * - "SAC Helpdesk" → "SH"
 * - "NIRF Portal" → "NP"
 * - "Student" → "ST"
 */
const getProjectInitials = (name: string): string => {
  if (!name) return '??';
  
  const words = name.trim().split(/\s+/);
  
  if (words.length >= 2) {
    // Multiple words: take first letter of first two words
    return (words[0][0] + words[1][0]).toUpperCase();
  } else {
    // Single word: take first two letters
    return name.substring(0, 2).toUpperCase();
  }
};

/**
 * Generate a consistent color from project ID
 * Used as fallback when project has no branding color
 */
const getColorFromId = (projectId: string): string => {
  const colors = [
    '#667eea', // Purple
    '#3b82f6', // Blue
    '#10b981', // Green
    '#f59e0b', // Orange
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
  ];
  
  // Simple hash function to get consistent color
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export const ProjectBadge: React.FC<ProjectBadgeProps> = ({
  projectId,
  size = 'medium',
  variant = 'initials',
  showLogo = false,
  onClick,
  interactive = false,
  className = '',
  style = {},
}) => {
  const { userProjects } = useProjectContext();
  
  // Find project by ID
  const project = userProjects.find(p => p._id === projectId);
  
  // If project not found, show fallback
  if (!project) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          backgroundColor: '#e5e7eb',
          color: '#6b7280',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '500',
          ...style,
        }}
        className={className}
        title="Unknown project"
      >
        ??
      </span>
    );
  }

  // Get display text
  const displayText = variant === 'full' 
    ? project.name 
    : getProjectInitials(project.name);

  // Get project color
  const projectColor = project.branding?.colorTheme?.primary || getColorFromId(projectId);
  
  // Calculate text color (white or black based on background brightness)
  const getTextColor = (bgColor: string): string => {
    // Remove # if present
    const color = bgColor.replace('#', '');
    
    // Convert to RGB
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    
    // Calculate brightness (HSP color model)
    const brightness = Math.sqrt(
      0.299 * (r * r) +
      0.587 * (g * g) +
      0.114 * (b * b)
    );
    
    return brightness > 127.5 ? '#000000' : '#ffffff';
  };

  const textColor = getTextColor(projectColor);

  // Size configurations
  const sizeConfig = {
    small: {
      padding: '2px 6px',
      fontSize: '10px',
      iconSize: '12px',
      borderRadius: '10px',
    },
    medium: {
      padding: '3px 8px',
      fontSize: '11px',
      iconSize: '14px',
      borderRadius: '12px',
    },
    large: {
      padding: '4px 10px',
      fontSize: '12px',
      iconSize: '16px',
      borderRadius: '14px',
    },
  };

  const config = sizeConfig[size];

  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: showLogo ? '4px' : '0',
        padding: config.padding,
        backgroundColor: projectColor,
        color: textColor,
        borderRadius: config.borderRadius,
        fontSize: config.fontSize,
        fontWeight: '600',
        cursor: interactive || onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
      className={className}
      title={project.name}
      onMouseEnter={(e) => {
        if (interactive || onClick) {
          e.currentTarget.style.opacity = '0.8';
          e.currentTarget.style.transform = 'scale(1.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (interactive || onClick) {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.transform = 'scale(1)';
        }
      }}
    >
      {/* Project Logo (if available and requested) */}
      {showLogo && project.branding?.logo && (
        <img
          src={project.branding.logo}
          alt=""
          loading="lazy"
          style={{
            width: config.iconSize,
            height: config.iconSize,
            borderRadius: '50%',
            objectFit: 'cover',
          }}
          aria-hidden="true"
        />
      )}
      
      {/* Project Name/Initials */}
      <span>{displayText}</span>
    </span>
  );
};

/**
 * ProjectBadgeList Component
 * 
 * Display multiple project badges in a row.
 * Useful for showing items that belong to multiple projects.
 */
export interface ProjectBadgeListProps {
  /** Array of project IDs */
  projectIds: string[];
  
  /** Maximum number of badges to show before "+N more" */
  maxVisible?: number;
  
  /** Badge size */
  size?: 'small' | 'medium' | 'large';
  
  /** Badge variant */
  variant?: 'full' | 'initials';
  
  /** Show project logos */
  showLogos?: boolean;
}

export const ProjectBadgeList: React.FC<ProjectBadgeListProps> = ({
  projectIds,
  maxVisible = 3,
  size = 'small',
  variant = 'initials',
  showLogos = false,
}) => {
  if (!projectIds || projectIds.length === 0) {
    return null;
  }

  const visibleIds = projectIds.slice(0, maxVisible);
  const remainingCount = projectIds.length - maxVisible;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap',
      }}
    >
      {visibleIds.map((projectId) => (
        <ProjectBadge
          key={projectId}
          projectId={projectId}
          size={size}
          variant={variant}
          showLogo={showLogos}
        />
      ))}
      
      {remainingCount > 0 && (
        <span
          style={{
            fontSize: size === 'small' ? '10px' : size === 'medium' ? '11px' : '12px',
            color: 'var(--text-secondary, #6b7280)',
            fontWeight: '500',
          }}
          title={`${remainingCount} more project${remainingCount !== 1 ? 's' : ''}`}
        >
          +{remainingCount}
        </span>
      )}
    </div>
  );
};

export default ProjectBadge;
