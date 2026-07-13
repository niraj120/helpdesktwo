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
  sr?: { appliesTo?: Array<"normal" | "PSR" | "ISR"> };
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
  level5?: string;
  level6?: string;
  level7?: string;
  level8?: string;
  level9?: string;
  level10?: string;
  /** Human-readable names for each level — used by conditionEngine so conditions
   * can be written as "Name change" instead of a MongoDB ObjectId. */
  level1Name?: string;
  level2Name?: string;
  level3Name?: string;
  level4Name?: string;
  level5Name?: string;
  level6Name?: string;
  level7Name?: string;
  level8Name?: string;
  level9Name?: string;
  level10Name?: string;
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
  /** Called whenever a level's available options change — (level, hasOptions) */
  onLevelOptionsChange?: (level: number, hasOptions: boolean) => void;
  mode?: "online" | "offline" | "display" | "filter"; // Which visibility setting to use
  disabled?: boolean;
  showValidation?: boolean;
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
  compact?: boolean; // Use compact layout (horizontal)
  ticketType?: "normal" | "PSR" | "ISR";
  maxLevel?: number;  // Limit cascade to this many levels (e.g. 2 = only show L1+L2)
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
  onLevelOptionsChange,
  mode = "online",
  disabled = false,
  showValidation = false,
  className = "",
  labelClassName = "",
  selectClassName = "",
  compact = false,
  ticketType = "normal",
  maxLevel,
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
  const [level5Options, setLevel5Options] = useState<CategoryItem[]>([]);
  const [level6Options, setLevel6Options] = useState<CategoryItem[]>([]);
  const [level7Options, setLevel7Options] = useState<CategoryItem[]>([]);
  const [level8Options, setLevel8Options] = useState<CategoryItem[]>([]);
  const [level9Options, setLevel9Options] = useState<CategoryItem[]>([]);
  const [level10Options, setLevel10Options] = useState<CategoryItem[]>([]);

  // Loading states for each level
  const [loadingLevel, setLoadingLevel] = useState<number | null>(null);

  /**
   * Fetch hierarchy configuration for the project
   */
  const fetchConfig = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      const params = new URLSearchParams({ scope: ticketType });
      const response = await axios.get(
        `${API_URL}/hierarchy-config/${projectId}?${params.toString()}`,
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
  }, [projectId, ticketType]);

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
          const items = response.data.data as CategoryItem[];
          return items.filter((item) => {
            const appliesTo = item.sr?.appliesTo || [];
            if (appliesTo.length === 0) return ticketType === "normal";
            if (appliesTo.includes("PSR") && appliesTo.includes("ISR")) {
              return ticketType === "PSR";
            }
            return appliesTo.length === 1 && appliesTo[0] === ticketType;
          });
        }
        return [];
      } catch (err: any) {
        console.error(`Error fetching level ${level} categories:`, err);
        return [];
      } finally {
        setLoadingLevel(null);
      }
    },
    [projectId, ticketType],
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
      setLevel2Options([]);
      fetchCategoriesForLevel(2, value.level1).then((opts) => {
        setLevel2Options(opts);
        onLevelOptionsChange?.(2, opts.length > 0);
      });
    } else {
      setLevel2Options([]);
      onLevelOptionsChange?.(2, false);
    }
  }, [value?.level1, config, fetchCategoriesForLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Load Level 3 categories when Level 2 selection changes
   */
  useEffect(() => {
    if (value?.level2 && config && config.levelCount >= 3) {
      setLevel3Options([]);
      fetchCategoriesForLevel(3, value.level2).then((opts) => {
        setLevel3Options(opts);
        onLevelOptionsChange?.(3, opts.length > 0);
      });
    } else {
      setLevel3Options([]);
      onLevelOptionsChange?.(3, false);
    }
  }, [value?.level2, config, fetchCategoriesForLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Load Level 4 categories when Level 3 selection changes
   */
  useEffect(() => {
    if (value?.level3 && config && config.levelCount >= 4) {
      setLevel4Options([]);
      fetchCategoriesForLevel(4, value.level3).then((opts) => {
        setLevel4Options(opts);
        onLevelOptionsChange?.(4, opts.length > 0);
      });
    } else {
      setLevel4Options([]);
      onLevelOptionsChange?.(4, false);
    }
  }, [value?.level3, config, fetchCategoriesForLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Load Level 5 categories when Level 4 selection changes
   */
  useEffect(() => {
    if (value?.level4 && config && config.levelCount >= 5) {
      setLevel5Options([]);
      fetchCategoriesForLevel(5, value.level4).then((opts) => {
        setLevel5Options(opts);
        onLevelOptionsChange?.(5, opts.length > 0);
      });
    } else {
      setLevel5Options([]);
      onLevelOptionsChange?.(5, false);
    }
  }, [value?.level4, config, fetchCategoriesForLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Load Level 6 categories when Level 5 selection changes
   */
  useEffect(() => {
    if (value?.level5 && config && config.levelCount >= 6) {
      setLevel6Options([]);
      fetchCategoriesForLevel(6, value.level5).then((opts) => {
        setLevel6Options(opts);
        onLevelOptionsChange?.(6, opts.length > 0);
      });
    } else {
      setLevel6Options([]);
      onLevelOptionsChange?.(6, false);
    }
  }, [value?.level5, config, fetchCategoriesForLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Load Level 7 categories when Level 6 selection changes
   */
  useEffect(() => {
    if (value?.level6 && config && config.levelCount >= 7) {
      setLevel7Options([]);
      fetchCategoriesForLevel(7, value.level6).then((opts) => {
        setLevel7Options(opts);
        onLevelOptionsChange?.(7, opts.length > 0);
      });
    } else {
      setLevel7Options([]);
      onLevelOptionsChange?.(7, false);
    }
  }, [value?.level6, config, fetchCategoriesForLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Load Level 8 categories when Level 7 selection changes
   */
  useEffect(() => {
    if (value?.level7 && config && config.levelCount >= 8) {
      setLevel8Options([]);
      fetchCategoriesForLevel(8, value.level7).then((opts) => {
        setLevel8Options(opts);
        onLevelOptionsChange?.(8, opts.length > 0);
      });
    } else {
      setLevel8Options([]);
      onLevelOptionsChange?.(8, false);
    }
  }, [value?.level7, config, fetchCategoriesForLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Load Level 9 categories when Level 8 selection changes
   */
  useEffect(() => {
    if (value?.level8 && config && config.levelCount >= 9) {
      setLevel9Options([]);
      fetchCategoriesForLevel(9, value.level8).then((opts) => {
        setLevel9Options(opts);
        onLevelOptionsChange?.(9, opts.length > 0);
      });
    } else {
      setLevel9Options([]);
      onLevelOptionsChange?.(9, false);
    }
  }, [value?.level8, config, fetchCategoriesForLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Load Level 10 categories when Level 9 selection changes
   */
  useEffect(() => {
    if (value?.level9 && config && config.levelCount >= 10) {
      setLevel10Options([]);
      fetchCategoriesForLevel(10, value.level9).then((opts) => {
        setLevel10Options(opts);
        onLevelOptionsChange?.(10, opts.length > 0);
      });
    } else {
      setLevel10Options([]);
      onLevelOptionsChange?.(10, false);
    }
  }, [value?.level9, config, fetchCategoriesForLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Auto-select levels that have exactly one option available
   */
  useEffect(() => {
    if (!disabled && level1Options.length === 1 && !value?.level1) {
      const opt = level1Options[0];
      onChange({
        ...value,
        level1: opt._id,
        level1Name: opt.name,
        level2: undefined,
        level2Name: undefined,
        level3: undefined,
        level3Name: undefined,
        level4: undefined,
        level4Name: undefined,
        level5: undefined,
        level5Name: undefined,
        level6: undefined,
        level6Name: undefined,
        level7: undefined,
        level7Name: undefined,
        level8: undefined,
        level8Name: undefined,
        level9: undefined,
        level9Name: undefined,
        level10: undefined,
        level10Name: undefined,
        displayPath: opt.name,
      });
    }
  }, [level1Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !disabled &&
      level2Options.length === 1 &&
      !value?.level2 &&
      value?.level1
    ) {
      const opt = level2Options[0];
      onChange({
        ...value,
        level2: opt._id,
        level2Name: opt.name,
        level3: undefined,
        level3Name: undefined,
        level4: undefined,
        level4Name: undefined,
        level5: undefined,
        level5Name: undefined,
        level6: undefined,
        level6Name: undefined,
        level7: undefined,
        level7Name: undefined,
        level8: undefined,
        level8Name: undefined,
        level9: undefined,
        level9Name: undefined,
        level10: undefined,
        level10Name: undefined,
      });
    }
  }, [level2Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !disabled &&
      level3Options.length === 1 &&
      !value?.level3 &&
      value?.level2
    ) {
      const opt = level3Options[0];
      onChange({
        ...value,
        level3: opt._id,
        level3Name: opt.name,
        level4: undefined,
        level4Name: undefined,
        level5: undefined,
        level5Name: undefined,
        level6: undefined,
        level6Name: undefined,
        level7: undefined,
        level7Name: undefined,
        level8: undefined,
        level8Name: undefined,
        level9: undefined,
        level9Name: undefined,
        level10: undefined,
        level10Name: undefined,
      });
    }
  }, [level3Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !disabled &&
      level4Options.length === 1 &&
      !value?.level4 &&
      value?.level3
    ) {
      const opt = level4Options[0];
      onChange({
        ...value,
        level4: opt._id,
        level4Name: opt.name,
        level5: undefined,
        level5Name: undefined,
        level6: undefined,
        level6Name: undefined,
        level7: undefined,
        level7Name: undefined,
        level8: undefined,
        level8Name: undefined,
        level9: undefined,
        level9Name: undefined,
        level10: undefined,
        level10Name: undefined,
      });
    }
  }, [level4Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !disabled &&
      level5Options.length === 1 &&
      !value?.level5 &&
      value?.level4
    ) {
      const opt = level5Options[0];
      onChange({
        ...value,
        level5: opt._id,
        level5Name: opt.name,
        level6: undefined,
        level6Name: undefined,
        level7: undefined,
        level7Name: undefined,
        level8: undefined,
        level8Name: undefined,
        level9: undefined,
        level9Name: undefined,
        level10: undefined,
        level10Name: undefined,
      });
    }
  }, [level5Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !disabled &&
      level6Options.length === 1 &&
      !value?.level6 &&
      value?.level5
    ) {
      const opt = level6Options[0];
      onChange({
        ...value,
        level6: opt._id,
        level6Name: opt.name,
        level7: undefined,
        level7Name: undefined,
        level8: undefined,
        level8Name: undefined,
        level9: undefined,
        level9Name: undefined,
        level10: undefined,
        level10Name: undefined,
      });
    }
  }, [level6Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !disabled &&
      level7Options.length === 1 &&
      !value?.level7 &&
      value?.level6
    ) {
      const opt = level7Options[0];
      onChange({
        ...value,
        level7: opt._id,
        level7Name: opt.name,
        level8: undefined,
        level8Name: undefined,
        level9: undefined,
        level9Name: undefined,
        level10: undefined,
        level10Name: undefined,
      });
    }
  }, [level7Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !disabled &&
      level8Options.length === 1 &&
      !value?.level8 &&
      value?.level7
    ) {
      const opt = level8Options[0];
      onChange({
        ...value,
        level8: opt._id,
        level8Name: opt.name,
        level9: undefined,
        level9Name: undefined,
        level10: undefined,
        level10Name: undefined,
      });
    }
  }, [level8Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !disabled &&
      level9Options.length === 1 &&
      !value?.level9 &&
      value?.level8
    ) {
      const opt = level9Options[0];
      onChange({
        ...value,
        level9: opt._id,
        level9Name: opt.name,
        level10: undefined,
        level10Name: undefined,
      });
    }
  }, [level9Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !disabled &&
      level10Options.length === 1 &&
      !value?.level10 &&
      value?.level9
    ) {
      const opt = level10Options[0];
      onChange({ ...value, level10: opt._id, level10Name: opt.name });
    }
  }, [level10Options.length, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

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
        newValue.level5 = undefined;
        newValue.level5Name = undefined;
        newValue.level6 = undefined;
        newValue.level6Name = undefined;
        newValue.level7 = undefined;
        newValue.level7Name = undefined;
        newValue.level8 = undefined;
        newValue.level8Name = undefined;
        newValue.level9 = undefined;
        newValue.level9Name = undefined;
        newValue.level10 = undefined;
        newValue.level10Name = undefined;
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
        newValue.level5 = undefined;
        newValue.level5Name = undefined;
        newValue.level6 = undefined;
        newValue.level6Name = undefined;
        newValue.level7 = undefined;
        newValue.level7Name = undefined;
        newValue.level8 = undefined;
        newValue.level8Name = undefined;
        newValue.level9 = undefined;
        newValue.level9Name = undefined;
        newValue.level10 = undefined;
        newValue.level10Name = undefined;
        break;
      case 3:
        newValue.level3 = selectedId || undefined;
        newValue.level3Name = selectedId
          ? level3Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        newValue.level4 = undefined;
        newValue.level4Name = undefined;
        newValue.level5 = undefined;
        newValue.level5Name = undefined;
        newValue.level6 = undefined;
        newValue.level6Name = undefined;
        newValue.level7 = undefined;
        newValue.level7Name = undefined;
        newValue.level8 = undefined;
        newValue.level8Name = undefined;
        newValue.level9 = undefined;
        newValue.level9Name = undefined;
        newValue.level10 = undefined;
        newValue.level10Name = undefined;
        break;
      case 4:
        newValue.level4 = selectedId || undefined;
        newValue.level4Name = selectedId
          ? level4Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        newValue.level5 = undefined;
        newValue.level5Name = undefined;
        newValue.level6 = undefined;
        newValue.level6Name = undefined;
        newValue.level7 = undefined;
        newValue.level7Name = undefined;
        newValue.level8 = undefined;
        newValue.level8Name = undefined;
        newValue.level9 = undefined;
        newValue.level9Name = undefined;
        newValue.level10 = undefined;
        newValue.level10Name = undefined;
        break;
      case 5:
        newValue.level5 = selectedId || undefined;
        newValue.level5Name = selectedId
          ? level5Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        newValue.level6 = undefined;
        newValue.level6Name = undefined;
        newValue.level7 = undefined;
        newValue.level7Name = undefined;
        newValue.level8 = undefined;
        newValue.level8Name = undefined;
        newValue.level9 = undefined;
        newValue.level9Name = undefined;
        newValue.level10 = undefined;
        newValue.level10Name = undefined;
        break;
      case 6:
        newValue.level6 = selectedId || undefined;
        newValue.level6Name = selectedId
          ? level6Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        newValue.level7 = undefined;
        newValue.level7Name = undefined;
        newValue.level8 = undefined;
        newValue.level8Name = undefined;
        newValue.level9 = undefined;
        newValue.level9Name = undefined;
        newValue.level10 = undefined;
        newValue.level10Name = undefined;
        break;
      case 7:
        newValue.level7 = selectedId || undefined;
        newValue.level7Name = selectedId
          ? level7Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        newValue.level8 = undefined;
        newValue.level8Name = undefined;
        newValue.level9 = undefined;
        newValue.level9Name = undefined;
        newValue.level10 = undefined;
        newValue.level10Name = undefined;
        break;
      case 8:
        newValue.level8 = selectedId || undefined;
        newValue.level8Name = selectedId
          ? level8Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        newValue.level9 = undefined;
        newValue.level9Name = undefined;
        newValue.level10 = undefined;
        newValue.level10Name = undefined;
        break;
      case 9:
        newValue.level9 = selectedId || undefined;
        newValue.level9Name = selectedId
          ? level9Options.find((c) => c._id === selectedId)?.name || undefined
          : undefined;
        newValue.level10 = undefined;
        newValue.level10Name = undefined;
        break;
      case 10:
        newValue.level10 = selectedId || undefined;
        newValue.level10Name = selectedId
          ? level10Options.find((c) => c._id === selectedId)?.name || undefined
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
        case 5:
          selectedCategory = level5Options.find(
            (c) => c._id === newValue.level5,
          );
          break;
        case 6:
          selectedCategory = level6Options.find(
            (c) => c._id === newValue.level6,
          );
          break;
        case 7:
          selectedCategory = level7Options.find(
            (c) => c._id === newValue.level7,
          );
          break;
        case 8:
          selectedCategory = level8Options.find(
            (c) => c._id === newValue.level8,
          );
          break;
        case 9:
          selectedCategory = level9Options.find(
            (c) => c._id === newValue.level9,
          );
          break;
        case 10:
          selectedCategory = level10Options.find(
            (c) => c._id === newValue.level10,
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
    if (val.level5) {
      const cat5 = level5Options.find((c) => c._id === val.level5);
      if (cat5) parts.push(cat5.name);
    }
    if (val.level6) {
      const cat6 = level6Options.find((c) => c._id === val.level6);
      if (cat6) parts.push(cat6.name);
    }
    if (val.level7) {
      const cat7 = level7Options.find((c) => c._id === val.level7);
      if (cat7) parts.push(cat7.name);
    }
    if (val.level8) {
      const cat8 = level8Options.find((c) => c._id === val.level8);
      if (cat8) parts.push(cat8.name);
    }
    if (val.level9) {
      const cat9 = level9Options.find((c) => c._id === val.level9);
      if (cat9) parts.push(cat9.name);
    }
    if (val.level10) {
      const cat10 = level10Options.find((c) => c._id === val.level10);
      if (cat10) parts.push(cat10.name);
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
      levelNumber <= config.levelCount &&
      (maxLevel === undefined || levelNumber <= maxLevel)
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
      case 5:
        return !value?.level4;
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
      case 5:
        return level5Options;
      case 6:
        return level6Options;
      case 7:
        return level7Options;
      case 8:
        return level8Options;
      case 9:
        return level9Options;
      case 10:
        return level10Options;
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
      case 5:
        return value?.level5 || "";
      case 6:
        return value?.level6 || "";
      case 7:
        return value?.level7 || "";
      case 8:
        return value?.level8 || "";
      case 9:
        return value?.level9 || "";
      case 10:
        return value?.level10 || "";
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
      case 5:
        return !!value?.level5;
      case 6:
        return !value?.level5;
      case 7:
        return !value?.level6;
      case 8:
        return !value?.level7;
      case 9:
        return !value?.level8;
      case 10:
        return !value?.level9;
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

    // Hide a deeper level when its parent IS selected (not disabled) but the
    // server returned no children for the chosen parent — no options to pick.
    if (
      levelNumber > 1 &&
      !levelDisabled &&
      !isLoading &&
      options.length === 0
    ) {
      return null;
    }

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

      {/* Level 5 - only shown when config has levelCount >= 5 */}
      {config && config.levelCount >= 5 && renderLevelDropdown(5)}
      {config && config.levelCount >= 6 && renderLevelDropdown(6)}
      {config && config.levelCount >= 7 && renderLevelDropdown(7)}
      {config && config.levelCount >= 8 && renderLevelDropdown(8)}
      {config && config.levelCount >= 9 && renderLevelDropdown(9)}
      {config && config.levelCount >= 10 && renderLevelDropdown(10)}
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
  scope: "normal" | "PSR" | "ISR" = "normal",
) => {
  const [config, setConfig] = useState<HierarchyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!projectId) return;

    try {
      const params = new URLSearchParams({ scope });
      const response = await axios.get(
        `${API_URL}/hierarchy-config/${projectId}?${params.toString()}`,
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
  }, [projectId, scope]);

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
