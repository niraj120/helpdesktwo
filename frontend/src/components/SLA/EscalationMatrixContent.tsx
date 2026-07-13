import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { API_CONFIG } from "../../config/constants";
import {
  getAllEscalationMatrices,
  getEscalationMatrixById,
  createEscalationMatrix,
  updateEscalationMatrix,
  deleteEscalationMatrix,
  toggleEscalationMatrixStatus,
} from "../../services/escalationMatrixService";
import type {
  EscalationMatrix,
  EscalationLevel,
  EscalationMode,
  EscalationMatrixFormData,
  EscalationLevelFormData,
  SlaUnit,
  PriorityMode,
  PriorityConfigFormData,
  LinkedCategoryInfo,
} from "../../types/escalationMatrix";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowUpIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";

interface Role {
  _id: string;
  name: string;
  code: string;
}

interface Project {
  _id: string;
  name: string;
  code?: string;
}

interface SLARule {
  _id: string;
  name: string;
  priority?: "Critical" | "Urgent" | "High" | "Normal" | "Low";
  isActive: boolean;
  projectIds: string[];
  resolutionTime: {
    value: number;
    unit: "minutes" | "hours" | "days";
  };
  responseTime: {
    value: number;
    unit: "minutes" | "hours" | "days";
  };
}

interface CategoryItem {
  _id: string;
  name: string;
  code?: string | number;
  level?: number;
  parentId?: string | null;
  path?: string;
  isActive: boolean;
  sr?: {
    appliesTo?: CategoryScope[];
  };
}

// Alias for backward compatibility
type Priority = SLARule;
type CategoryScope = "normal" | "PSR" | "ISR";

const CATEGORY_SCOPE_OPTIONS: Array<{
  value: CategoryScope;
  label: string;
  hint: string;
}> = [
  {
    value: "normal",
    label: "Normal Ticket",
    hint: "Use existing normal ticket categories.",
  },
  {
    value: "PSR",
    label: "PSR",
    hint: "Parent Service Request categories.",
  },
  {
    value: "ISR",
    label: "ISR",
    hint: "Internal Service Request categories.",
  },
];

const getCategoryScope = (category: CategoryItem): CategoryScope => {
  const appliesTo = category.sr?.appliesTo || [];
  if (appliesTo.length === 0) return "normal";
  if (appliesTo.includes("PSR") && appliesTo.includes("ISR")) {
    return "PSR";
  }
  if (appliesTo.length === 1) return appliesTo[0];
  return "normal";
};

const getCategoryPath = (category: CategoryItem): string =>
  category.path && category.path.trim().length > 0
    ? category.path
    : category.name;

const getCategoryLevel = (category: CategoryItem): number =>
  typeof category.level === "number" && category.level > 0
    ? category.level
    : 1;

/**
 * EscalationMatrixContent
 * Content component for managing escalation matrices (no DashboardLayout wrapper)
 * Can be used standalone or embedded in SLARulesPage tabs
 */
