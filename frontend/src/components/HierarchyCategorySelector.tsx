import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import API_URL from "../config/api";

/**
 * Interface for hierarchy level configuration
 */
export interface HierarchyLevel {
  levelNumber: number;
  displayName: string;
  isMandatory: boolean;
  isActive: boolean;
}

/**
 * Interface for hierarchy configuration
 */
export interface HierarchyConfig {
  projectId: string;
  levelCount: number;
  levels: HierarchyLevel[];
  visibilitySettings: {
    showInOnlineForm: number[];
    showInOfflineForm: number[];
    showInTicketDisplay: number[];
    showInFilters: number[];
  };
  priorityFromLevel: number; // 0 = manual, 1-4 = use category's priority from that level
}

/**
 * Interface for a category item
 */
export interface CategoryItem {
  _id: string;
  name: string;
  code: number;
  level: number;
  parentId?: string;
  path?: string;
  isActive: boolean;
  defaultPriority?: string;
  children?: CategoryItem[];
}

/**
 * Interface for selected hierarchy values
 */
export interface CategoryHierarchyValue {
  level1?: string;
  level2?: string;
  level3?: string;
  level4?: string;
  /** Human-readable names for each level — used by conditionEngine so conditions
   * can be written as "Name change" instead of a MongoDB ObjectId. */
  level1Name?: string;
  level2Name?: string;
  level3Name?: string;
  level4Name?: string;
  displayPath?: string;
  autoAssignedPriority?: string; // Priority auto-assigned from selected category
}

/**
 * Props for HierarchyCategorySelector
 */
interface HierarchyCategorySelectorProps {
  projectId: string;
  value?: CategoryHierarchyValue;
  onChange: (value: CategoryHierarchyValue) => void;
  onPriorityChange?: (priority: string | undefined) => void; // Callback for auto-assigned priority
  mode?: "online" | "offline" | "display" | "filter"; // Which visibility setting to use
  disabled?: boolean;
  showValidation?: boolean;
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
  compact?: boolean; // Use compact layout (horizontal)
}

/**
 * HierarchyCategorySelector - Cascading dropdown component for hierarchical categories
 * Automatically adapts to the project's configured hierarchy levels (1-4 levels)
 */
