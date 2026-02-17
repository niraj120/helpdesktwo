import { useState, useEffect } from 'react';
import { UserIcon, UsersIcon, UserGroupIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../constants/permissions';

type ViewMode = 'self' | 'team' | 'hierarchy' | 'all';

interface ViewModeSelectorProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  disabled?: boolean;
}

/**
 * ViewModeSelector Component
 * 
 * Allows users to toggle between different dashboard view modes:
 * - Self: View own tickets only
 * - Team: View direct reports (level 1)
 * - Hierarchy: View full team hierarchy (multi-level)
 * - All: View all tickets globally
 * 
 * Buttons are shown/hidden based on user permissions.
 */
const ViewModeSelector: React.FC<ViewModeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { hasPermission } = usePermissions();
  const [availableModes, setAvailableModes] = useState<ViewMode[]>([]);

  useEffect(() => {
    // Determine which view modes user can access based on permissions
    const modes: ViewMode[] = [];

    // Self view - available to everyone (default)
    modes.push('self');

    const hasTeam = hasPermission(PERMISSIONS.DASHBOARD_VIEW_TEAM);
    const hasHierarchy = hasPermission(PERMISSIONS.DASHBOARD_VIEW_HIERARCHY);
    const hasAll = hasPermission(PERMISSIONS.DASHBOARD_VIEW_ALL);

    console.log('🎛️ ViewModeSelector permissions check:', {
      DASHBOARD_VIEW_TEAM: hasTeam,
      DASHBOARD_VIEW_HIERARCHY: hasHierarchy,
      DASHBOARD_VIEW_ALL: hasAll,
    });

    // Team view - requires DASHBOARD_VIEW_TEAM permission
    if (hasTeam) {
      modes.push('team');
    }

    // Hierarchy view - requires DASHBOARD_VIEW_HIERARCHY permission
    if (hasHierarchy) {
      modes.push('hierarchy');
    }

    // All view - requires DASHBOARD_VIEW_ALL permission
    if (hasAll) {
      modes.push('all');
    }

    console.log('🎛️ ViewModeSelector available modes:', modes);
    setAvailableModes(modes);

    // If current value not available, switch to first available mode
    if (!modes.includes(value) && modes.length > 0) {
      onChange(modes[0]);
    }
  }, [hasPermission, value, onChange]);

  console.log('🎛️ ViewModeSelector render - availableModes:', availableModes, 'length:', availableModes.length);
  
  // If only self mode available, don't show selector
  if (availableModes.length <= 1) {
    console.log('🎛️ ViewModeSelector HIDDEN - only', availableModes.length, 'mode(s) available');
    return null;
  }

  const getModeConfig = (mode: ViewMode) => {
    switch (mode) {
      case 'self':
        return {
          label: 'My Tickets',
          icon: UserIcon,
          tooltip: 'View your own tickets only',
          color: 'blue',
        };
      case 'team':
        return {
          label: 'Team View',
          icon: UsersIcon,
          tooltip: 'View tickets for you and your direct reports',
          color: 'green',
        };
      case 'hierarchy':
        return {
          label: 'Full Hierarchy',
          icon: UserGroupIcon,
          tooltip: 'View tickets for your entire team (all levels)',
          color: 'purple',
        };
      case 'all':
        return {
          label: 'All Tickets',
          icon: GlobeAltIcon,
          tooltip: 'View all tickets in the system',
          color: 'orange',
        };
    }
  };

  return (
    <div className="view-mode-selector">
      <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm p-1 border border-gray-200">
        {availableModes.map((mode) => {
          const config = getModeConfig(mode);
          const Icon = config.icon;
          const isActive = value === mode;

          return (
            <button
              key={mode}
              onClick={() => !disabled && onChange(mode)}
              disabled={disabled}
              title={config.tooltip}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm
                transition-all duration-200 ease-in-out
                ${
                  isActive
                    ? `bg-${config.color}-500 text-white shadow-md`
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <Icon className="h-5 w-5" />
              <span className="whitespace-nowrap">{config.label}</span>
              {isActive && (
                <span className="ml-1 h-2 w-2 rounded-full bg-white opacity-80" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ViewModeSelector;
