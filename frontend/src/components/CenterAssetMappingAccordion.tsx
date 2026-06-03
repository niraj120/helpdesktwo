import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  MdExpandMore,
  MdExpandLess,
  MdSave,
  MdRefresh,
  MdCheckCircle,
  MdClose,
  MdContentCopy,
} from "react-icons/md";
import { API_CONFIG } from "../config/constants";
import { usePermissions } from "../hooks/usePermissions";
import { PERMISSIONS } from "../constants/permissions";
import DashboardLayout from "./DashboardLayout";
import ModuleHeader from "./ModuleHeader";

interface Asset {
  _id: string;
  name: string;
  category?: any;
  predefinedCount: number;
  unit?: string;
  description?: string;
  icon?: string;
}

interface Project {
  _id: string;
  projectName: string;
  name: string;
  isActive: boolean;
}

interface Center {
  _id: string;
  centerName: string;
  projectId: string;
  projectName: string;
  address: string;
  city: string;
  state: string;
}

interface CenterAssetMapping {
  _id: string;
  projectId: {
    _id: string;
    projectName: string;
  };
  assetId: {
    _id: string;
    name: string;
    category?: string;
    unit?: string;
    predefinedCount?: number;
  };
  totalAssigned: number;
  assetUsed: number;
  assetNotUsed: number;
  workingAsset: number;
  notWorkingAsset: number;
  lastAuditDate?: string;
  auditFrequencyMonths?: number;
  nextAuditDate?: string;
}

interface CenterAssetSelection {
  centerId: string;
  centerName: string;
  selectedAssets: string[];
  assetQuantities: { [assetId: string]: number };
  lastAuditDate?: string;
  auditFrequencyMonths?: number;
  auditStartDate?: string;
  nextAuditDate?: string;
}