const HierarchyCategorySelector: React.FC<HierarchyCategorySelectorProps> = ({
  projectId,
  value = {},
  onChange,
  onPriorityChange,
  mode = "online",
  disabled = false,
  showValidation = false,
  className = "",
  labelClassName = "",
  selectClassName = "",
  compact = false,
}) => {
  // State
  const [config, setConfig] = useState<HierarchyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Categories for each level
  const [level1Options, setLevel1Options] = useState<CategoryItem[]>([]);
  const [level2Options, setLevel2Options] = useState<CategoryItem[]>([]);
  const [level3Options, setLevel3Options] = useState<CategoryItem[]>([]);
  const [level4Options, setLevel4Options] = useState<CategoryItem[]>([]);

  // Loading states for each level
  const [loadingLevel, setLoadingLevel] = useState<number | null>(null);

  /**
   * Fetch hierarchy configuration for the project
   */
  const fetchConfig = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      const response = await axios.get(
        `${API_URL}/hierarchy-config/${projectId}`,
      );

      if (response.data.success) {
        setConfig(response.data.data);
      } else {
        // Use default single-level config
        setConfig({
          projectId,
          levelCount: 1,
          levels: [
            {
              levelNumber: 1,
              displayName: "Category",
              isMandatory: true,
              isActive: true,
            },
          ],
          visibilitySettings: {
            showInOnlineForm: [1],
            showInOfflineForm: [1],
            showInTicketDisplay: [1],
            showInFilters: [1],
          },
          priorityFromLevel: 0, // Default: manual priority selection
        });
      }
      setError(null);
    } catch (err: any) {
      console.error("Error fetching hierarchy config:", err);
      setError("Failed to load category configuration");
      // Use default config on error
      setConfig({
        projectId,
        levelCount: 1,
        levels: [
          {
            levelNumber: 1,
            displayName: "Category",
            isMandatory: true,
            isActive: true,
          },
        ],
        visibilitySettings: {
          showInOnlineForm: [1],
          showInOfflineForm: [1],
          showInTicketDisplay: [1],
          showInFilters: [1],
        },
        priorityFromLevel: 0, // Default: manual priority selection
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  /**
   * Fetch categories for a specific level
   */
  const fetchCategoriesForLevel = useCallback(
    async (level: number, parentId?: string) => {
      if (!projectId) return [];

      try {
        setLoadingLevel(level);

        const url =
          level === 1
            ? `${API_URL}/hierarchy-config/${projectId}/level/1`
            : `${API_URL}/hierarchy-config/${projectId}/level/${level}?parentId=${parentId}`;

        const response = await axios.get(url);

        if (response.data.success) {
          return response.data.data as CategoryItem[];
        }
        return [];
      } catch (err: any) {
        console.error(`Error fetching level ${level} categories:`, err);
        return [];
      } finally {
        setLoadingLevel(null);
      }
    },
    [projectId],
  );

  /**
   * Load initial data
   */
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  /**
   * Load Level 1 categories when config is loaded
   */
  useEffect(() => {
    if (config && projectId) {
      fetchCategoriesForLevel(1).then(setLevel1Options);
    }
  }, [config, projectId, fetchCategoriesForLevel]);

  /**
   * Load Level 2 categories when Level 1 selection changes
   */
  useEffect(() => {
    if (value?.level1 && config && config.levelCount >= 2) {
      fetchCategoriesForLevel(2, value.level1).then(setLevel2Options);
    } else {
      setLevel2Options([]);
    }
  }, [value?.level1, config, fetchCategoriesForLevel]);

  /**
   * Load Level 3 categories when Level 2 selection changes
   */
  useEffect(() => {
    if (value?.level2 && config && config.levelCount >= 3) {
      fetchCategoriesForLevel(3, value.level2).then(setLevel3Options);
    } else {
      setLevel3Options([]);
    }
  }, [value?.level2, config, fetchCategoriesForLevel]);

  /**
   * Load Level 4 categories when Level 3 selection changes
   */
  useEffect(() => {
    if (value?.level3 && config && config.levelCount >= 4) {
      fetchCategoriesForLevel(4, value.level3).then(setLevel4Options);
    } else {
      setLevel4Options([]);
    }
  }, [value?.level3, config, fetchCategoriesForLevel]);

  /**
   * Handle level selection change
   */
  const handleLevelChange = (level: number, selectedId: string) => {
    const newValue: CategoryHierarchyValue = { ...value };

    // Set the selected level
    switch (level) {
      case 1:
        newValue.level1 = selectedId || undefined;
        newValue.level1Name = selectedId
          ? level1Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        // Clear dependent levels
        newValue.level2 = undefined;
        newValue.level2Name = undefined;
        newValue.level3 = undefined;
        newValue.level3Name = undefined;
        newValue.level4 = undefined;
        newValue.level4Name = undefined;
        break;
      case 2:
        newValue.level2 = selectedId || undefined;
        newValue.level2Name = selectedId
          ? level2Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        newValue.level3 = undefined;
        newValue.level3Name = undefined;
        newValue.level4 = undefined;
        newValue.level4Name = undefined;
        break;
      case 3:
        newValue.level3 = selectedId || undefined;
        newValue.level3Name = selectedId
          ? level3Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        newValue.level4 = undefined;
        newValue.level4Name = undefined;
        break;
      case 4:
        newValue.level4 = selectedId || undefined;
        newValue.level4Name = selectedId
          ? level4Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        break;
    }

    // Build display path
    newValue.displayPath = buildDisplayPath(newValue);

    // Check for auto-priority assignment based on configured level
    if (
      config?.priorityFromLevel &&
      config.priorityFromLevel > 0 &&
      onPriorityChange
    ) {
      const priorityLevel = config.priorityFromLevel;
      let selectedCategory: CategoryItem | undefined;

      // Get the category for the priority level
      switch (priorityLevel) {
        case 1:
          selectedCategory = level1Options.find(
            (c) => c._id === newValue.level1,
          );
          break;
        case 2:
          selectedCategory = level2Options.find(
            (c) => c._id === newValue.level2,
          );
          break;
        case 3:
          selectedCategory = level3Options.find(
            (c) => c._id === newValue.level3,
          );
          break;
        case 4:
          selectedCategory = level4Options.find(
            (c) => c._id === newValue.level4,
          );
          break;
      }

      // Call priority change callback with the category's default priority
      if (selectedCategory?.defaultPriority) {
        newValue.autoAssignedPriority = selectedCategory.defaultPriority;
        onPriorityChange(selectedCategory.defaultPriority);
      } else if (level <= priorityLevel) {
        // Clear priority if the priority-determining level or earlier is changed
        newValue.autoAssignedPriority = undefined;
        onPriorityChange(undefined);
      }
    }

    onChange(newValue);
  };

  /**
   * Build display path from selected values
   */
  const buildDisplayPath = (val: CategoryHierarchyValue): string => {
    const parts: string[] = [];

    if (val.level1) {
      const cat1 = level1Options.find((c) => c._id === val.level1);
      if (cat1) parts.push(cat1.name);
    }
    if (val.level2) {
      const cat2 = level2Options.find((c) => c._id === val.level2);
      if (cat2) parts.push(cat2.name);
    }
    if (val.level3) {
      const cat3 = level3Options.find((c) => c._id === val.level3);
      if (cat3) parts.push(cat3.name);
    }
    if (val.level4) {
      const cat4 = level4Options.find((c) => c._id === val.level4);
      if (cat4) parts.push(cat4.name);
    }

    return parts.join(" > ");
  };

  /**
   * Get visible levels based on mode
   */
  const getVisibleLevels = (): number[] => {
    if (!config) return [1];

    switch (mode) {
      case "online":
        return config.visibilitySettings.showInOnlineForm;
      case "offline":
        return config.visibilitySettings.showInOfflineForm;
      case "display":
        return config.visibilitySettings.showInTicketDisplay;
      case "filter":
        return config.visibilitySettings.showInFilters;
      default:
        return [1];
    }
  };

  /**
   * Check if a level should be shown
   */
  const shouldShowLevel = (levelNumber: number): boolean => {
    const visibleLevels = getVisibleLevels();
    return (
      visibleLevels.includes(levelNumber) &&
      config !== null &&
      levelNumber <= config.levelCount
    );
  };

  /**
   * Get level configuration
   */
  const getLevelConfig = (levelNumber: number): HierarchyLevel | undefined => {
    return config?.levels.find((l) => l.levelNumber === levelNumber);
  };

  /**
   * Check if a level is valid (for validation display)
   */
  const isLevelValid = (levelNumber: number): boolean => {
    const levelConfig = getLevelConfig(levelNumber);
    if (!levelConfig?.isMandatory) return true;

    switch (levelNumber) {
      case 1:
        return !!value?.level1;
      case 2:
        return !!value?.level2;
      case 3:
        return !!value?.level3;
      case 4:
        return !!value?.level4;
      default:
        return true;
    }
  };

  /**
   * Get options for a level
   */
  const getOptionsForLevel = (levelNumber: number): CategoryItem[] => {
    switch (levelNumber) {
      case 1:
        return level1Options;
      case 2:
        return level2Options;
      case 3:
        return level3Options;
      case 4:
        return level4Options;
      default:
        return [];
    }
  };

  /**
   * Get selected value for a level
   */
  const getValueForLevel = (levelNumber: number): string => {
    switch (levelNumber) {
      case 1:
        return value?.level1 || "";
      case 2:
        return value?.level2 || "";
      case 3:
        return value?.level3 || "";
      case 4:
        return value?.level4 || "";
      default:
        return "";
    }
  };

  /**
   * Check if level should be disabled
   */
  const isLevelDisabled = (levelNumber: number): boolean => {
    if (disabled) return true;

    // Level 1 is always enabled
    if (levelNumber === 1) return false;

    // Higher levels need parent to be selected
    switch (levelNumber) {
      case 2:
        return !value?.level1;
      case 3:
        return !value?.level2;
      case 4:
        return !value?.level3;
      default:
        return false;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={`${className} animate-pulse`}>
        <div className="h-10 bg-gray-200 rounded"></div>
      </div>
    );
  }

  // Error state
  if (error && !config) {
    return <div className={`${className} text-red-500 text-sm`}>{error}</div>;
  }

  // Render dropdown for a level
  const renderLevelDropdown = (levelNumber: number) => {
    const levelConfig = getLevelConfig(levelNumber);
    if (!levelConfig || !shouldShowLevel(levelNumber)) return null;

    const options = getOptionsForLevel(levelNumber);
    const selectedValue = getValueForLevel(levelNumber);
    const levelDisabled = isLevelDisabled(levelNumber);
    const isValid = isLevelValid(levelNumber);
    const isLoading = loadingLevel === levelNumber;

    return (
      <div
        key={levelNumber}
        className={compact ? "flex-1 min-w-[180px]" : "mb-4"}
      >
        <label
          className={`block text-sm font-medium text-gray-700 mb-1 ${labelClassName}`}
        >
          {levelConfig.displayName}
          {levelConfig.isMandatory && (
            <span className="text-red-500 ml-1">*</span>
          )}
        </label>
        <div className="relative">
          <select
            value={selectedValue}
            onChange={(e) => handleLevelChange(levelNumber, e.target.value)}
            disabled={levelDisabled || isLoading}
            className={`
              w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent
              ${levelDisabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}
              ${showValidation && !isValid ? "border-red-500" : "border-gray-300"}
              ${selectClassName}
            `}
          >
            <option value="">-- Select {levelConfig.displayName} --</option>
            {options.map((option) => (
              <option key={option._id} value={option._id}>
                {option.name}
              </option>
            ))}
          </select>
          {isLoading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <svg
                className="animate-spin h-4 w-4 text-blue-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
          )}
        </div>
        {showValidation && !isValid && (
          <p className="text-red-500 text-xs mt-1">
            {levelConfig.displayName} is required
          </p>
        )}
      </div>
    );
  };

  return (
    <div className={`${className} ${compact ? "flex flex-wrap gap-4" : ""}`}>
      {renderLevelDropdown(1)}
      {renderLevelDropdown(2)}
      {renderLevelDropdown(3)}
      {renderLevelDropdown(4)}

      {/* Display path preview */}
      {value?.displayPath && !compact && (
        <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
          <span className="text-xs text-gray-500">Selected: </span>
          <span className="text-sm text-gray-700">{value.displayPath}</span>
        </div>
      )}
    </div>
  );
};

export default HierarchyCategorySelector;

/**
 * Hook to use hierarchy configuration with automatic refresh
 */
export const useHierarchyConfig = (
  projectId: string,
  refreshInterval?: number,
) => {
  const [config, setConfig] = useState<HierarchyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!projectId) return;

    try {
      const response = await axios.get(
        `${API_URL}/hierarchy-config/${projectId}`,
      );
      if (response.data.success) {
        setConfig(response.data.data);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchConfig();
  }, [projectId, fetchConfig]);

  // Optional: Set up polling for real-time updates when window is visible
  useEffect(() => {
    if (!projectId || !refreshInterval) return;

    // Only poll when document is visible
    let intervalId: NodeJS.Timeout | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Start polling
        if (!intervalId) {
          intervalId = setInterval(fetchConfig, refreshInterval);
        }
      } else {
        // Stop polling when hidden
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    // Initial setup
    if (document.visibilityState === "visible") {
      intervalId = setInterval(fetchConfig, refreshInterval);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [projectId, refreshInterval, fetchConfig]);

  // Expose a manual refresh function
  const refresh = useCallback(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, error, refresh };
};

/**
 * Component to display category hierarchy path
 */
export const CategoryHierarchyDisplay: React.FC<{
  value?: CategoryHierarchyValue;
  className?: string;
  separator?: string;
}> = ({ value, className = "", separator = " > " }) => {
  if (!value?.displayPath) {
    return <span className={`text-gray-400 ${className}`}>Not set</span>;
  }

  return (
    <span className={className}>
      {value.displayPath.split(" > ").map((part, index, arr) => (
        <React.Fragment key={index}>
          <span className="text-gray-700">{part}</span>
          {index < arr.length - 1 && (
            <span className="text-gray-400 mx-1">{separator}</span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
};