const EscalationMatrixContent: React.FC = () => {
  const [matrices, setMatrices] = useState<EscalationMatrix[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMatrix, setEditingMatrix] = useState<EscalationMatrix | null>(
    null,
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Form states
  const [formData, setFormData] = useState<EscalationMatrixFormData>({
    name: "",
    description: "",
    escalationMode: "SEQUENTIAL",
    scopeMode: "PRIORITY",
    categoryIds: [],
    priorityMode: "SAME_FOR_ALL",
    allowSkipLevel: false,
    allowBackward: false,
    autoEscalate: false,
    levels: [],
    priorityConfigs: [],
    projectIds: [],
    applicablePriorities: [],
    isActive: true,
  });

  // Priority states
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]); // Multi-select priority codes
  const [activePriorityTab, setActivePriorityTab] = useState<string>(""); // For per-priority level editing
  const [pendingPrioritiesToRestore, setPendingPrioritiesToRestore] = useState<
    string[]
  >([]); // For restoring during edit

  const [roles, setRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifyUsers, setNotifyUsers] = useState<
    { _id: string; firstName: string; lastName: string; email: string }[]
  >([]);
  const [availableCategories, setAvailableCategories] = useState<
    CategoryItem[]
  >([]);
  const [linkedCategoryIds, setLinkedCategoryIds] = useState<string[]>([]);
  const [categoryScope, setCategoryScope] = useState<CategoryScope>("normal");
  const [shouldInferCategoryScope, setShouldInferCategoryScope] =
    useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [projectUsers, setProjectUsers] = useState<
    {
      _id: string;
      firstName: string;
      lastName: string;
      email: string;
      role?: { code: string };
    }[]
  >([]);
  const [levelUserSearch, setLevelUserSearch] = useState<
    Record<number, string>
  >({});
  const [levelSearchResults, setLevelSearchResults] = useState<
    Record<
      number,
      Array<{
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
        role?: { code: string };
      }>
    >
  >({});
  const levelSearchTimeout = useRef<
    Record<number, ReturnType<typeof setTimeout>>
  >({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // US-ESC-011: Coverage report
  const [showCoverage, setShowCoverage] = useState(false);
  const [coverageData, setCoverageData] = useState<
    Array<{
      projectId: string;
      projectName: string;
      openTickets: number;
      withMatrix: number;
      withoutMatrix: number;
      coveragePct: number;
    }>
  >([]);
  const [coverageLoading, setCoverageLoading] = useState(false);

  const fetchCoverageReport = async () => {
    setCoverageLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/escalation-matrix/coverage`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        },
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) setCoverageData(data.data || []);
      }
    } catch (err) {
      console.error("Coverage fetch error:", err);
    } finally {
      setCoverageLoading(false);
    }
  };

  const handleToggleCoverage = () => {
    if (!showCoverage) fetchCoverageReport();
    setShowCoverage((v) => !v);
  };

  // Fetch data on mount
  useEffect(() => {
    fetchMatrices();
    fetchRoles();
    fetchProjects();
    fetchNotifyUsers();
  }, []);

  // Fetch priorities when project selection changes
  useEffect(() => {
    if (formData.projectIds.length > 0) {
      fetchPriorities(formData.projectIds[0]); // Fetch for first selected project
    } else {
      setPriorities([]);
      setSelectedPriorities([]);
    }
  }, [formData.projectIds]);

  // Fetch categories when project selection changes (for category binding)
  useEffect(() => {
    if (formData.projectIds.length > 0 && showModal) {
      fetchCategoriesForProject(formData.projectIds[0]);
      fetchProjectUsers(formData.projectIds[0]);
    } else {
      setAvailableCategories([]);
      setProjectUsers([]);
    }
  }, [formData.projectIds, showModal]);

  useEffect(() => {
    if (!shouldInferCategoryScope || availableCategories.length === 0) return;
    const selectedCategory = availableCategories.find((cat) =>
      linkedCategoryIds.includes(cat._id),
    );
    if (selectedCategory) {
      setCategoryScope(getCategoryScope(selectedCategory));
    }
    setShouldInferCategoryScope(false);
  }, [availableCategories, linkedCategoryIds, shouldInferCategoryScope]);

  const scopedCategories = useMemo(
    () =>
      availableCategories.filter(
        (category) => getCategoryScope(category) === categoryScope,
      ),
    [availableCategories, categoryScope],
  );

  const groupedCategories = useMemo(() => {
    const groups = scopedCategories.reduce<Record<number, CategoryItem[]>>(
      (acc, category) => {
        const level = getCategoryLevel(category);
        acc[level] = acc[level] || [];
        acc[level].push(category);
        return acc;
      },
      {},
    );
    return Object.entries(groups)
      .map(([level, categories]) => ({
        level: Number(level),
        categories: categories.sort((a, b) =>
          getCategoryPath(a).localeCompare(getCategoryPath(b)),
        ),
      }))
      .sort((a, b) => a.level - b.level);
  }, [scopedCategories]);

  // Restore selected priorities after priorities are loaded (for edit mode)
  useEffect(() => {
    if (priorities.length > 0 && pendingPrioritiesToRestore.length > 0) {
      // Match stored values to loaded priorities (handle legacy data with names/codes)
      const validPriorityIds: string[] = [];

      for (const storedValue of pendingPrioritiesToRestore) {
        // Try to match by _id first
        const matchById = priorities.find((p) => p._id === storedValue);
        if (matchById) {
          validPriorityIds.push(matchById._id);
          continue;
        }

        // Try to match by name (case-insensitive)
        const matchByName = priorities.find(
          (p) => p.name.toLowerCase() === storedValue.toLowerCase(),
        );
        if (matchByName) {
          validPriorityIds.push(matchByName._id);
          continue;
        }

        // Try to match by priority field (case-insensitive)
        const matchByPriority = priorities.find(
          (p) => p.priority?.toLowerCase() === storedValue.toLowerCase(),
        );
        if (matchByPriority) {
          validPriorityIds.push(matchByPriority._id);
        }
      }

      // Remove duplicates
      const uniqueIds = [...new Set(validPriorityIds)];
      setSelectedPriorities(uniqueIds);
      if (uniqueIds.length > 0 && !activePriorityTab) {
        setActivePriorityTab(uniqueIds[0]);
      }
      setPendingPrioritiesToRestore([]); // Clear pending
      console.log(
        "✅ Restored priorities:",
        uniqueIds,
        "from pending:",
        pendingPrioritiesToRestore,
      );
    }
  }, [priorities, pendingPrioritiesToRestore]);

  const fetchPriorities = async (projectId: string) => {
    try {
      const token = localStorage.getItem("authToken");
      // Use SLA Rules API which stores priorities with projectIds array
      const response = await fetch(
        `${API_CONFIG.API_URL}/sla-rules?projectId=${projectId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          const activePriorities = data.data.filter((p: SLARule) => p.isActive);
          setPriorities(activePriorities);
          console.log(
            "✅ Loaded SLA rules/priorities for project:",
            activePriorities.length,
          );
        }
      }
    } catch (err) {
      console.error("Error fetching SLA rules:", err);
      setPriorities([]);
    }
  };

  const fetchMatrices = async () => {
    try {
      setLoading(true);
      const response = await getAllEscalationMatrices();
      if (response.success && response.data) {
        setMatrices(response.data);
      }
    } catch (err: any) {
      console.error("Error fetching matrices:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryScopeChange = (scope: CategoryScope) => {
    setCategoryScope(scope);
    setLinkedCategoryIds((prev) =>
      prev.filter((id) => {
        const category = availableCategories.find((cat) => cat._id === id);
        return category ? getCategoryScope(category) === scope : false;
      }),
    );
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/roles`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setRoles(data.data);
        } else if (Array.isArray(data.roles)) {
          setRoles(data.roles);
        } else if (Array.isArray(data)) {
          setRoles(data);
        } else {
          setRoles([]);
        }
      }
    } catch (err) {
      console.error("Error fetching roles:", err);
      setRoles([]);
    }
  };

  // US-ESC-006: fetch active users for notify-level recipient picker
  const fetchNotifyUsers = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/users?isActive=true&limit=500`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        },
      );
      if (response.ok) {
        const data = await response.json();
        const list = data.data?.users ?? data.data ?? data.users ?? [];
        setNotifyUsers(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.error("Error fetching users for notify picker:", err);
    }
  };

  // Fetch users scoped to the selected project (for "By User" level assignee picker)
  const fetchProjectUsers = async (projectId: string) => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/users?isActive=true&limit=300&sortBy=firstName&sortOrder=asc`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        },
      );
      if (response.ok) {
        const data = await response.json();
        const list = data.data?.users ?? data.data ?? data.users ?? [];
        setProjectUsers(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.error("Error fetching project users:", err);
      setProjectUsers([]);
    }
  };

  // Search users server-side when typing in escalation level user picker (min 3 chars)
  const searchUsersForLevel = (index: number, query: string) => {
    clearTimeout(levelSearchTimeout.current[index]);
    if (query.length < 3) {
      setLevelSearchResults((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      return;
    }
    levelSearchTimeout.current[index] = setTimeout(async () => {
      try {
        const token = localStorage.getItem("authToken");
        const response = await fetch(
          `${API_CONFIG.API_URL}/users?isActive=true&search=${encodeURIComponent(query)}&limit=20&sortBy=firstName&sortOrder=asc`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            credentials: "include",
          },
        );
        if (response.ok) {
          const data = await response.json();
          const list = data.data?.users ?? data.data ?? data.users ?? [];
          const filtered = (Array.isArray(list) ? list : []).filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (u: any) => u.role?.code !== "STUDENT",
          );
          setLevelSearchResults((prev) => ({ ...prev, [index]: filtered }));
        }
      } catch (err) {
        console.error("Error searching users for level:", err);
      }
    }, 300);
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/projects?limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (
          data.success &&
          data.data?.projects &&
          Array.isArray(data.data.projects)
        ) {
          setProjects(data.data.projects);
        } else if (data.success && Array.isArray(data.data)) {
          setProjects(data.data);
        } else if (Array.isArray(data.projects)) {
          setProjects(data.projects);
        } else if (Array.isArray(data)) {
          setProjects(data);
        } else {
          setProjects([]);
        }
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
      setProjects([]);
    }
  };

  const fetchCategoriesForProject = async (projectId: string) => {
    try {
      setCategoriesLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/categories/project/${projectId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        },
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setAvailableCategories(data.data);
        }
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingMatrix(null);
    setLinkedCategoryIds([]);
    setCategoryScope("normal");
    setShouldInferCategoryScope(false);
    setFormData({
      name: "",
      description: "",
      escalationMode: "SEQUENTIAL",
      scopeMode: "PRIORITY",
      categoryIds: [],
      priorityMode: "SAME_FOR_ALL",
      allowSkipLevel: false,
      allowBackward: false,
      autoEscalate: false,
      levels: [
        {
          levelNumber: 1,
          levelName: "Level 1",
          assigneeType: "role",
          roleId: "",
          assigneeUserId: "",
          slaHours: 24,
          slaUnit: "hrs",
          levelType: "reassign" as "reassign" | "notify",
          notifyUserIds: [],
          ccUserIds: [],
          ccRoleIds: [],
          slaThresholdType: "fixed" as "fixed" | "percent",
          isActive: true,
        },
      ],
      priorityConfigs: [],
      projectIds: [],
      applicablePriorities: [],
      isActive: true,
    });
    setActivePriorityTab("");
    setSelectedPriorities([]);
    setPriorities([]); // Clear priorities until project is selected
    setShowModal(true);
  };

  const openEditModal = async (matrix: EscalationMatrix) => {
    // Fetch full matrix detail so linkedCategories are included
    // (the list endpoint only returns linkedCategoriesCount, not the full array)
    let fullMatrix = matrix;
    if (matrix._id) {
      try {
        const detail = await getEscalationMatrixById(matrix._id);
        if (detail.success && detail.data) {
          fullMatrix = detail.data;
        }
      } catch {
        // fall back to list data if fetch fails
      }
    }

    // Debug: Log raw matrix data from API
    console.log("📥 Opening edit modal - Raw matrix data:", {
      name: fullMatrix.name,
      escalationMode: fullMatrix.escalationMode,
      priorityMode: fullMatrix.priorityMode,
      allowSkipLevel: fullMatrix.allowSkipLevel,
      allowBackward: fullMatrix.allowBackward,
      autoEscalate: fullMatrix.autoEscalate,
    });

    setEditingMatrix(fullMatrix);

    // Map levels for SAME_FOR_ALL mode
    const mappedLevels = (fullMatrix.levels || []).map((l) => ({
      levelNumber: l.levelNumber,
      levelName: l.levelName,
      assigneeType: ((l as any).assigneeType as "role" | "user") || "role",
      roleId:
        l.roleId !== null && typeof l.roleId === "object"
          ? (l.roleId as any)._id
          : l.roleId,
      assigneeUserId: (l as any).assigneeUserId
        ? typeof (l as any).assigneeUserId === "object"
          ? ((l as any).assigneeUserId as any)._id
          : String((l as any).assigneeUserId)
        : "",
      assigneeUserName: (() => {
        const u = (l as any).assigneeUserId;
        if (!u) return "";
        if (typeof u === "object")
          return (
            [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || ""
          );
        return "";
      })(),
      slaHours: l.slaHours,
      slaUnit: (l as any).slaUnit || "hrs",
      levelType: (l as any).levelType || "reassign",
      notifyUserIds:
        (l as any).notifyUserIds?.map((id: any) =>
          typeof id === "object" ? (id._id ?? String(id)) : String(id),
        ) ?? [],
      ccUserIds:
        (l as any).ccUserIds?.map((id: any) =>
          typeof id === "object" ? (id._id ?? String(id)) : String(id),
        ) ?? [],
      ccRoleIds:
        (l as any).ccRoleIds?.map((id: any) =>
          typeof id === "object" ? (id._id ?? String(id)) : String(id),
        ) ?? [],
      slaThresholdType: (l as any).slaThresholdType ?? "fixed",
      slaThresholdPercent: (l as any).slaThresholdPercent,
      isActive: l.isActive,
    }));

    // Map priority configs for PER_PRIORITY mode
    const mappedPriorityConfigs = (fullMatrix.priorityConfigs || []).map(
      (pc) => ({
        priorityCode: pc.priorityCode,
        priorityName: pc.priorityName,
        levels: (pc.levels || []).map((l) => ({
          levelNumber: l.levelNumber,
          levelName: l.levelName,
          roleId:
            l.roleId !== null && typeof l.roleId === "object"
              ? (l.roleId as any)._id
              : l.roleId,
          slaHours: l.slaHours,
          slaUnit: (l as any).slaUnit || "hrs",
          levelType: (l as any).levelType || "reassign",
          notifyUserIds:
            (l as any).notifyUserIds?.map((id: any) =>
              typeof id === "object" ? (id._id ?? String(id)) : String(id),
            ) ?? [],
          ccUserIds:
            (l as any).ccUserIds?.map((id: any) =>
              typeof id === "object" ? (id._id ?? String(id)) : String(id),
            ) ?? [],
          ccRoleIds:
            (l as any).ccRoleIds?.map((id: any) =>
              typeof id === "object" ? (id._id ?? String(id)) : String(id),
            ) ?? [],
          slaThresholdType: (l as any).slaThresholdType ?? "fixed",
          slaThresholdPercent: (l as any).slaThresholdPercent,
          isActive: l.isActive,
        })),
      }),
    );

    setFormData({
      name: fullMatrix.name,
      description: fullMatrix.description || "",
      escalationMode: fullMatrix.escalationMode,
      scopeMode: (fullMatrix as any).scopeMode || "PRIORITY",
      categoryIds:
        (fullMatrix as any).categoryIds?.map((id: any) =>
          typeof id === "object" ? (id._id ?? String(id)) : String(id),
        ) || [],
      priorityMode: fullMatrix.priorityMode || "SAME_FOR_ALL",
      allowSkipLevel: fullMatrix.allowSkipLevel || false,
      allowBackward: fullMatrix.allowBackward || false,
      autoEscalate: fullMatrix.autoEscalate || false,
      slaWarningConfig: fullMatrix.slaWarningConfig
        ? {
            warningThresholds:
              fullMatrix.slaWarningConfig.warningThresholds || [],
            notifyAssignedAgent:
              fullMatrix.slaWarningConfig.notifyAssignedAgent ?? true,
          }
        : undefined,
      levels: mappedLevels,
      priorityConfigs: mappedPriorityConfigs,
      projectIds: fullMatrix.projectIds.map((p) =>
        typeof p === "object" ? p._id : p,
      ),
      applicablePriorities: fullMatrix.applicablePriorities || [],
      isActive: fullMatrix.isActive,
    });

    // Queue priorities to be restored after they're fetched (projectIds change triggers fetch)
    // If no applicablePriorities stored, try to derive from priorityConfigs or matrix name
    let prioritiesToRestore: string[] = [];

    if (
      fullMatrix.applicablePriorities &&
      fullMatrix.applicablePriorities.length > 0
    ) {
      prioritiesToRestore = fullMatrix.applicablePriorities;
    } else if (
      fullMatrix.priorityMode === "PER_PRIORITY" &&
      mappedPriorityConfigs.length > 0
    ) {
      prioritiesToRestore = mappedPriorityConfigs.map((c) => c.priorityCode);
    } else {
      // Try to derive from matrix name (e.g., "MHCET LOW" -> "Low")
      const matrixNameLower = fullMatrix.name.toLowerCase();
      if (matrixNameLower.includes("low")) prioritiesToRestore.push("Low");
      if (matrixNameLower.includes("medium"))
        prioritiesToRestore.push("Medium");
      if (matrixNameLower.includes("high")) prioritiesToRestore.push("High");
      if (matrixNameLower.includes("critical"))
        prioritiesToRestore.push("Critical");
      if (matrixNameLower.includes("urgent"))
        prioritiesToRestore.push("Urgent");
      if (matrixNameLower.includes("normal"))
        prioritiesToRestore.push("Normal");
    }

    console.log("📝 Edit matrix - priorities to restore:", prioritiesToRestore);

    if (prioritiesToRestore.length > 0) {
      setPendingPrioritiesToRestore(prioritiesToRestore);
      if (
        fullMatrix.priorityMode === "PER_PRIORITY" &&
        mappedPriorityConfigs.length > 0
      ) {
        setActivePriorityTab(mappedPriorityConfigs[0].priorityCode);
      }
    } else {
      // No priorities found, will need to select manually
      setActivePriorityTab("");
      setSelectedPriorities([]);
    }

    // Restore linked categories
    // If scopeMode is CATEGORY, use the embedded categoryIds from the matrix;
    // otherwise fall back to the legacy linkedCategories join records.
    const savedScopeMode = (fullMatrix as any).scopeMode || "PRIORITY";
    if (
      savedScopeMode === "CATEGORY" &&
      (fullMatrix as any).categoryIds?.length > 0
    ) {
      setLinkedCategoryIds(
        (fullMatrix as any).categoryIds.map((id: any) =>
          typeof id === "object" ? (id._id ?? String(id)) : String(id),
        ),
      );
      setShouldInferCategoryScope(true);
    } else {
      setLinkedCategoryIds(
        (fullMatrix.linkedCategories || []).map((lc) => lc.categoryId),
      );
      setShouldInferCategoryScope(
        savedScopeMode === "CATEGORY" &&
          (fullMatrix.linkedCategories || []).length > 0,
      );
    }

    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError("Matrix name is required");
      return;
    }

    const isCategoryMode = formData.scopeMode === "CATEGORY";

    // Helper: check level has a valid assignee (role or user)
    const levelHasAssignee = (l: EscalationLevelFormData) =>
      l.assigneeType === "user" ? !!l.assigneeUserId : !!l.roleId;

    if (isCategoryMode) {
      // Category mode validation
      if (linkedCategoryIds.length === 0) {
        setError(
          "Please select at least one category for a category-scoped matrix",
        );
        return;
      }
      if (formData.levels.length === 0) {
        setError("At least one escalation level is required");
        return;
      }
      const invalidLevels = formData.levels.filter((l) => !levelHasAssignee(l));
      if (invalidLevels.length > 0) {
        setError("All levels must have a role or user assigned");
        return;
      }
    } else {
      // Priority mode validation
      if (formData.priorityMode === "PER_PRIORITY") {
        const invalidConfigs = (formData.priorityConfigs || []).filter(
          (config) => {
            if (config.levels.length === 0) return true;
            return config.levels.some((l) => !levelHasAssignee(l));
          },
        );
        if (invalidConfigs.length > 0) {
          setError(
            `All priority configurations must have at least one level with a role or user assigned. Check: ${invalidConfigs.map((c) => c.priorityCode).join(", ")}`,
          );
          return;
        }
      } else {
        // SAME_FOR_ALL mode
        if (formData.levels.length === 0) {
          setError("At least one escalation level is required");
          return;
        }
        const invalidLevels = formData.levels.filter(
          (l) => !levelHasAssignee(l),
        );
        if (invalidLevels.length > 0) {
          setError("All levels must have a role or user assigned");
          return;
        }
      }

      // Validate at least one priority is selected
      if (selectedPriorities.length === 0 && priorities.length > 0) {
        setError("Please select at least one priority");
        return;
      }
    }

    // Convert selected priority IDs to priority codes (names in uppercase)
    const priorityCodes = selectedPriorities.map((id) => {
      const priority = priorities.find((p) => p._id === id);
      return priority?.name?.toUpperCase() || id;
    });

    // Prepare save data
    const saveData: EscalationMatrixFormData = {
      ...formData,
      applicablePriorities: isCategoryMode ? [] : priorityCodes,
      categoryIds: isCategoryMode ? linkedCategoryIds : [],
    };

    // Strip assigneeUserName (display-only, not sent to backend)
    const stripDisplayFields = (l: EscalationLevelFormData) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { assigneeUserName, ...rest } = l as any;
      return rest;
    };
    saveData.levels = saveData.levels.map(stripDisplayFields);
    if (saveData.priorityConfigs) {
      saveData.priorityConfigs = saveData.priorityConfigs.map((pc) => ({
        ...pc,
        levels: pc.levels.map(stripDisplayFields),
      }));
    }

    console.log("🔄 Escalation Matrix Save - saveData:", {
      name: saveData.name,
      scopeMode: saveData.scopeMode,
      escalationMode: saveData.escalationMode,
      priorityMode: saveData.priorityMode,
      categoryIds: saveData.categoryIds,
      applicablePriorities: saveData.applicablePriorities,
      levelsCount: saveData.levels.length,
      priorityConfigsCount: saveData.priorityConfigs?.length || 0,
    });

    try {
      setSaving(true);
      setError(null);

      let response;
      if (editingMatrix?._id) {
        console.log("📤 Updating matrix with ID:", editingMatrix._id);
        response = await updateEscalationMatrix(editingMatrix._id, saveData);
      } else {
        console.log("📤 Creating new matrix");
        response = await createEscalationMatrix(saveData);
      }

      if (response.success) {
        const savedMatrixId = response.data?._id || editingMatrix?._id;

        // For PRIORITY-scoped matrices only: sync legacy CategoryEscalationConfig records
        // (CATEGORY-scoped matrices embed categoryIds directly on the matrix — no join records needed)
        if (!isCategoryMode && savedMatrixId) {
          if (linkedCategoryIds.length > 0) {
            const token = localStorage.getItem("authToken");
            await Promise.allSettled(
              linkedCategoryIds.map((catId) =>
                fetch(
                  `${API_CONFIG.API_URL}/categories/${catId}/escalation-config`,
                  {
                    method: "PUT",
                    headers: {
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
                    },
                    credentials: "include",
                    body: JSON.stringify({
                      escalationMatrixId: savedMatrixId,
                      isActive: true,
                    }),
                  },
                ),
              ),
            );
          }
          if (editingMatrix?.linkedCategories) {
            const removedCatIds = editingMatrix.linkedCategories
              .map((lc) => lc.categoryId)
              .filter((id) => !linkedCategoryIds.includes(id));
            if (removedCatIds.length > 0) {
              const token = localStorage.getItem("authToken");
              await Promise.allSettled(
                removedCatIds.map((catId) =>
                  fetch(
                    `${API_CONFIG.API_URL}/categories/${catId}/escalation-config`,
                    {
                      method: "PUT",
                      headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                      },
                      credentials: "include",
                      body: JSON.stringify({
                        escalationMatrixId: savedMatrixId,
                        isActive: false,
                      }),
                    },
                  ),
                ),
              );
            }
          }
        }

        setShowModal(false);
        fetchMatrices();
      } else {
        setError(response.message || "Failed to save matrix");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (matrix: EscalationMatrix) => {
    if (!matrix._id) return;

    if (
      !confirm(
        `Are you sure you want to delete "${matrix.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const response = await deleteEscalationMatrix(matrix._id);
      if (response.success) {
        fetchMatrices();
      } else {
        setError(response.message || "Failed to delete matrix");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (matrix: EscalationMatrix) => {
    if (!matrix._id) return;

    try {
      const response = await toggleEscalationMatrixStatus(matrix._id);
      if (response.success) {
        fetchMatrices();
      } else {
        setError(response.message || "Failed to toggle status");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Helper function to get current levels based on priority mode
  const getCurrentLevels = (): EscalationLevelFormData[] => {
    if (formData.priorityMode === "PER_PRIORITY" && activePriorityTab) {
      const config = formData.priorityConfigs?.find(
        (c) => c.priorityCode === activePriorityTab,
      );
      return config?.levels || [];
    }
    return formData.levels;
  };

  // Helper function to update current levels based on priority mode
  const setCurrentLevels = (newLevels: EscalationLevelFormData[]) => {
    if (formData.priorityMode === "PER_PRIORITY" && activePriorityTab) {
      const updatedConfigs = (formData.priorityConfigs || []).map((c) =>
        c.priorityCode === activePriorityTab ? { ...c, levels: newLevels } : c,
      );
      setFormData({ ...formData, priorityConfigs: updatedConfigs });
    } else {
      setFormData({ ...formData, levels: newLevels });
    }
  };

  const addLevel = () => {
    const currentLevels = getCurrentLevels();
    const maxLevel = Math.max(0, ...currentLevels.map((l) => l.levelNumber));
    const newLevels = [
      ...currentLevels,
      {
        levelNumber: maxLevel + 1,
        levelName: `Level ${maxLevel + 1}`,
        assigneeType: "role" as "role" | "user",
        roleId: "",
        assigneeUserId: "",
        slaHours: 24,
        slaUnit: "hrs" as SlaUnit,
        levelType: "reassign" as "reassign" | "notify",
        notifyUserIds: [] as string[],
        ccUserIds: [] as string[],
        ccRoleIds: [] as string[],
        slaThresholdType: "fixed" as "fixed" | "percent",
        isActive: true,
      },
    ];
    setCurrentLevels(newLevels);
  };

  const removeLevel = (index: number) => {
    const currentLevels = getCurrentLevels();
    if (currentLevels.length <= 1) {
      setError("At least one level is required");
      return;
    }
    const newLevels = currentLevels.filter((_, i) => i !== index);
    setCurrentLevels(newLevels);
  };

  const updateLevel = (
    index: number,
    field: keyof EscalationLevelFormData,
    value: any,
  ) => {
    const currentLevels = getCurrentLevels();
    const newLevels = currentLevels.map((level, i) =>
      i === index ? { ...level, [field]: value } : level,
    );
    setCurrentLevels(newLevels);
  };

  const moveLevel = (index: number, direction: "up" | "down") => {
    const currentLevels = getCurrentLevels();
    const newLevels = [...currentLevels];
    const newIndex = direction === "up" ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= newLevels.length) return;

    const temp = newLevels[index].levelNumber;
    newLevels[index].levelNumber = newLevels[newIndex].levelNumber;
    newLevels[newIndex].levelNumber = temp;

    [newLevels[index], newLevels[newIndex]] = [
      newLevels[newIndex],
      newLevels[index],
    ];

    setCurrentLevels(newLevels);
  };

  const getRoleName = (roleId: string | undefined) => {
    if (!roleId) return "Unknown";
    const role = roles.find((r) => r._id === roleId);
    return role?.name || "Unknown";
  };

  const getAssigneeLabelForLevel = (level: any): string => {
    if (level.assigneeType === "user") {
      const u = level.assigneeUserId;
      if (!u) return "Unknown User";
      if (typeof u === "object") {
        return (
          [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          u.email ||
          "Unknown User"
        );
      }
      // plain ID — try to match from projectUsers (loaded during edit)
      const found = projectUsers.find((pu) => pu._id === String(u));
      if (found)
        return (
          [found.firstName, found.lastName].filter(Boolean).join(" ") ||
          found.email
        );
      return "User";
    }
    // role mode
    const rid = level.roleId;
    if (rid !== null && typeof rid === "object")
      return (rid as any).name || "Unknown";
    return getRoleName(rid as string);
  };

  // Convert resolution time to hours
  const getResolutionTimeInHours = (priority: Priority): number => {
    const { value, unit } = priority.resolutionTime;
    switch (unit) {
      case "minutes":
        return value / 60;
      case "hours":
        return value;
      case "days":
        return value * 24;
      default:
        return value;
    }
  };

  // Convert SLA level time to hours
  const getLevelTimeInHours = (level: EscalationLevelFormData): number => {
    const unit = level.slaUnit || "hrs";
    switch (unit) {
      case "mins":
        return level.slaHours / 60;
      case "hrs":
        return level.slaHours;
      case "days":
        return level.slaHours * 24;
      default:
        return level.slaHours;
    }
  };

  // Calculate total SLA hours for all levels
  const calculateTotalLevelHours = (
    levels: EscalationLevelFormData[],
  ): number => {
    return levels.reduce(
      (total, level) => total + getLevelTimeInHours(level),
      0,
    );
  };

  // Validate levels against priority resolution time
  const validateLevelsAgainstPriority = (
    priorityId: string,
  ): {
    valid: boolean;
    totalHours: number;
    maxHours: number;
    message: string;
  } => {
    const priority = priorities.find((p) => p._id === priorityId);
    if (!priority)
      return { valid: true, totalHours: 0, maxHours: 0, message: "" };

    const maxHours = getResolutionTimeInHours(priority);
    let levels: EscalationLevelFormData[] = [];

    if (formData.priorityMode === "PER_PRIORITY") {
      const config = formData.priorityConfigs?.find(
        (c) => c.priorityCode === priorityId,
      );
      levels = config?.levels || [];
    } else {
      levels = formData.levels;
    }

    const totalHours = calculateTotalLevelHours(levels);
    const valid = totalHours <= maxHours;

    return {
      valid,
      totalHours,
      maxHours,
      message: valid
        ? ""
        : `Total SLA time (${totalHours.toFixed(1)}h) exceeds resolution time (${maxHours}h) for ${priority.name}`,
    };
  };

  // Toggle priority selection
  const togglePrioritySelection = (priorityCode: string) => {
    setSelectedPriorities((prev) => {
      if (prev.includes(priorityCode)) {
        return prev.filter((p) => p !== priorityCode);
      } else {
        return [...prev, priorityCode];
      }
    });
  };

  // Select all priorities
  const selectAllPriorities = () => {
    setSelectedPriorities(priorities.map((p) => p._id));
  };

  // Format time for display
  const formatResolutionTime = (priority: Priority): string => {
    const { value, unit } = priority.resolutionTime;
    return `${value} ${unit}`;
  };

  return (
    <>
      {/* Description and Action Button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
          Configure level-based escalation routing for tickets
        </p>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={handleToggleCoverage}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              backgroundColor: showCoverage ? "#ede9fe" : "white",
              color: showCoverage ? "#7c3aed" : "#6b7280",
              border: `1px solid ${showCoverage ? "#7c3aed" : "#e5e7eb"}`,
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
            title="Coverage Report"
          >
            📊 Coverage
          </button>
          <button
            onClick={fetchMatrices}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              backgroundColor: "white",
              color: "#6b7280",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
            title="Refresh"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
          <button
            onClick={openCreateModal}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              backgroundColor: "#7c3aed",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <PlusIcon className="w-5 h-5" />
            Create Matrix
          </button>
        </div>
      </div>

      {/* US-ESC-011: Coverage Report Panel */}
      {showCoverage && (
        <div
          style={{
            marginBottom: "24px",
            background: "white",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              Escalation Matrix Coverage Report
            </h3>
            <button
              onClick={fetchCoverageReport}
              disabled={coverageLoading}
              style={{
                fontSize: "12px",
                color: "#7c3aed",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              {coverageLoading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
          {coverageLoading ? (
            <div
              style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}
            >
              Loading coverage data…
            </div>
          ) : coverageData.length === 0 ? (
            <div
              style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}
            >
              No open tickets found.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      color: "#374151",
                      fontWeight: 600,
                    }}
                  >
                    Project
                  </th>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "right",
                      color: "#374151",
                      fontWeight: 600,
                    }}
                  >
                    Open Tickets
                  </th>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "right",
                      color: "#374151",
                      fontWeight: 600,
                    }}
                  >
                    With Matrix
                  </th>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "right",
                      color: "#374151",
                      fontWeight: 600,
                    }}
                  >
                    Without Matrix
                  </th>
                  <th
                    style={{
                      padding: "10px 16px",
                      textAlign: "right",
                      color: "#374151",
                      fontWeight: 600,
                    }}
                  >
                    Coverage %
                  </th>
                </tr>
              </thead>
              <tbody>
                {coverageData.map((row, i) => (
                  <tr
                    key={row.projectId || i}
                    style={{ borderTop: "1px solid #f3f4f6" }}
                  >
                    <td style={{ padding: "10px 16px", color: "#111827" }}>
                      {row.projectName}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        textAlign: "right",
                        color: "#6b7280",
                      }}
                    >
                      {row.openTickets}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        textAlign: "right",
                        color: "#059669",
                      }}
                    >
                      {row.withMatrix}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        textAlign: "right",
                        color: row.withoutMatrix > 0 ? "#ef4444" : "#6b7280",
                      }}
                    >
                      {row.withoutMatrix}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background:
                            row.coveragePct >= 80
                              ? "#dcfce7"
                              : row.coveragePct >= 50
                                ? "#fef9c3"
                                : "#fee2e2",
                          color:
                            row.coveragePct >= 80
                              ? "#166534"
                              : row.coveragePct >= 50
                                ? "#854d0e"
                                : "#991b1b",
                        }}
                      >
                        {row.coveragePct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "16px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <ExclamationTriangleIcon
            className="w-5 h-5"
            style={{ color: "#ef4444", marginRight: "8px" }}
          />
          <span style={{ color: "#b91c1c" }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: "#ef4444",
              cursor: "pointer",
              fontSize: "18px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Matrices List */}
      {loading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "48px 0",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "3px solid #e5e7eb",
              borderTopColor: "#7c3aed",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      ) : matrices.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px",
            backgroundColor: "#f9fafb",
            borderRadius: "8px",
          }}
        >
          <ArrowsRightLeftIcon
            className="w-12 h-12"
            style={{ color: "#9ca3af", margin: "0 auto 16px" }}
          />
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: "#111827",
              marginBottom: "8px",
            }}
          >
            No Escalation Matrices
          </h3>
          <p style={{ color: "#6b7280", marginBottom: "16px" }}>
            Create your first escalation matrix to get started.
          </p>
          <button
            onClick={openCreateModal}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              backgroundColor: "#7c3aed",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <PlusIcon className="w-5 h-5" />
            Create Matrix
          </button>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ backgroundColor: "#f9fafb" }}>
              <tr>
                <th
                  style={{
                    padding: "12px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Matrix Name
                </th>
                <th
                  style={{
                    padding: "12px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Mode
                </th>
                <th
                  style={{
                    padding: "12px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Levels
                </th>
                <th
                  style={{
                    padding: "12px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Categories
                </th>
                <th
                  style={{
                    padding: "12px 24px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: "12px 24px",
                    textAlign: "right",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {matrices.map((matrix) => (
                <React.Fragment key={matrix._id}>
                  <tr style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "16px 24px" }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <button
                          onClick={() =>
                            matrix._id && toggleRowExpansion(matrix._id)
                          }
                          style={{
                            background: "none",
                            border: "none",
                            padding: "4px",
                            marginRight: "8px",
                            cursor: "pointer",
                            color: "#9ca3af",
                          }}
                        >
                          {matrix._id && expandedRows.has(matrix._id) ? (
                            <ChevronUpIcon className="w-5 h-5" />
                          ) : (
                            <ChevronDownIcon className="w-5 h-5" />
                          )}
                        </button>
                        <div>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: 500,
                              color: "#111827",
                            }}
                          >
                            {matrix.name}
                          </div>
                          {matrix.description && (
                            <div style={{ fontSize: "14px", color: "#6b7280" }}>
                              {matrix.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "4px 10px",
                          borderRadius: "9999px",
                          fontSize: "12px",
                          fontWeight: 500,
                          backgroundColor:
                            matrix.escalationMode === "SEQUENTIAL"
                              ? "#dbeafe"
                              : "#ede9fe",
                          color:
                            matrix.escalationMode === "SEQUENTIAL"
                              ? "#1e40af"
                              : "#6d28d9",
                        }}
                      >
                        {matrix.escalationMode === "SEQUENTIAL" ? (
                          <>
                            <ArrowUpIcon
                              className="w-3 h-3"
                              style={{ marginRight: "4px" }}
                            />
                            Sequential
                          </>
                        ) : (
                          <>
                            <ArrowsRightLeftIcon
                              className="w-3 h-3"
                              style={{ marginRight: "4px" }}
                            />
                            Random
                          </>
                        )}
                      </span>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginTop: "4px",
                        }}
                      >
                        {matrix.autoEscalate && (
                          <span
                            style={{ marginRight: "8px", color: "#d97706" }}
                          >
                            Auto ✓
                          </span>
                        )}
                        {matrix.escalationMode === "RANDOM" &&
                          matrix.allowSkipLevel && (
                            <span style={{ marginRight: "8px" }}>Skip ✓</span>
                          )}
                        {matrix.allowBackward && <span>Back ✓</span>}
                      </div>
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <span style={{ fontSize: "14px", color: "#111827" }}>
                        {matrix.priorityMode === "PER_PRIORITY" &&
                        (matrix as any).priorityConfigs?.length > 0
                          ? (matrix as any).priorityConfigs.reduce(
                              (sum: number, pc: any) =>
                                sum + (pc.levels?.length || 0),
                              0,
                            )
                          : matrix.levels.length}{" "}
                        levels
                      </span>
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      {(() => {
                        // Prefer embedded categoryIds (new schema) if present,
                        // fall back to legacy linkedCategoriesCount join records.
                        const catCount =
                          (matrix as any).categoryIds?.length || 0;
                        const count =
                          catCount > 0
                            ? catCount
                            : matrix.linkedCategoriesCount || 0;
                        return count > 0 ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 10px",
                              borderRadius: "9999px",
                              fontSize: "12px",
                              fontWeight: 500,
                              backgroundColor: "#ede9fe",
                              color: "#6d28d9",
                            }}
                          >
                            🏷️ {count}
                          </span>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                            —
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <button
                        onClick={() => handleToggleStatus(matrix)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "4px 10px",
                          borderRadius: "9999px",
                          fontSize: "12px",
                          fontWeight: 500,
                          backgroundColor: matrix.isActive
                            ? "#dcfce7"
                            : "#f3f4f6",
                          color: matrix.isActive ? "#166534" : "#6b7280",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {matrix.isActive ? (
                          <>
                            <CheckCircleIcon
                              className="w-3 h-3"
                              style={{ marginRight: "4px" }}
                            />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircleIcon
                              className="w-3 h-3"
                              style={{ marginRight: "4px" }}
                            />
                            Inactive
                          </>
                        )}
                      </button>
                    </td>
                    <td style={{ padding: "16px 24px", textAlign: "right" }}>
                      <button
                        onClick={() => openEditModal(matrix)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#4f46e5",
                          cursor: "pointer",
                          marginRight: "16px",
                        }}
                      >
                        <PencilIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(matrix)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#dc2626",
                          cursor: "pointer",
                        }}
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                  {/* Expanded Row */}
                  {matrix._id && expandedRows.has(matrix._id) && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: "16px 24px",
                          backgroundColor: "#f9fafb",
                        }}
                      >
                        <div style={{ marginLeft: "32px" }}>
                          <h4
                            style={{
                              fontSize: "14px",
                              fontWeight: 500,
                              color: "#111827",
                              marginBottom: "12px",
                            }}
                          >
                            Escalation Levels
                          </h4>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            {(matrix.priorityMode === "PER_PRIORITY" &&
                            (matrix as any).priorityConfigs?.length > 0
                              ? (matrix as any).priorityConfigs.flatMap(
                                  (pc: any) =>
                                    (pc.levels || []).map((l: any) => ({
                                      ...l,
                                      _priorityLabel:
                                        pc.priorityName || pc.priorityCode,
                                    })),
                                )
                              : matrix.levels
                            )
                              .sort(
                                (a: any, b: any) =>
                                  a.levelNumber - b.levelNumber,
                              )
                              .map((level: any, idx: number) => (
                                <div
                                  key={level._id || idx}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "12px",
                                    backgroundColor: "white",
                                    borderRadius: "8px",
                                    border: "1px solid #e5e7eb",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "32px",
                                      height: "32px",
                                      backgroundColor: "#e0e7ff",
                                      color: "#4f46e5",
                                      borderRadius: "50%",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontWeight: 500,
                                    }}
                                  >
                                    {level.levelNumber}
                                  </div>
                                  <div style={{ marginLeft: "16px", flex: 1 }}>
                                    <div
                                      style={{
                                        fontSize: "14px",
                                        fontWeight: 500,
                                        color: "#111827",
                                      }}
                                    >
                                      {level.levelName}
                                      {(level as any)._priorityLabel && (
                                        <span
                                          style={{
                                            fontSize: "11px",
                                            color: "#6d28d9",
                                            marginLeft: "6px",
                                            fontWeight: 400,
                                          }}
                                        >
                                          [{(level as any)._priorityLabel}]
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "14px",
                                        color: "#6b7280",
                                      }}
                                    >
                                      {(level as any).assigneeType === "user"
                                        ? "User"
                                        : "Role"}
                                      : {getAssigneeLabelForLevel(level)}
                                      {" | "}
                                      SLA: {level.slaHours}
                                      {(level as any).slaUnit === "mins"
                                        ? "m"
                                        : (level as any).slaUnit === "days"
                                          ? "d"
                                          : "h"}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      padding: "4px 8px",
                                      borderRadius: "4px",
                                      backgroundColor: level.isActive
                                        ? "#dcfce7"
                                        : "#f3f4f6",
                                      color: level.isActive
                                        ? "#166534"
                                        : "#6b7280",
                                    }}
                                  >
                                    {level.isActive ? "Active" : "Inactive"}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              padding: "16px",
            }}
          >
            {/* Backdrop */}
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(107, 114, 128, 0.75)",
              }}
              onClick={() => setShowModal(false)}
            />

            {/* Modal */}
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "768px",
                backgroundColor: "white",
                borderRadius: "8px",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "16px 24px",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <h3
                  style={{
                    fontSize: "18px",
                    fontWeight: 500,
                    color: "#111827",
                  }}
                >
                  {editingMatrix
                    ? "Edit Escalation Matrix"
                    : "Create Escalation Matrix"}
                </h3>
              </div>

              <div
                style={{
                  padding: "24px",
                  maxHeight: "70vh",
                  overflowY: "auto",
                }}
              >
                {/* Form Error */}
                {error && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "12px",
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "8px",
                      color: "#b91c1c",
                      fontSize: "14px",
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* Basic Info */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#374151",
                        marginBottom: "4px",
                      }}
                    >
                      Matrix Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      placeholder="e.g., Support Escalation Matrix"
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#374151",
                        marginBottom: "4px",
                      }}
                    >
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        fontSize: "14px",
                        resize: "vertical",
                      }}
                      rows={2}
                      placeholder="Optional description..."
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#374151",
                        marginBottom: "4px",
                      }}
                    >
                      Projects
                    </label>
                    <select
                      multiple
                      value={formData.projectIds}
                      onChange={(e) => {
                        const selected = Array.from(
                          e.target.selectedOptions,
                          (opt) => opt.value,
                        );
                        setFormData({ ...formData, projectIds: selected });
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      size={3}
                    >
                      {(projects || []).map((project) => (
                        <option key={project._id} value={project._id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginTop: "4px",
                      }}
                    >
                      Hold Ctrl/Cmd to select multiple projects
                    </p>
                  </div>
                </div>

                {/* Matrix Scope Mode — shown after a project is selected */}
                {formData.projectIds.length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h4
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#374151",
                        marginBottom: "4px",
                      }}
                    >
                      Matrix Scope *
                    </h4>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginBottom: "12px",
                      }}
                    >
                      Choose whether this matrix applies based on ticket
                      priority or ticket category.
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        marginBottom: "16px",
                      }}
                    >
                      {/* Priority-based card */}
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, scopeMode: "PRIORITY" })
                        }
                        style={{
                          flex: 1,
                          padding: "14px 16px",
                          border:
                            formData.scopeMode !== "CATEGORY"
                              ? "2px solid #7c3aed"
                              : "2px solid #e5e7eb",
                          borderRadius: "8px",
                          textAlign: "left",
                          backgroundColor:
                            formData.scopeMode !== "CATEGORY"
                              ? "#f5f3ff"
                              : "white",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "14px",
                            color: "#374151",
                            marginBottom: "4px",
                          }}
                        >
                          🎯 Priority-based
                        </div>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            margin: 0,
                          }}
                        >
                          Matrix applies to all tickets matching selected
                          priorities (High, Medium, Low…)
                        </p>
                      </button>
                      {/* Category-based card */}
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, scopeMode: "CATEGORY" })
                        }
                        style={{
                          flex: 1,
                          padding: "14px 16px",
                          border:
                            formData.scopeMode === "CATEGORY"
                              ? "2px solid #0891b2"
                              : "2px solid #e5e7eb",
                          borderRadius: "8px",
                          textAlign: "left",
                          backgroundColor:
                            formData.scopeMode === "CATEGORY"
                              ? "#ecfeff"
                              : "white",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "14px",
                            color: "#374151",
                            marginBottom: "4px",
                          }}
                        >
                          🏷️ Category-based
                        </div>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            margin: 0,
                          }}
                        >
                          Matrix applies only to tickets in specific categories
                        </p>
                      </button>
                    </div>

                    {/* Category selection — shown only when CATEGORY scope is chosen */}
                    {formData.scopeMode === "CATEGORY" && (
                      <div
                        style={{
                          padding: "16px",
                          backgroundColor: "#f0fdff",
                          borderRadius: "8px",
                          border: "1px solid #a5f3fc",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#0e7490",
                            marginBottom: "10px",
                          }}
                        >
                          1. Select ticket flow
                        </p>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(170px, 1fr))",
                            gap: "8px",
                            marginBottom: "16px",
                          }}
                        >
                          {CATEGORY_SCOPE_OPTIONS.map((option) => {
                            const active = categoryScope === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  handleCategoryScopeChange(option.value)
                                }
                                style={{
                                  border: active
                                    ? "2px solid #0891b2"
                                    : "1px solid #d1d5db",
                                  borderRadius: "8px",
                                  backgroundColor: active ? "#ecfeff" : "white",
                                  padding: "10px 12px",
                                  textAlign: "left",
                                  cursor: "pointer",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 700,
                                    color: active ? "#0e7490" : "#111827",
                                    marginBottom: "3px",
                                  }}
                                >
                                  {option.label}
                                </div>
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#6b7280",
                                    lineHeight: 1.35,
                                  }}
                                >
                                  {option.hint}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <p
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#0e7490",
                            marginBottom: "10px",
                          }}
                        >
                          2. Select categories this matrix applies to *
                        </p>
                        {categoriesLoading ? (
                          <p style={{ fontSize: "13px", color: "#6b7280" }}>
                            Loading categories…
                          </p>
                        ) : scopedCategories.length === 0 ? (
                          <p
                            style={{
                              fontSize: "13px",
                              color: "#9ca3af",
                              fontStyle: "italic",
                            }}
                          >
                            No{" "}
                            {categoryScope === "normal"
                              ? "normal ticket"
                              : categoryScope}{" "}
                            categories found for this project.
                          </p>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "12px",
                            }}
                          >
                            {groupedCategories.map((group) => (
                              <div key={group.level}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginBottom: "6px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: "#164e63",
                                    }}
                                  >
                                    Level {group.level}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "#64748b",
                                    }}
                                  >
                                    {group.categories.length} item
                                    {group.categories.length === 1 ? "" : "s"}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "repeat(auto-fill, minmax(260px, 1fr))",
                                    gap: "8px",
                                  }}
                                >
                                  {group.categories.map((cat) => {
                                    const checked = linkedCategoryIds.includes(
                                      cat._id,
                                    );
                                    return (
                                      <label
                                        key={cat._id}
                                        style={{
                                          display: "flex",
                                          alignItems: "flex-start",
                                          padding: "10px 12px",
                                          border: checked
                                            ? "2px solid #0891b2"
                                            : "1px solid #e5e7eb",
                                          borderRadius: "8px",
                                          backgroundColor: checked
                                            ? "#ecfeff"
                                            : "white",
                                          cursor: "pointer",
                                          fontSize: "13px",
                                          gap: "8px",
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            setLinkedCategoryIds((prev) =>
                                              checked
                                                ? prev.filter(
                                                    (id) => id !== cat._id,
                                                  )
                                                : [...prev, cat._id],
                                            );
                                          }}
                                          style={{ marginTop: "2px" }}
                                        />
                                        <span
                                          style={{
                                            color: "#374151",
                                            fontWeight: checked ? 600 : 400,
                                            lineHeight: 1.35,
                                          }}
                                        >
                                          <span
                                            style={{
                                              display: "inline-block",
                                              fontSize: "11px",
                                              color: "#0891b2",
                                              fontWeight: 700,
                                              marginRight: "6px",
                                            }}
                                          >
                                            L{getCategoryLevel(cat)}
                                          </span>
                                          {getCategoryPath(cat)}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {linkedCategoryIds.length > 0 && (
                          <p
                            style={{
                              fontSize: "12px",
                              color: "#0891b2",
                              marginTop: "8px",
                            }}
                          >
                            {linkedCategoryIds.length}{" "}
                            {linkedCategoryIds.length === 1
                              ? "category"
                              : "categories"}{" "}
                            selected
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Escalation Mode */}
                <div
                  style={{
                    marginBottom: "24px",
                    padding: "16px",
                    backgroundColor: "#f9fafb",
                    borderRadius: "8px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "#374151",
                      marginBottom: "12px",
                    }}
                  >
                    Escalation Mode *
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          escalationMode: "SEQUENTIAL",
                          allowSkipLevel: false,
                        })
                      }
                      style={{
                        padding: "16px",
                        border:
                          formData.escalationMode === "SEQUENTIAL"
                            ? "2px solid #7c3aed"
                            : "2px solid #e5e7eb",
                        borderRadius: "8px",
                        textAlign: "left",
                        backgroundColor:
                          formData.escalationMode === "SEQUENTIAL"
                            ? "#f5f3ff"
                            : "white",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "8px",
                        }}
                      >
                        <ArrowUpIcon
                          className="w-5 h-5"
                          style={{ marginRight: "8px", color: "#2563eb" }}
                        />
                        <span style={{ fontWeight: 500 }}>Sequential</span>
                      </div>
                      <p style={{ fontSize: "12px", color: "#6b7280" }}>
                        Escalation allowed only to the immediate next/previous
                        level
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, escalationMode: "RANDOM" })
                      }
                      style={{
                        padding: "16px",
                        border:
                          formData.escalationMode === "RANDOM"
                            ? "2px solid #7c3aed"
                            : "2px solid #e5e7eb",
                        borderRadius: "8px",
                        textAlign: "left",
                        backgroundColor:
                          formData.escalationMode === "RANDOM"
                            ? "#f5f3ff"
                            : "white",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "8px",
                        }}
                      >
                        <ArrowsRightLeftIcon
                          className="w-5 h-5"
                          style={{ marginRight: "8px", color: "#7c3aed" }}
                        />
                        <span style={{ fontWeight: 500 }}>Random</span>
                      </div>
                      <p style={{ fontSize: "12px", color: "#6b7280" }}>
                        Escalation allowed to multiple levels based on
                        configuration
                      </p>
                    </button>
                  </div>

                  {/* Sequential Mode Options */}
                  {formData.escalationMode === "SEQUENTIAL" && (
                    <div
                      style={{
                        marginTop: "16px",
                        paddingLeft: "16px",
                        borderLeft: "2px solid #bfdbfe",
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={formData.allowBackward}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              allowBackward: e.target.checked,
                            })
                          }
                          style={{ marginRight: "8px" }}
                        />
                        <span style={{ fontSize: "14px", color: "#374151" }}>
                          Allow Backward Escalation
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginLeft: "8px",
                          }}
                        >
                          (e.g., L2 → L1)
                        </span>
                      </label>
                    </div>
                  )}

                  {/* Random Mode Options */}
                  {formData.escalationMode === "RANDOM" && (
                    <div
                      style={{
                        marginTop: "16px",
                        paddingLeft: "16px",
                        borderLeft: "2px solid #c4b5fd",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={formData.allowSkipLevel}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              allowSkipLevel: e.target.checked,
                            })
                          }
                          style={{ marginRight: "8px" }}
                        />
                        <span style={{ fontSize: "14px", color: "#374151" }}>
                          Allow Skip Level
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginLeft: "8px",
                          }}
                        >
                          (e.g., L1 → L3)
                        </span>
                      </label>

                      <label style={{ display: "flex", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={formData.allowBackward}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              allowBackward: e.target.checked,
                            })
                          }
                          style={{ marginRight: "8px" }}
                        />
                        <span style={{ fontSize: "14px", color: "#374151" }}>
                          Allow Backward Escalation
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginLeft: "8px",
                          }}
                        >
                          (e.g., L3 → L1)
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Auto Escalation */}
                <div
                  style={{
                    marginBottom: "24px",
                    padding: "16px",
                    backgroundColor: "#fffbeb",
                    borderRadius: "8px",
                    border: "1px solid #fcd34d",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={formData.autoEscalate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          autoEscalate: e.target.checked,
                        })
                      }
                      style={{ marginRight: "8px" }}
                    />
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#374151",
                      }}
                    >
                      Enable Auto Escalation
                    </span>
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      marginTop: "4px",
                      marginLeft: "24px",
                    }}
                  >
                    Automatically escalate tickets to the next level when SLA
                    timeline is breached
                  </p>

                  {/* US-ESC-008: SLA Warning Thresholds (shown when autoEscalate is on) */}
                  {formData.autoEscalate && (
                    <div
                      style={{
                        marginTop: "16px",
                        paddingLeft: "16px",
                        borderLeft: "2px solid #fcd34d",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#374151",
                          marginBottom: "8px",
                        }}
                      >
                        ⏱ SLA Warning Thresholds
                      </p>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginBottom: "10px",
                        }}
                      >
                        Send warning emails when SLA time consumed reaches these
                        percentages (e.g. 50, 75, 90). Separate multiple values
                        with commas.
                      </p>
                      <input
                        type="text"
                        placeholder="e.g. 50, 75, 90"
                        value={(
                          formData.slaWarningConfig?.warningThresholds || []
                        ).join(", ")}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const thresholds = raw
                            .split(",")
                            .map((s) => parseInt(s.trim(), 10))
                            .filter((n) => !isNaN(n) && n > 0 && n <= 100);
                          setFormData({
                            ...formData,
                            slaWarningConfig: {
                              warningThresholds: thresholds,
                              notifyAssignedAgent:
                                formData.slaWarningConfig
                                  ?.notifyAssignedAgent ?? true,
                            },
                          });
                        }}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          fontSize: "13px",
                          marginBottom: "8px",
                          boxSizing: "border-box",
                        }}
                      />
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "13px",
                          color: "#374151",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            formData.slaWarningConfig?.notifyAssignedAgent ??
                            true
                          }
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              slaWarningConfig: {
                                warningThresholds:
                                  formData.slaWarningConfig
                                    ?.warningThresholds || [],
                                notifyAssignedAgent: e.target.checked,
                              },
                            })
                          }
                        />
                        Notify assigned agent
                      </label>
                    </div>
                  )}
                </div>

                {/* Priority Selection - Only shown for Priority-scoped matrices */}
                {formData.projectIds.length > 0 &&
                  formData.scopeMode !== "CATEGORY" && (
                    <div style={{ marginBottom: "24px" }}>
                      <h4
                        style={{
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "#374151",
                          marginBottom: "8px",
                        }}
                      >
                        Select Priorities *
                      </h4>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginBottom: "12px",
                        }}
                      >
                        Choose which priorities this escalation matrix applies
                        to. Resolution time (RT) is shown for each priority.
                      </p>

                      {priorities.length === 0 ? (
                        <div
                          style={{
                            padding: "16px",
                            backgroundColor: "#fef3c7",
                            borderRadius: "8px",
                            border: "1px solid #fcd34d",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontSize: "13px",
                              color: "#92400e",
                            }}
                          >
                            ⚠️ No priorities found for this project. Please
                            create priorities first from the Priority tab.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Select All Button */}
                          <div style={{ marginBottom: "12px" }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  selectedPriorities.length ===
                                  priorities.length
                                ) {
                                  setSelectedPriorities([]);
                                  setFormData({
                                    ...formData,
                                    priorityMode: "SAME_FOR_ALL",
                                  });
                                } else {
                                  selectAllPriorities();
                                  setFormData({
                                    ...formData,
                                    priorityMode: "SAME_FOR_ALL",
                                  });
                                }
                              }}
                              style={{
                                padding: "8px 16px",
                                backgroundColor:
                                  selectedPriorities.length ===
                                  priorities.length
                                    ? "#10b981"
                                    : "#f3f4f6",
                                color:
                                  selectedPriorities.length ===
                                  priorities.length
                                    ? "white"
                                    : "#374151",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "13px",
                                fontWeight: 500,
                                cursor: "pointer",
                              }}
                            >
                              {selectedPriorities.length === priorities.length
                                ? "✓ All Priorities Selected (Same escalation for all)"
                                : "Select All Priorities"}
                            </button>
                          </div>

                          {/* Priority Checkboxes */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fill, minmax(250px, 1fr))",
                              gap: "8px",
                              marginBottom: "16px",
                            }}
                          >
                            {priorities.map((priority) => {
                              const isSelected = selectedPriorities.includes(
                                priority._id,
                              );
                              const validation = isSelected
                                ? validateLevelsAgainstPriority(priority._id)
                                : null;

                              return (
                                <label
                                  key={priority._id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "12px",
                                    border: isSelected
                                      ? "2px solid #8b5cf6"
                                      : "1px solid #e5e7eb",
                                    borderRadius: "8px",
                                    backgroundColor: isSelected
                                      ? "#f5f3ff"
                                      : "white",
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      togglePrioritySelection(priority._id);
                                      // If unchecking and this was the active tab, switch to another
                                      if (
                                        isSelected &&
                                        activePriorityTab === priority._id
                                      ) {
                                        const remaining =
                                          selectedPriorities.filter(
                                            (p) => p !== priority._id,
                                          );
                                        setActivePriorityTab(
                                          remaining[0] || "",
                                        );
                                      }
                                      // If checking and no active tab, set this as active
                                      if (!isSelected && !activePriorityTab) {
                                        setActivePriorityTab(priority._id);
                                      }
                                    }}
                                    style={{
                                      marginRight: "10px",
                                      width: "18px",
                                      height: "18px",
                                    }}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontWeight: 500,
                                          color: "#374151",
                                        }}
                                      >
                                        {priority.name}
                                      </span>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color: "#6b7280",
                                        marginTop: "2px",
                                      }}
                                    >
                                      Resolution:{" "}
                                      <strong>
                                        {formatResolutionTime(priority)}
                                      </strong>{" "}
                                      ({getResolutionTimeInHours(priority)}h)
                                    </div>
                                    {validation && !validation.valid && (
                                      <div
                                        style={{
                                          fontSize: "11px",
                                          color: "#dc2626",
                                          marginTop: "4px",
                                        }}
                                      >
                                        ⚠️ Levels exceed RT (
                                        {validation.totalHours.toFixed(1)}h /{" "}
                                        {validation.maxHours}h)
                                      </div>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>

                          {/* Priority Mode Selection */}
                          {selectedPriorities.length > 1 && (
                            <div
                              style={{
                                marginBottom: "16px",
                                padding: "12px",
                                backgroundColor: "#f9fafb",
                                borderRadius: "8px",
                              }}
                            >
                              <p
                                style={{
                                  fontSize: "13px",
                                  color: "#374151",
                                  margin: "0 0 8px 0",
                                }}
                              >
                                <strong>
                                  Escalation Mode for Selected Priorities:
                                </strong>
                              </p>
                              <div style={{ display: "flex", gap: "12px" }}>
                                <label
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name="priorityModeRadio"
                                    checked={
                                      formData.priorityMode === "SAME_FOR_ALL"
                                    }
                                    onChange={() =>
                                      setFormData({
                                        ...formData,
                                        priorityMode: "SAME_FOR_ALL",
                                      })
                                    }
                                    style={{ marginRight: "6px" }}
                                  />
                                  <span style={{ fontSize: "13px" }}>
                                    Same escalation for all selected priorities
                                  </span>
                                </label>
                                <label
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name="priorityModeRadio"
                                    checked={
                                      formData.priorityMode === "PER_PRIORITY"
                                    }
                                    onChange={() => {
                                      // Initialize per-priority configs for selected priorities
                                      const newConfigs = selectedPriorities.map(
                                        (id) => {
                                          const p = priorities.find(
                                            (pr) => pr._id === id,
                                          );
                                          return {
                                            priorityCode: id,
                                            priorityName: p?.name || id,
                                            levels: [
                                              {
                                                levelNumber: 1,
                                                levelName: "Level 1",
                                                roleId: "",
                                                slaHours: 24,
                                                slaUnit: "hrs" as const,
                                                isActive: true,
                                              },
                                            ],
                                          };
                                        },
                                      );
                                      setFormData({
                                        ...formData,
                                        priorityMode: "PER_PRIORITY",
                                        priorityConfigs: newConfigs,
                                      });
                                      setActivePriorityTab(
                                        selectedPriorities[0],
                                      );
                                    }}
                                    style={{ marginRight: "6px" }}
                                  />
                                  <span style={{ fontSize: "13px" }}>
                                    Different escalation per priority
                                  </span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Per-Priority Tabs */}
                          {formData.priorityMode === "PER_PRIORITY" &&
                            selectedPriorities.length > 0 && (
                              <div style={{ marginTop: "12px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "4px",
                                    borderBottom: "2px solid #e5e7eb",
                                    marginBottom: "12px",
                                    overflowX: "auto",
                                  }}
                                >
                                  {selectedPriorities.map((id) => {
                                    const priority = priorities.find(
                                      (p) => p._id === id,
                                    );
                                    const validation =
                                      validateLevelsAgainstPriority(id);
                                    return (
                                      <button
                                        key={id}
                                        type="button"
                                        onClick={() => setActivePriorityTab(id)}
                                        style={{
                                          padding: "8px 16px",
                                          borderTop: "none",
                                          borderLeft: "none",
                                          borderRight: "none",
                                          borderBottom:
                                            activePriorityTab === id
                                              ? "3px solid #8b5cf6"
                                              : "3px solid transparent",
                                          backgroundColor: "transparent",
                                          cursor: "pointer",
                                          fontWeight:
                                            activePriorityTab === id
                                              ? 600
                                              : 400,
                                          color: !validation.valid
                                            ? "#dc2626"
                                            : activePriorityTab === id
                                              ? "#8b5cf6"
                                              : "#6b7280",
                                          fontSize: "14px",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {priority?.name || id}{" "}
                                        {!validation.valid && "⚠️"}
                                      </button>
                                    );
                                  })}
                                </div>
                                {activePriorityTab && (
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      color: "#6b7280",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    Configure escalation levels for{" "}
                                    <strong>
                                      {priorities.find(
                                        (p) => p._id === activePriorityTab,
                                      )?.name || activePriorityTab}
                                    </strong>{" "}
                                    priority (Resolution:{" "}
                                    {(() => {
                                      const p = priorities.find(
                                        (p) => p._id === activePriorityTab,
                                      );
                                      return p ? formatResolutionTime(p) : "—";
                                    })()}
                                    )
                                  </div>
                                )}
                              </div>
                            )}

                          {/* Validation Summary for SAME_FOR_ALL mode */}
                          {formData.priorityMode === "SAME_FOR_ALL" &&
                            selectedPriorities.length > 0 &&
                            formData.levels.length > 0 && (
                              <div
                                style={{
                                  marginTop: "12px",
                                  padding: "12px",
                                  backgroundColor: "#f9fafb",
                                  borderRadius: "8px",
                                }}
                              >
                                <p
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "#374151",
                                    margin: "0 0 8px 0",
                                  }}
                                >
                                  SLA Validation:
                                </p>
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "8px",
                                  }}
                                >
                                  {selectedPriorities.map((id) => {
                                    const priority = priorities.find(
                                      (p) => p._id === id,
                                    );
                                    const validation =
                                      validateLevelsAgainstPriority(id);
                                    return (
                                      <div
                                        key={id}
                                        style={{
                                          padding: "6px 12px",
                                          borderRadius: "6px",
                                          backgroundColor: validation.valid
                                            ? "#d1fae5"
                                            : "#fee2e2",
                                          border: `1px solid ${validation.valid ? "#10b981" : "#dc2626"}`,
                                          fontSize: "12px",
                                        }}
                                      >
                                        <span style={{ fontWeight: 500 }}>
                                          {priority?.name}
                                        </span>
                                        : {validation.totalHours.toFixed(1)}h /{" "}
                                        {validation.maxHours}h
                                        {validation.valid ? " ✓" : " ✗"}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                        </>
                      )}
                    </div>
                  )}

                {/* Escalation Levels - Show for category mode OR when priorities are selected */}
                {(formData.scopeMode === "CATEGORY"
                  ? linkedCategoryIds.length > 0
                  : selectedPriorities.length > 0 &&
                    (formData.priorityMode === "SAME_FOR_ALL" ||
                      (formData.priorityMode === "PER_PRIORITY" &&
                        activePriorityTab))) && (
                  <div style={{ marginBottom: "24px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "12px",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "#374151",
                        }}
                      >
                        Escalation Levels{" "}
                        {formData.priorityMode === "PER_PRIORITY" &&
                        activePriorityTab
                          ? `(${activePriorityTab})`
                          : ""}{" "}
                        *
                      </label>
                      <button
                        type="button"
                        onClick={addLevel}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "6px 12px",
                          backgroundColor: "white",
                          color: "#4f46e5",
                          border: "1px solid #4f46e5",
                          borderRadius: "6px",
                          fontSize: "14px",
                          cursor: "pointer",
                        }}
                      >
                        <PlusIcon className="w-4 h-4" />
                        Add Level
                      </button>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {getCurrentLevels()
                        .sort((a, b) => a.levelNumber - b.levelNumber)
                        .map((level, index) => (
                          <div
                            key={index}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "12px",
                              backgroundColor: "#f9fafb",
                              borderRadius: "8px",
                            }}
                          >
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                backgroundColor: "#e0e7ff",
                                color: "#4f46e5",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 500,
                                fontSize: "14px",
                              }}
                            >
                              {level.levelNumber}
                            </div>

                            <input
                              type="text"
                              value={level.levelName}
                              onChange={(e) =>
                                updateLevel(index, "levelName", e.target.value)
                              }
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                border: "1px solid #d1d5db",
                                borderRadius: "6px",
                                fontSize: "14px",
                              }}
                              placeholder="Level name"
                            />

                            <select
                              value={level.roleId}
                              onChange={(e) =>
                                updateLevel(index, "roleId", e.target.value)
                              }
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                border: "1px solid #d1d5db",
                                borderRadius: "6px",
                                fontSize: "14px",
                                display:
                                  (level.assigneeType ?? "role") === "user"
                                    ? "none"
                                    : undefined,
                              }}
                            >
                              <option value="">Select Role</option>
                              {(roles || [])
                                .filter((r) => r.code !== "STUDENT")
                                .map((role) => (
                                  <option key={role._id} value={role._id}>
                                    {role.name}
                                  </option>
                                ))}
                            </select>

                            {/* Assignee type toggle: Role / User */}
                            <div
                              style={{
                                display: "flex",
                                gap: "2px",
                                padding: "2px",
                                backgroundColor: "#f3f4f6",
                                borderRadius: "6px",
                                flexShrink: 0,
                              }}
                              title="Assign this level to a Role (any member of the role) or a specific User"
                            >
                              {(["role", "user"] as const).map((at) => (
                                <button
                                  key={at}
                                  type="button"
                                  onClick={() => {
                                    // Single atomic update to avoid stale-state overwrite
                                    const currentLevels = getCurrentLevels();
                                    const newLevels = currentLevels.map(
                                      (l, i) => {
                                        if (i !== index) return l;
                                        const updated = {
                                          ...l,
                                          assigneeType: at as "role" | "user",
                                        };
                                        if (at === "user") updated.roleId = "";
                                        else updated.assigneeUserId = "";
                                        return updated;
                                      },
                                    );
                                    setCurrentLevels(newLevels);
                                  }}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    border: "none",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    backgroundColor:
                                      (level.assigneeType ?? "role") === at
                                        ? "#6366f1"
                                        : "transparent",
                                    color:
                                      (level.assigneeType ?? "role") === at
                                        ? "white"
                                        : "#6b7280",
                                  }}
                                >
                                  {at === "role" ? "Role" : "User"}
                                </button>
                              ))}
                            </div>

                            {/* User picker — shown when assigneeType='user' */}
                            <div
                              style={{
                                flex: 1,
                                display:
                                  (level.assigneeType ?? "role") === "user"
                                    ? "flex"
                                    : "none",
                                flexDirection: "column",
                                gap: "4px",
                              }}
                            >
                              <input
                                type="text"
                                placeholder="Type 3+ characters to search user..."
                                value={levelUserSearch[index] || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setLevelUserSearch((prev) => ({
                                    ...prev,
                                    [index]: val,
                                  }));
                                  searchUsersForLevel(index, val);
                                }}
                                style={{
                                  padding: "6px 10px",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "6px",
                                  fontSize: "13px",
                                  width: "100%",
                                  boxSizing: "border-box",
                                }}
                              />
                              {(levelUserSearch[index]?.length ?? 0) > 0 &&
                                (levelUserSearch[index]?.length ?? 0) < 3 && (
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "#9ca3af",
                                      marginTop: "2px",
                                    }}
                                  >
                                    Type at least 3 characters to search
                                  </div>
                                )}
                              <select
                                value={level.assigneeUserId || ""}
                                onChange={(e) => {
                                  const allCandidates = [
                                    ...(levelSearchResults[index] ?? []),
                                    ...projectUsers,
                                  ];
                                  const user = allCandidates.find(
                                    (u) => u._id === e.target.value,
                                  );
                                  const currentLevels = getCurrentLevels();
                                  const newLevels = currentLevels.map(
                                    (l, i) => {
                                      if (i !== index) return l;
                                      return {
                                        ...l,
                                        assigneeUserId: e.target.value,
                                        assigneeUserName: user
                                          ? [user.firstName, user.lastName]
                                              .filter(Boolean)
                                              .join(" ")
                                          : "",
                                      };
                                    },
                                  );
                                  setCurrentLevels(newLevels);
                                }}
                                style={{
                                  padding: "8px 12px",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "6px",
                                  fontSize: "14px",
                                  width: "100%",
                                }}
                              >
                                <option value="">Select User</option>
                                {/* Always show current selection even if not in search results */}
                                {level.assigneeUserId &&
                                  level.assigneeUserName &&
                                  !(levelSearchResults[index] ?? []).find(
                                    (u) => u._id === level.assigneeUserId,
                                  ) && (
                                    <option value={level.assigneeUserId}>
                                      {level.assigneeUserName}
                                    </option>
                                  )}
                                {(levelUserSearch[index]?.length ?? 0) >= 3
                                  ? (levelSearchResults[index] ?? []).map(
                                      (u) => (
                                        <option key={u._id} value={u._id}>
                                          {[u.firstName, u.lastName]
                                            .filter(Boolean)
                                            .join(" ")}
                                          {u.email ? ` — ${u.email}` : ""}
                                        </option>
                                      ),
                                    )
                                  : projectUsers
                                      .filter((u) => u.role?.code !== "STUDENT")
                                      .map((u) => (
                                        <option key={u._id} value={u._id}>
                                          {[u.firstName, u.lastName]
                                            .filter(Boolean)
                                            .join(" ")}
                                          {u.email ? ` — ${u.email}` : ""}
                                        </option>
                                      ))}
                              </select>
                            </div>

                            {/* SLA hours + unit */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              <input
                                type="number"
                                value={level.slaHours}
                                onChange={(e) =>
                                  updateLevel(
                                    index,
                                    "slaHours",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                style={{
                                  width: "64px",
                                  padding: "8px",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "6px 0 0 6px",
                                  fontSize: "14px",
                                  textAlign: "center",
                                }}
                                min="0"
                              />
                              <select
                                value={level.slaUnit || "hrs"}
                                onChange={(e) =>
                                  updateLevel(
                                    index,
                                    "slaUnit",
                                    e.target.value as SlaUnit,
                                  )
                                }
                                style={{
                                  padding: "8px 6px",
                                  border: "1px solid #d1d5db",
                                  borderLeft: "none",
                                  borderRadius: "0 6px 6px 0",
                                  fontSize: "14px",
                                  backgroundColor: "#f9fafb",
                                  cursor: "pointer",
                                }}
                              >
                                <option value="mins">min</option>
                                <option value="hrs">hrs</option>
                                <option value="days">days</option>
                              </select>
                            </div>

                            {/* US-ESC-007: SLA threshold type toggle */}
                            <div
                              style={{
                                display: "flex",
                                gap: "2px",
                                padding: "2px",
                                backgroundColor: "#f3f4f6",
                                borderRadius: "6px",
                                flexShrink: 0,
                              }}
                              title="Trigger on Fixed time OR when % of overall ticket SLA is consumed"
                            >
                              {(["fixed", "percent"] as const).map((tt) => (
                                <button
                                  key={tt}
                                  type="button"
                                  onClick={() =>
                                    updateLevel(
                                      index,
                                      "slaThresholdType" as keyof EscalationLevelFormData,
                                      tt,
                                    )
                                  }
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    border: "none",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    backgroundColor:
                                      (level.slaThresholdType ?? "fixed") === tt
                                        ? "#6366f1"
                                        : "transparent",
                                    color:
                                      (level.slaThresholdType ?? "fixed") === tt
                                        ? "white"
                                        : "#6b7280",
                                  }}
                                >
                                  {tt === "fixed" ? "Fixed" : "% SLA"}
                                </button>
                              ))}
                            </div>

                            {/* US-ESC-007: percent value input (only when percent mode) */}
                            {(level.slaThresholdType ?? "fixed") ===
                              "percent" && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <input
                                  type="number"
                                  value={level.slaThresholdPercent ?? 75}
                                  onChange={(e) =>
                                    updateLevel(
                                      index,
                                      "slaThresholdPercent" as keyof EscalationLevelFormData,
                                      Math.min(
                                        100,
                                        Math.max(
                                          1,
                                          parseInt(e.target.value) || 75,
                                        ),
                                      ),
                                    )
                                  }
                                  min={1}
                                  max={100}
                                  style={{
                                    width: "54px",
                                    padding: "6px 4px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "6px",
                                    fontSize: "13px",
                                    textAlign: "center",
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: "12px",
                                    color: "#6b7280",
                                  }}
                                >
                                  %
                                </span>
                              </div>
                            )}

                            {/* US-ESC-005: level type toggle */}
                            <div
                              style={{
                                display: "flex",
                                gap: "2px",
                                padding: "2px",
                                backgroundColor: "#f3f4f6",
                                borderRadius: "6px",
                                flexShrink: 0,
                              }}
                              title="Escalation action: Reassign changes who owns the ticket; Notify-only just notifies the escalation role"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  updateLevel(
                                    index,
                                    "levelType" as keyof EscalationLevelFormData,
                                    "reassign",
                                  )
                                }
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  border: "none",
                                  fontSize: "12px",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  backgroundColor:
                                    (level.levelType || "reassign") ===
                                    "reassign"
                                      ? "#3b82f6"
                                      : "transparent",
                                  color:
                                    (level.levelType || "reassign") ===
                                    "reassign"
                                      ? "white"
                                      : "#6b7280",
                                }}
                              >
                                Reassign
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateLevel(
                                    index,
                                    "levelType" as keyof EscalationLevelFormData,
                                    "notify",
                                  )
                                }
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  border: "none",
                                  fontSize: "12px",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  backgroundColor:
                                    level.levelType === "notify"
                                      ? "#f59e0b"
                                      : "transparent",
                                  color:
                                    level.levelType === "notify"
                                      ? "white"
                                      : "#6b7280",
                                }}
                              >
                                Notify
                              </button>
                            </div>

                            {/* US-ESC-006: notify user picker (shown when levelType='notify') */}
                            {level.levelType === "notify" && (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "4px",
                                  minWidth: "160px",
                                  maxWidth: "220px",
                                }}
                                title="Also notify specific users (optional). Leave empty to notify only the escalation role."
                              >
                                <span
                                  style={{
                                    fontSize: "11px",
                                    color: "#6b7280",
                                    fontWeight: 500,
                                  }}
                                >
                                  Also notify
                                </span>
                                <select
                                  multiple
                                  value={level.notifyUserIds ?? []}
                                  onChange={(e) => {
                                    const selected = Array.from(
                                      e.target.selectedOptions,
                                    ).map((o) => o.value);
                                    updateLevel(
                                      index,
                                      "notifyUserIds" as keyof EscalationLevelFormData,
                                      selected,
                                    );
                                  }}
                                  style={{
                                    padding: "4px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    height: "72px",
                                    cursor: "pointer",
                                  }}
                                >
                                  {notifyUsers.map((u) => (
                                    <option key={u._id} value={u._id}>
                                      {u.firstName} {u.lastName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Per-level CC — users + roles notified on this
                                level's escalation, regardless of level type. */}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                                minWidth: "160px",
                                maxWidth: "220px",
                              }}
                              title="CC on this level's escalation. Notified in addition to the assignee. Leave empty for none."
                            >
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "#6b7280",
                                  fontWeight: 500,
                                }}
                              >
                                CC users
                              </span>
                              <select
                                multiple
                                value={level.ccUserIds ?? []}
                                onChange={(e) => {
                                  const selected = Array.from(
                                    e.target.selectedOptions,
                                  ).map((o) => o.value);
                                  updateLevel(
                                    index,
                                    "ccUserIds" as keyof EscalationLevelFormData,
                                    selected,
                                  );
                                }}
                                style={{
                                  padding: "4px",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  height: "60px",
                                  cursor: "pointer",
                                }}
                              >
                                {notifyUsers.map((u) => (
                                  <option key={u._id} value={u._id}>
                                    {u.firstName} {u.lastName}
                                  </option>
                                ))}
                              </select>
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "#6b7280",
                                  fontWeight: 500,
                                }}
                              >
                                CC roles
                              </span>
                              <select
                                multiple
                                value={level.ccRoleIds ?? []}
                                onChange={(e) => {
                                  const selected = Array.from(
                                    e.target.selectedOptions,
                                  ).map((o) => o.value);
                                  updateLevel(
                                    index,
                                    "ccRoleIds" as keyof EscalationLevelFormData,
                                    selected,
                                  );
                                }}
                                style={{
                                  padding: "4px",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  height: "60px",
                                  cursor: "pointer",
                                }}
                              >
                                {roles.map((r) => (
                                  <option key={r._id} value={r._id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => moveLevel(index, "up")}
                                disabled={index === 0}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: index === 0 ? "#d1d5db" : "#9ca3af",
                                  cursor: index === 0 ? "default" : "pointer",
                                }}
                              >
                                <ChevronUpIcon className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveLevel(index, "down")}
                                disabled={
                                  index === getCurrentLevels().length - 1
                                }
                                style={{
                                  background: "none",
                                  border: "none",
                                  color:
                                    index === getCurrentLevels().length - 1
                                      ? "#d1d5db"
                                      : "#9ca3af",
                                  cursor:
                                    index === getCurrentLevels().length - 1
                                      ? "default"
                                      : "pointer",
                                }}
                              >
                                <ChevronDownIcon className="w-4 h-4" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeLevel(index)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#dc2626",
                                cursor: "pointer",
                              }}
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Active Status */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "flex", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData({ ...formData, isActive: e.target.checked })
                      }
                      style={{ marginRight: "8px" }}
                    />
                    <span style={{ fontSize: "14px", color: "#374151" }}>
                      Active
                    </span>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  padding: "16px 24px",
                  backgroundColor: "#f9fafb",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "12px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "10px 20px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    color: "#374151",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: "10px 20px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: saving ? "#9ca3af" : "#7c3aed",
                    color: "white",
                    fontSize: "14px",
                    cursor: saving ? "default" : "pointer",
                  }}
                >
                  {saving ? "Saving..." : editingMatrix ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default EscalationMatrixContent;