const CenterAssetMappingAccordion: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [mappings, setMappings] = useState<CenterAssetMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [expandedCenters, setExpandedCenters] = useState<Set<string>>(
    new Set(),
  );
  const [assetSearchTerm, setAssetSearchTerm] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>(""); // Separate input state for debouncing

  // Track selections per center
  const [centerSelections, setCenterSelections] = useState<{
    [centerId: string]: CenterAssetSelection;
  }>({});

  // View mode: 'mapping' or 'listing'
  const [viewMode, setViewMode] = useState<"mapping" | "listing">("mapping");

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const canMapToCenter =
    hasPermission(PERMISSIONS.ASSET_MAP_TO_CENTER) ||
    hasPermission(PERMISSIONS.ASSET_MANAGE);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchAssets();
      fetchCenters();
    }
  }, [selectedProject]);

  // Fetch mappings after centers are loaded (only once per project)
  useEffect(() => {
    if (selectedProject && centers.length > 0) {
      fetchMappings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, centers.length]);

  // Debounced search - update assetSearchTerm after 300ms of user stopping typing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setAssetSearchTerm(searchInput.trim());
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  const fetchAssets = async () => {
    if (!selectedProject) return;

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/assets?projectId=${selectedProject}&isActive=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        },
      );
      const data = await response.json();
      setAssets(data.data || []);
    } catch (error) {
      console.error("Failed to fetch assets:", error);
    }
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/projects?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await response.json();

      let projectsData = [];
      if (data.success && data.data && Array.isArray(data.data.projects)) {
        projectsData = data.data.projects;
      } else if (data.success && Array.isArray(data.data)) {
        projectsData = data.data;
      } else if (Array.isArray(data.projects)) {
        projectsData = data.projects;
      }

      const activeProjects = projectsData.filter(
        (p: any) => p.isActive !== false,
      );
      setProjects(activeProjects);
      if (activeProjects.length > 0 && !selectedProject) {
        setSelectedProject(activeProjects[0]._id);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  };

  const fetchCenters = async () => {
    if (!selectedProject) return;

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/centers?projectId=${selectedProject}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        },
      );
      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        const mappedCenters = data.data.map((center: any) => ({
          _id: center._id,
          centerName: center.centerName,
          projectId: center.projectId
            ? center.projectId._id || center.projectId
            : "",
          projectName: center.projectId
            ? center.projectId.name ||
              center.projectId.projectName ||
              "Unknown Project"
            : "Unknown Project",
          address: center.address,
          city: center.city,
          state: center.state,
        }));
        setCenters(mappedCenters);

        // DON'T initialize empty selections here - let fetchMappings handle it
      }
    } catch (error) {
      console.error("Failed to fetch centers:", error);
    }
  };

  const fetchMappings = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/center-assets?projectId=${selectedProject}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        },
      );
      const data = await response.json();
      setMappings(data.data || []);

      // Build centerSelections from fetched mappings
      // NOTE: Mappings are stored at PROJECT level, so all centers in same project share same asset allocation
      if (data.data && Array.isArray(data.data)) {
        const newSelections: { [centerId: string]: CenterAssetSelection } = {};

        // Preserve existing user input values first
        const existingSelections = { ...centerSelections };

        // Initialize all centers with empty selections
        centers.forEach((center: Center) => {
          newSelections[center._id] = {
            centerId: center._id,
            centerName: center.centerName,
            selectedAssets: [],
            assetQuantities: {},
          };
        });

        // Populate from existing mappings - mappings use projectId which matches our selectedProject
        data.data.forEach((mapping: CenterAssetMapping) => {
          // Guard against null populated refs (e.g. deleted assets/projects)
          const mappingProjectId =
            mapping.projectId != null && typeof mapping.projectId === "object"
              ? mapping.projectId._id
              : mapping.projectId;
          const assetId =
            mapping.assetId != null && typeof mapping.assetId === "object"
              ? mapping.assetId._id
              : mapping.assetId;
          if (!assetId) return; // skip mappings whose asset was deleted

          const applyToCenter = (center: Center) => {
            if (!newSelections[center._id]) return;
            if (!newSelections[center._id].selectedAssets.includes(assetId)) {
              newSelections[center._id].selectedAssets.push(assetId);
            }
            const existingQty =
              existingSelections[center._id]?.assetQuantities?.[assetId];
            newSelections[center._id].assetQuantities[assetId] =
              existingQty !== undefined ? existingQty : mapping.totalAssigned;
            if (!newSelections[center._id].lastAuditDate) {
              newSelections[center._id].lastAuditDate =
                existingSelections[center._id]?.lastAuditDate ||
                mapping.lastAuditDate;
            }
            if (!newSelections[center._id].auditFrequencyMonths) {
              newSelections[center._id].auditFrequencyMonths =
                existingSelections[center._id]?.auditFrequencyMonths ||
                mapping.auditFrequencyMonths;
            }
            if (!newSelections[center._id].auditStartDate) {
              newSelections[center._id].auditStartDate =
                existingSelections[center._id]?.auditStartDate ||
                mapping.lastAuditDate;
            }
            if (!newSelections[center._id].nextAuditDate) {
              newSelections[center._id].nextAuditDate =
                existingSelections[center._id]?.nextAuditDate ||
                mapping.nextAuditDate;
            }
          };

          const mappingCenterId = (mapping as any).centerId;
          if (mappingCenterId) {
            // Per-center mapping: apply only to the specific center
            const specificCenter = centers.find(
              (c) => c._id === String(mappingCenterId),
            );
            if (specificCenter) applyToCenter(specificCenter);
          } else {
            // Legacy project-level mapping: apply to ALL centers in this project
            centers.forEach((center: Center) => {
              if (
                center.projectId === selectedProject ||
                center.projectId === mappingProjectId
              ) {
                applyToCenter(center);
              }
            });
          }
        });

        setCenterSelections(newSelections);
      }
    } catch (error: any) {
      showMessage("error", error.message || "Failed to fetch mappings");
    } finally {
      setLoading(false);
    }
  };

  const toggleCenter = useCallback((centerId: string) => {
    setExpandedCenters((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(centerId)) {
        newSet.delete(centerId);
      } else {
        newSet.add(centerId);
      }
      return newSet;
    });
  }, []);

  const toggleAssetForCenter = (centerId: string, assetId: string) => {
    setCenterSelections((prev) => {
      const existingSelection = prev[centerId];
      const centerSelection = {
        centerId,
        centerName: centers.find((c) => c._id === centerId)?.centerName || "",
        selectedAssets: existingSelection?.selectedAssets
          ? [...existingSelection.selectedAssets]
          : [],
        assetQuantities: existingSelection?.assetQuantities
          ? { ...existingSelection.assetQuantities }
          : {},
      };

      const isSelected = centerSelection.selectedAssets.includes(assetId);

      if (isSelected) {
        // Remove from selection
        centerSelection.selectedAssets = centerSelection.selectedAssets.filter(
          (id) => id !== assetId,
        );
        delete centerSelection.assetQuantities[assetId];
      } else {
        // Add to selection
        centerSelection.selectedAssets = [
          ...centerSelection.selectedAssets,
          assetId,
        ];
        // Default quantity is the asset's predefined count
        const asset = assets.find((a) => a._id === assetId);
        centerSelection.assetQuantities[assetId] = asset?.predefinedCount || 0;
      }

      return {
        ...prev,
        [centerId]: centerSelection,
      };
    });
  };

  const updateAssetQuantity = (
    centerId: string,
    assetId: string,
    quantity: number,
  ) => {
    setCenterSelections((prev) => {
      const existingSelection = prev[centerId];
      const centerData = {
        centerId,
        centerName: centers.find((c) => c._id === centerId)?.centerName || "",
        selectedAssets: existingSelection?.selectedAssets || [],
        assetQuantities: existingSelection?.assetQuantities
          ? { ...existingSelection.assetQuantities }
          : {},
        nextAuditDate: existingSelection?.nextAuditDate,
      };

      centerData.assetQuantities[assetId] = Math.max(0, quantity);

      return {
        ...prev,
        [centerId]: centerData,
      };
    });
  };

  const updateNextAuditDate = (centerId: string, date: string) => {
    setCenterSelections((prev) => {
      const existingSelection = prev[centerId];
      return {
        ...prev,
        [centerId]: {
          ...existingSelection,
          centerId,
          centerName: centers.find((c) => c._id === centerId)?.centerName || "",
          selectedAssets: existingSelection?.selectedAssets || [],
          assetQuantities: existingSelection?.assetQuantities || {},
          nextAuditDate: date || undefined,
        },
      };
    });
  };

  const updateAuditFrequency = (
    centerId: string,
    frequencyMonths: number | null,
  ) => {
    setCenterSelections((prev) => {
      const existingSelection = prev[centerId];

      if (frequencyMonths === null) {
        // Clear audit data when "Select frequency" is chosen
        const updated = { ...existingSelection };
        delete updated.lastAuditDate;
        delete updated.auditFrequencyMonths;
        delete updated.auditStartDate;
        delete updated.nextAuditDate;

        return {
          ...prev,
          [centerId]: updated,
        };
      }

      // Use existing start date or default to today
      const startDate = existingSelection?.auditStartDate
        ? new Date(existingSelection.auditStartDate)
        : new Date();

      // Calculate nextAuditDate = startDate + frequencyMonths for preview
      const nextAudit = new Date(startDate);
      nextAudit.setMonth(nextAudit.getMonth() + frequencyMonths);
      const nextAuditDate = nextAudit.toISOString();

      console.log("🔔 Setting audit schedule:", {
        centerId,
        centerName: centers.find((c) => c._id === centerId)?.centerName,
        startDate: startDate.toISOString(),
        frequencyMonths,
        nextAuditDate,
      });

      return {
        ...prev,
        [centerId]: {
          ...existingSelection,
          centerId,
          centerName: centers.find((c) => c._id === centerId)?.centerName || "",
          selectedAssets: existingSelection?.selectedAssets || [],
          assetQuantities: existingSelection?.assetQuantities || {},
          lastAuditDate: startDate.toISOString(),
          auditFrequencyMonths: frequencyMonths,
          auditStartDate: startDate.toISOString(),
          nextAuditDate,
        },
      };
    });
  };

  const updateAuditStartDate = (centerId: string, startDate: string) => {
    setCenterSelections((prev) => {
      const existingSelection = prev[centerId];

      if (!startDate) {
        return prev;
      }

      const start = new Date(startDate);

      // Recalculate nextAuditDate if frequency is already set
      let nextAuditDate: string | undefined;
      if (existingSelection?.auditFrequencyMonths) {
        const nextAudit = new Date(start);
        nextAudit.setMonth(
          nextAudit.getMonth() + existingSelection.auditFrequencyMonths,
        );
        nextAuditDate = nextAudit.toISOString();
      }

      console.log("📅 Updating audit start date:", {
        centerId,
        centerName: centers.find((c) => c._id === centerId)?.centerName,
        startDate: start.toISOString(),
        frequencyMonths: existingSelection?.auditFrequencyMonths,
        nextAuditDate,
      });

      return {
        ...prev,
        [centerId]: {
          ...existingSelection,
          centerId,
          centerName: centers.find((c) => c._id === centerId)?.centerName || "",
          selectedAssets: existingSelection?.selectedAssets || [],
          assetQuantities: existingSelection?.assetQuantities || {},
          lastAuditDate: start.toISOString(),
          auditStartDate: start.toISOString(),
          ...(nextAuditDate ? { nextAuditDate } : {}),
        },
      };
    });
  };

  const applyToAllCenters = (
    sourceCenterId: string,
    sourceAssets: string[],
    sourceQuantities: { [assetId: string]: number },
  ) => {
    if (
      !window.confirm(
        `This will apply the same asset selection and quantities to all ${centers.length} centers. Continue?`,
      )
    ) {
      return;
    }

    // Use the source center selection directly (no fragile asset-match lookup)
    const sourceSel = centerSelections[sourceCenterId];

    setCenterSelections((prev) => {
      const newSelections: { [key: string]: CenterAssetSelection } = {};

      // Apply to ALL centers (not just ones already in state)
      centers.forEach((center) => {
        newSelections[center._id] = {
          ...prev[center._id],
          centerId: center._id,
          centerName: center.centerName,
          selectedAssets: [...sourceAssets],
          assetQuantities: { ...sourceQuantities },
          lastAuditDate: sourceSel?.lastAuditDate,
          auditStartDate: sourceSel?.auditStartDate,
          auditFrequencyMonths: sourceSel?.auditFrequencyMonths,
          nextAuditDate: sourceSel?.nextAuditDate,
        };
      });

      return newSelections;
    });
    showMessage(
      "success",
      `Applied selection to all ${centers.length} centers`,
    );
  };

  const toggleSelectAllAssetsForCenter = (centerId: string) => {
    const selection = centerSelections[centerId] || {
      centerId,
      centerName: centers.find((c) => c._id === centerId)?.centerName || "",
      selectedAssets: [],
      assetQuantities: {},
    };
    const allSelected =
      selection?.selectedAssets?.length === filteredAssets.length;

    if (allSelected) {
      // Deselect all
      setCenterSelections((prev) => ({
        ...prev,
        [centerId]: {
          ...prev[centerId],
          selectedAssets: [],
          assetQuantities: {},
        },
      }));
    } else {
      // Select all filtered assets
      const allAssetIds = filteredAssets.map((a) => a._id);
      const allQuantities: { [key: string]: number } = {};
      filteredAssets.forEach((asset) => {
        allQuantities[asset._id] = asset.predefinedCount;
      });
      setCenterSelections((prev) => ({
        ...prev,
        [centerId]: {
          ...prev[centerId],
          selectedAssets: allAssetIds,
          assetQuantities: allQuantities,
        },
      }));
    }
  };

  const saveMapping = async (centerId: string) => {
    const selection = centerSelections[centerId];
    if (!selection) {
      showMessage("error", "No selection data for this center");
      return;
    }

    if (!selectedProject) {
      showMessage("error", "Please select a project first");
      return;
    }

    // Helper: get currently-mapped assetIds for this center from DB state.
    // Handles BOTH per-center mappings (have centerId) and legacy project-level
    // mappings (only have projectId, no centerId).
    const getExistingAssetIds = (): string[] => {
      return mappings
        .filter((m) => {
          if (!m.assetId) return false;
          const mCenterId = (m as any).centerId;
          if (mCenterId) {
            // Per-center mapping
            return String(mCenterId) === centerId;
          }
          // Legacy project-level mapping: belongs to every center in this project
          const mProjectId =
            m.projectId != null && typeof m.projectId === "object"
              ? (m.projectId as any)._id
              : m.projectId;
          return String(mProjectId) === selectedProject;
        })
        .map((m) =>
          typeof m.assetId === "object" ? m.assetId._id : m.assetId,
        );
    };

    // Assets that were previously in DB but are now deselected
    const removedAssetIds = getExistingAssetIds().filter(
      (id) => !selection.selectedAssets.includes(id),
    );

    // Validate: Check if any asset exceeds available quantity
    const overAllocatedAssets: string[] = [];
    for (const assetId of selection.selectedAssets) {
      const asset = assets.find((a) => a._id === assetId);
      if (!asset) continue;

      const totalAssigned = getTotalAssignedForAsset(assetId);
      if (totalAssigned > asset.predefinedCount) {
        overAllocatedAssets.push(
          `${asset.name} (${totalAssigned}/${asset.predefinedCount})`,
        );
      }
    }

    if (overAllocatedAssets.length > 0) {
      showMessage(
        "error",
        `Cannot save! Over-allocated assets: ${overAllocatedAssets.join(", ")}. Please reduce quantities.`,
      );
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");

      // Create individual mappings for each asset with quantities
      let successCount = 0;
      let errorCount = 0;

      for (const assetId of selection.selectedAssets) {
        const quantity = selection.assetQuantities[assetId] || 0;

        console.log("Saving asset mapping:", {
          assetId,
          projectId: selectedProject,
          quantity,
          nextAuditDate: selection.nextAuditDate,
          auditFrequencyMonths: selection.auditFrequencyMonths,
        });

        try {
          const response = await fetch(
            `${API_CONFIG.API_URL}/center-assets/bulk-map`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              credentials: "include",
              body: JSON.stringify({
                assetIds: [assetId],
                centerIds: [centerId], // Map to center, not project
                projectId: selectedProject, // Keep project for reference
                applyToAllCenters: false,
                quantities: { [centerId]: quantity }, // Map quantity to center ID
                lastAuditDate: selection.lastAuditDate,
                auditFrequencyMonths: selection.auditFrequencyMonths,
                nextAuditDate: selection.nextAuditDate,
              }),
            },
          );

          console.log("📤 Sending to API:", {
            assetId,
            lastAuditDate: selection.lastAuditDate,
            auditFrequencyMonths: selection.auditFrequencyMonths,
            nextAuditDate: selection.nextAuditDate,
          });

          const data = await response.json();
          console.log("Save response:", data);

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }

      if (errorCount === 0) {
        showMessage(
          "success",
          `Mapping saved for ${selection.centerName} (${successCount} assets)`,
        );
      } else {
        showMessage(
          "error",
          `Saved ${successCount} assets, ${errorCount} failed`,
        );
      }

      // Delete DB mappings for assets that were unchecked (both per-center and legacy)
      if (removedAssetIds.length > 0) {
        try {
          const unmapToken = localStorage.getItem("authToken");
          const unmapRes = await fetch(
            `${API_CONFIG.API_URL}/center-assets/unmap`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${unmapToken}`,
              },
              credentials: "include",
              body: JSON.stringify({
                centerId,
                projectId: selectedProject, // needed for legacy mappings
                assetIds: removedAssetIds,
              }),
            },
          );
          const unmapData = await unmapRes.json();
          console.log("🗑️ Unmap result:", unmapData);
        } catch (_) {
          // Non-blocking: refresh will reflect actual DB state
        }
      }

      fetchMappings();
    } catch (error: any) {
      showMessage("error", error.message || "Failed to save mapping");
    } finally {
      setLoading(false);
    }
  };

  const saveAllMappings = async () => {
    if (!selectedProject) {
      showMessage("error", "Please select a project first");
      return;
    }

    // Validate: Check if any asset exceeds available quantity across all centers
    const overAllocatedAssets: string[] = [];
    const checkedAssets = new Set<string>();

    for (const centerId of Object.keys(centerSelections)) {
      const selection = centerSelections[centerId];
      if (selection.selectedAssets.length === 0) continue;

      for (const assetId of selection.selectedAssets) {
        if (checkedAssets.has(assetId)) continue;
        checkedAssets.add(assetId);

        const asset = assets.find((a) => a._id === assetId);
        if (!asset) continue;

        const totalAssigned = getTotalAssignedForAsset(assetId);
        if (totalAssigned > asset.predefinedCount) {
          overAllocatedAssets.push(
            `${asset.name} (${totalAssigned}/${asset.predefinedCount})`,
          );
        }
      }
    }

    if (overAllocatedAssets.length > 0) {
      showMessage(
        "error",
        `Cannot save! Over-allocated assets: ${overAllocatedAssets.join(", ")}. Please reduce quantities.`,
      );
      return;
    }

    try {
      setLoading(true);
      setSavingAll(true);
      let successCount = 0;
      let errorCount = 0;
      let totalAssets = 0;

      for (const centerId of Object.keys(centerSelections)) {
        const selection = centerSelections[centerId];
        if (selection.selectedAssets.length === 0) continue;

        for (const assetId of selection.selectedAssets) {
          const quantity = selection.assetQuantities[assetId] || 0;
          totalAssets++;

          try {
            const token = localStorage.getItem("authToken");
            const response = await fetch(
              `${API_CONFIG.API_URL}/center-assets/bulk-map`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                credentials: "include",
                body: JSON.stringify({
                  assetIds: [assetId],
                  centerIds: [centerId], // Map to center, not project
                  projectId: selectedProject, // Keep project for reference
                  applyToAllCenters: false,
                  quantities: { [centerId]: quantity }, // Map quantity to center ID
                  lastAuditDate: selection.lastAuditDate,
                  auditFrequencyMonths: selection.auditFrequencyMonths,
                }),
              },
            );

            console.log("📤 Bulk sending to API:", {
              centerId,
              assetId,
              lastAuditDate: selection.lastAuditDate,
              auditFrequencyMonths: selection.auditFrequencyMonths,
              nextAuditDate: selection.nextAuditDate,
            });

            const data = await response.json();

            if (response.ok) {
              successCount++;
            } else {
              errorCount++;
            }
          } catch (error) {
            errorCount++;
          }
        }
      }

      if (errorCount === 0) {
        showMessage(
          "success",
          `All mappings saved successfully (${successCount}/${totalAssets} assets)`,
        );
      } else {
        showMessage(
          "error",
          `Saved ${successCount}/${totalAssets} assets, ${errorCount} failed`,
        );
      }

      // Delete DB mappings for assets that were unchecked in any center
      const token2 = localStorage.getItem("authToken");
      for (const cId of Object.keys(centerSelections)) {
        const sel = centerSelections[cId];
        const existingIds = mappings
          .filter((m) => {
            if (!m.assetId) return false;
            const mCenterId = (m as any).centerId;
            if (mCenterId) {
              return String(mCenterId) === cId;
            }
            // Legacy project-level mapping
            const mProjectId =
              m.projectId != null && typeof m.projectId === "object"
                ? (m.projectId as any)._id
                : m.projectId;
            return String(mProjectId) === selectedProject;
          })
          .map((m) =>
            typeof m.assetId === "object" ? m.assetId._id : m.assetId,
          );
        const removedIds = existingIds.filter(
          (id) => !sel.selectedAssets.includes(id),
        );
        if (removedIds.length > 0) {
          try {
            await fetch(`${API_CONFIG.API_URL}/center-assets/unmap`, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token2}`,
              },
              credentials: "include",
              body: JSON.stringify({
                centerId: cId,
                projectId: selectedProject,
                assetIds: removedIds,
              }),
            });
          } catch (_) {
            /* Non-blocking */
          }
        }
      }

      fetchMappings();
    } catch (error: any) {
      showMessage("error", error.message || "Failed to save mappings");
    } finally {
      setLoading(false);
      setSavingAll(false);
    }
  };

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    // Longer timeout for errors so users have time to read them
    setTimeout(() => setMessage(null), type === "error" ? 8000 : 5000);
  }, []);

  // Memoize expensive calculations
  const getTotalAssignedForAsset = useCallback(
    (assetId: string): number => {
      return Object.values(centerSelections).reduce((total, selection) => {
        return total + (selection.assetQuantities[assetId] || 0);
      }, 0);
    },
    [centerSelections],
  );

  const isAssetOverAllocated = useCallback(
    (assetId: string): boolean => {
      const asset = assets.find((a) => a._id === assetId);
      if (!asset) return false;
      return getTotalAssignedForAsset(assetId) > asset.predefinedCount;
    },
    [assets, getTotalAssignedForAsset],
  );

  // Get mappings for a specific center (memoized)
  const getCenterMappings = useCallback(
    (centerId: string): CenterAssetMapping[] => {
      return mappings.filter((m) => {
        // New per-center mappings: match by centerId field
        const mCenterId = (m as any).centerId;
        if (mCenterId) {
          return String(mCenterId) === centerId;
        }
        // Legacy project-level mappings: safe projectId comparison
        if (!m.projectId) return false;
        const mProjectId =
          typeof m.projectId === "object" ? m.projectId._id : m.projectId;
        return mProjectId === centerId;
      });
    },
    [mappings],
  );

  // Memoize filtered assets to prevent recalculation on every render
  const filteredAssets = useMemo(() => {
    if (!assetSearchTerm) return assets;
    const searchLower = assetSearchTerm.toLowerCase();
    return assets.filter((asset) => {
      const assetName = asset.name.toLowerCase();
      const categoryName = asset.category
        ? (typeof asset.category === "object"
            ? (asset.category as any).name
            : asset.category
          ).toLowerCase()
        : "";
      return (
        assetName.includes(searchLower) || categoryName.includes(searchLower)
      );
    });
  }, [assets, assetSearchTerm]);

  if (viewMode === "listing") {
    return (
      <DashboardLayout>
        <div className="p-6">
          <ModuleHeader
            title="Asset Allocation Report"
            subtitle="View asset distribution and allocation status across all centers"
          />

          <div
            style={{
              marginBottom: "24px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={() => setViewMode("mapping")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                background: "white",
                border: "2px solid #E5E7EB",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Back to Mapping
            </button>
          </div>

          {/* Project Selector */}
          <div className="mb-6 rounded-lg bg-white p-4 shadow">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Select Project <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:w-1/2"
            >
              <option value="">Choose a project...</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {selectedProject && (
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Center Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Mapped Assets
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Units Assigned
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Validation
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {centers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-6 py-4 text-center text-sm text-gray-500"
                        >
                          No centers found
                        </td>
                      </tr>
                    ) : (
                      centers.map((center) => {
                        const centerMappings = getCenterMappings(center._id);
                        const totalUnits = centerMappings.reduce(
                          (sum, m) => sum + m.totalAssigned,
                          0,
                        );

                        return (
                          <tr key={center._id} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                              {center.centerName}
                              <div className="text-xs text-gray-500">
                                {center.city}, {center.state}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {centerMappings.length === 0 ? (
                                <span className="text-sm text-gray-500">
                                  No assets mapped
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  {centerMappings.map((mapping) => (
                                    <div
                                      key={mapping._id}
                                      className="text-sm text-gray-900"
                                    >
                                      • {mapping.assetId.name}
                                      {mapping.assetId.category && (
                                        <span className="ml-2 text-xs text-gray-500">
                                          (
                                          {typeof mapping.assetId.category ===
                                          "object"
                                            ? (mapping.assetId.category as any)
                                                .name
                                            : mapping.assetId.category}
                                          )
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">
                              {centerMappings.length === 0 ? (
                                "-"
                              ) : (
                                <div className="space-y-1">
                                  {centerMappings.map((mapping) => (
                                    <div key={mapping._id}>
                                      {mapping.totalAssigned}{" "}
                                      {mapping.assetId.unit || "units"}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              {centerMappings.length === 0 ? (
                                <span className="text-sm text-gray-500">-</span>
                              ) : (
                                <div className="space-y-1">
                                  {centerMappings.map((mapping) => {
                                    const totalAssigned =
                                      getTotalAssignedForAsset(
                                        mapping.assetId._id,
                                      );
                                    const predefinedCount =
                                      mapping.assetId.predefinedCount || 0;
                                    const isValid =
                                      totalAssigned <= predefinedCount;

                                    return (
                                      <div key={mapping._id}>
                                        {isValid ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                                            <MdCheckCircle className="h-3 w-3" />
                                            Valid ({totalAssigned}/
                                            {predefinedCount})
                                          </span>
                                        ) : (
                                          <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                                            Over ({totalAssigned}/
                                            {predefinedCount})
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Full-screen blocking overlay while saving all mappings */}
      {savingAll && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              border: "5px solid rgba(255,255,255,0.3)",
              borderTopColor: "#ffffff",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ color: "#ffffff", fontSize: "16px", fontWeight: 600 }}>
            Saving all mappings…
          </p>
        </div>
      )}
      {/* Add animation styles */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>

      {/* Fixed Toast Notification */}
      {message && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            minWidth: "400px",
            maxWidth: "90vw",
            animation: "slideDown 0.3s ease-out",
          }}
        >
          <div
            className={`rounded-xl shadow-2xl p-5 border-2 ${
              message.type === "success"
                ? "bg-green-50 text-green-900 border-green-500"
                : "bg-red-50 text-red-900 border-red-500"
            }`}
            style={{
              boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {message.type === "success" ? (
                  <MdCheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white text-xl font-bold">
                    !
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold mb-1">
                  {message.type === "success"
                    ? "Success"
                    : "Error - Action Required"}
                </p>
                <p className="text-sm leading-relaxed">{message.text}</p>
              </div>
              <button
                onClick={() => setMessage(null)}
                className={`flex-shrink-0 rounded-lg p-1 hover:bg-white/50 transition-colors ${
                  message.type === "success" ? "text-green-600" : "text-red-600"
                }`}
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        <ModuleHeader
          title="Map Assets to Centers"
          subtitle="Assign assets to centers and manage quantities across your organization"
        />

        <div
          style={{
            marginBottom: "24px",
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={() => setViewMode("listing")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "white",
              border: "2px solid #E5E7EB",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            View Report
          </button>
          <button
            onClick={fetchMappings}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "white",
              border: "2px solid #E5E7EB",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              transition: "all 0.2s ease",
            }}
          >
            <MdRefresh className="h-5 w-5" />
            Refresh
          </button>
        </div>

        {/* Project Selector */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Select Project <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:w-1/2"
          >
            <option value="">Choose a project...</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {selectedProject && centers.length > 0 && (
          <>
            {/* Global Asset Allocation Dashboard */}
            {assets.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Asset Allocation Overview - All Centers
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assets.slice(0, 6).map((asset) => {
                    const totalAssigned = getTotalAssignedForAsset(asset._id);
                    const available = Math.max(
                      0,
                      asset.predefinedCount - totalAssigned,
                    );
                    const percentageUsed =
                      asset.predefinedCount > 0
                        ? Math.round(
                            (totalAssigned / asset.predefinedCount) * 100,
                          )
                        : 0;
                    const isOverAllocated =
                      totalAssigned > asset.predefinedCount;
                    const isNearLimit =
                      percentageUsed >= 80 && !isOverAllocated;

                    return (
                      <div
                        key={asset._id}
                        className={`rounded-lg border-2 p-4 transition-all ${
                          isOverAllocated
                            ? "border-red-300 bg-red-50"
                            : isNearLimit
                              ? "border-yellow-300 bg-yellow-50"
                              : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {asset.icon && (
                              <span className="text-xl flex-shrink-0">
                                {asset.icon}
                              </span>
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-gray-900 truncate">
                                {asset.name}
                              </h4>
                              <p className="text-xs text-gray-600">
                                {asset.category &&
                                typeof asset.category === "object"
                                  ? (asset.category as any).name
                                  : asset.category || "General"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600">Total:</span>
                            <span className="font-semibold text-gray-900">
                              {asset.predefinedCount} {asset.unit || "units"}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600">Assigned:</span>
                            <span
                              className={`font-semibold ${isOverAllocated ? "text-red-700" : "text-blue-700"}`}
                            >
                              {totalAssigned} {asset.unit || "units"}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600">Available:</span>
                            <span
                              className={`font-semibold ${
                                isOverAllocated
                                  ? "text-red-700"
                                  : available === 0
                                    ? "text-gray-500"
                                    : "text-green-700"
                              }`}
                            >
                              {available} {asset.unit || "units"}
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="mt-2">
                            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  isOverAllocated
                                    ? "bg-red-600"
                                    : isNearLimit
                                      ? "bg-yellow-500"
                                      : "bg-green-600"
                                }`}
                                style={{
                                  width: `${Math.min(percentageUsed, 100)}%`,
                                }}
                              />
                            </div>
                            <div className="mt-0.5 text-right">
                              <span
                                className={`text-xs font-medium ${
                                  isOverAllocated
                                    ? "text-red-700"
                                    : isNearLimit
                                      ? "text-yellow-700"
                                      : "text-gray-600"
                                }`}
                              >
                                {percentageUsed}% used
                              </span>
                            </div>
                          </div>

                          {isOverAllocated && (
                            <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700">
                              <span>⚠️</span>
                              <span>Over-allocated!</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {assets.length > 6 && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3 flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-700">
                          +{assets.length - 6} more
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          View in asset selection below
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {canMapToCenter && (
              <div className="mb-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Quick Actions
                    </h3>
                    <p className="mt-1 text-xs text-gray-600">
                      Configure assets for one center, then apply to all centers
                      at once
                    </p>
                  </div>
                  <button
                    onClick={saveAllMappings}
                    disabled={loading || savingAll}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingAll ? (
                      <>
                        <svg
                          className="h-5 w-5 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                          />
                        </svg>
                        Saving…
                      </>
                    ) : (
                      <>
                        <MdSave className="h-5 w-5" />
                        Save All Mappings
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Centers Accordion */}
            <div className="space-y-3">
              {centers.map((center) => {
                const isExpanded = expandedCenters.has(center._id);
                const selection = centerSelections[center._id];
                const selectedCount = selection?.selectedAssets.length || 0;

                return (
                  <div
                    key={center._id}
                    className="overflow-hidden rounded-lg bg-white shadow"
                  >
                    {/* Accordion Header */}
                    <div
                      className="flex cursor-pointer items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                      onClick={() => toggleCenter(center._id)}
                    >
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {center.centerName}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {center.city}, {center.state} •
                          <span className="ml-1 font-medium text-blue-600">
                            {selectedCount} asset(s) selected
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canMapToCenter && selectedCount > 0 && (
                          <div className="flex items-center gap-2 mr-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
                            <span className="text-xs font-medium text-purple-900">
                              📅 Audit Schedule:
                            </span>
                            <input
                              type="date"
                              min={new Date().toISOString().split("T")[0]}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                const value = e.target.value;
                                if (value) {
                                  updateAuditStartDate(center._id, value);
                                }
                              }}
                              value={
                                selection?.auditStartDate
                                  ? new Date(selection.auditStartDate)
                                      .toISOString()
                                      .split("T")[0]
                                  : new Date().toISOString().split("T")[0]
                              }
                              className="rounded border border-purple-300 px-2 py-0.5 text-xs bg-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                            />
                            <span className="text-xs text-purple-700">+</span>
                            <select
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                const value = e.target.value;
                                if (value === "") {
                                  updateAuditFrequency(center._id, null);
                                } else {
                                  const months = parseInt(value);
                                  updateAuditFrequency(center._id, months);
                                }
                              }}
                              value={selection?.auditFrequencyMonths || ""}
                              className="rounded border border-purple-300 px-2 py-0.5 text-xs bg-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                            >
                              <option value="">Select frequency</option>
                              <option value="1">1 Month</option>
                              <option value="3">3 Months</option>
                              <option value="6">6 Months</option>
                              <option value="12">1 Year</option>
                            </select>
                            {selection?.nextAuditDate && (
                              <>
                                <span className="text-xs text-purple-700">
                                  =
                                </span>
                                <span className="text-xs text-purple-900 font-semibold">
                                  {new Date(
                                    selection.nextAuditDate,
                                  ).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                        {canMapToCenter && selectedCount > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              applyToAllCenters(
                                center._id,
                                selection.selectedAssets,
                                selection.assetQuantities,
                              );
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:from-green-700 hover:to-emerald-700 transition-all"
                            title="Apply this center's configuration to all other centers"
                          >
                            <MdContentCopy className="h-4 w-4" />
                            Copy to All Centers
                          </button>
                        )}
                        {canMapToCenter && selectedCount > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              saveMapping(center._id);
                            }}
                            disabled={loading}
                            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            <MdSave className="h-4 w-4" />
                            Save
                          </button>
                        )}
                        {isExpanded ? (
                          <MdExpandLess className="h-6 w-6 text-gray-500" />
                        ) : (
                          <MdExpandMore className="h-6 w-6 text-gray-500" />
                        )}
                      </div>
                    </div>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
                        <p className="text-sm text-gray-600 mb-4">
                          Configure asset allocation for this center. Changes
                          will update the overview dashboard above.
                        </p>

                        {assets.length > 0 && (
                          <>
                            <div className="mb-4">
                              <div className="flex items-center justify-between mb-3">
                                <label className="text-sm font-medium text-gray-700">
                                  Select Assets & Set Quantities for{" "}
                                  {center.centerName}
                                </label>
                                <button
                                  onClick={() =>
                                    toggleSelectAllAssetsForCenter(center._id)
                                  }
                                  disabled={!canMapToCenter}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                                >
                                  {selection?.selectedAssets?.length ===
                                  filteredAssets.length
                                    ? "Deselect All"
                                    : "Select All"}{" "}
                                  ({filteredAssets.length})
                                </button>
                              </div>

                              {/* Search Box - Debounced */}
                              <div className="mb-3">
                                <input
                                  type="text"
                                  placeholder="Search assets by name or category..."
                                  value={searchInput}
                                  onChange={(e) =>
                                    setSearchInput(e.target.value)
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                {assetSearchTerm && (
                                  <p className="mt-1 text-xs text-gray-600">
                                    Showing {filteredAssets.length} of{" "}
                                    {assets.length} assets
                                  </p>
                                )}
                              </div>

                              {/* Asset Selection with Integrated Quantity */}
                              <div className="rounded-lg border border-gray-300 bg-white max-h-96 overflow-y-auto">
                                {filteredAssets.length === 0 ? (
                                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                                    No assets found matching "{assetSearchTerm}"
                                  </div>
                                ) : (
                                  <div className="divide-y divide-gray-200">
                                    {filteredAssets.map((asset) => {
                                      const isSelected =
                                        selection?.selectedAssets?.includes(
                                          asset._id,
                                        ) || false;
                                      const isOverAllocated =
                                        isAssetOverAllocated(asset._id);
                                      const totalAssigned =
                                        getTotalAssignedForAsset(asset._id);
                                      const currentQuantity =
                                        selection?.assetQuantities?.[
                                          asset._id
                                        ] || 0;
                                      const categoryName = asset.category
                                        ? typeof asset.category === "object"
                                          ? (asset.category as any).name
                                          : asset.category
                                        : "";

                                      return (
                                        <div
                                          key={asset._id}
                                          className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                                            isSelected ? "bg-blue-50" : ""
                                          } ${isOverAllocated && isSelected ? "bg-red-50" : ""}`}
                                        >
                                          <div
                                            className="flex items-center flex-shrink-0"
                                            onClick={(e) => {
                                              if (!canMapToCenter) return;
                                              e.preventDefault();
                                              e.stopPropagation();
                                              toggleAssetForCenter(
                                                center._id,
                                                asset._id,
                                              );
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => {}}
                                              disabled={!canMapToCenter}
                                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 pointer-events-none"
                                            />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                              {asset.icon && (
                                                <span className="text-lg flex-shrink-0">
                                                  {asset.icon}
                                                </span>
                                              )}
                                              <span className="font-medium text-gray-900 truncate">
                                                {asset.name}
                                              </span>
                                              {categoryName && (
                                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 flex-shrink-0">
                                                  {categoryName}
                                                </span>
                                              )}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-600">
                                              <span>
                                                Available:{" "}
                                                {asset.predefinedCount}{" "}
                                                {asset.unit || "units"}
                                              </span>
                                              {isOverAllocated &&
                                                isSelected && (
                                                  <span className="font-semibold text-red-700 flex items-center gap-1">
                                                    <span>⚠️</span>
                                                    Over-allocated:{" "}
                                                    {totalAssigned}/
                                                    {asset.predefinedCount}
                                                  </span>
                                                )}
                                            </div>
                                          </div>

                                          {/* Quantity Input - Shown when selected */}
                                          {isSelected && (
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                              <div className="text-right">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                  Quantity
                                                </label>
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max={asset.predefinedCount}
                                                  value={currentQuantity}
                                                  onChange={(e) => {
                                                    e.stopPropagation();
                                                    updateAssetQuantity(
                                                      center._id,
                                                      asset._id,
                                                      parseInt(
                                                        e.target.value,
                                                      ) || 0,
                                                    );
                                                  }}
                                                  onClick={(e) =>
                                                    e.stopPropagation()
                                                  }
                                                  disabled={!canMapToCenter}
                                                  className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm text-right focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                />
                                              </div>
                                              <MdCheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              <p className="mt-2 text-xs text-gray-500">
                                {selection?.selectedAssets?.length || 0} of{" "}
                                {assets.length} assets selected
                              </p>
                            </div>

                            {/* Selected Assets Summary */}
                            {selection?.selectedAssets &&
                              selection.selectedAssets.length > 0 && (
                                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                      <h5 className="text-sm font-semibold text-gray-900 mb-2">
                                        Selected Assets Summary
                                      </h5>
                                      <div className="flex flex-wrap gap-2">
                                        {selection.selectedAssets.map(
                                          (assetId) => {
                                            const asset = assets.find(
                                              (a) => a._id === assetId,
                                            );
                                            if (!asset) return null;
                                            const quantity =
                                              selection.assetQuantities[
                                                assetId
                                              ] || 0;

                                            return (
                                              <span
                                                key={assetId}
                                                className="inline-flex items-center gap-1.5 rounded-full bg-white border border-blue-200 px-3 py-1 text-xs"
                                              >
                                                {asset.icon && (
                                                  <span>{asset.icon}</span>
                                                )}
                                                <span className="font-medium">
                                                  {asset.name}
                                                </span>
                                                <span className="text-blue-600 font-semibold">
                                                  ×{quantity}
                                                </span>
                                                <button
                                                  onClick={() =>
                                                    toggleAssetForCenter(
                                                      center._id,
                                                      assetId,
                                                    )
                                                  }
                                                  className="ml-1 text-gray-400 hover:text-red-600"
                                                >
                                                  <MdClose className="h-3.5 w-3.5" />
                                                </button>
                                              </span>
                                            );
                                          },
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                          </>
                        )}

                        {assets.length === 0 && (
                          <div className="rounded-lg bg-white p-8 text-center border border-gray-200">
                            <p className="text-gray-600">
                              No assets found for this project. Please add
                              assets first.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {selectedProject && centers.length === 0 && !loading && (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-600">
              No centers found for this project. Please add centers first.
            </p>
          </div>
        )}

        {!selectedProject && (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-600">
              Please select a project to begin mapping assets to centers.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CenterAssetMappingAccordion;
