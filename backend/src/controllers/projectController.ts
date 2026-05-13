import { Request, Response } from "express";
import { Project } from "../models/Project";
import { User } from "../models/User";
import { Category } from "../models/Category";
import { Status } from "../models/Status";
import { Priority } from "../models/master-data/Priority";
import SLARule from "../models/sla-module/SLARule";
import { AuthRequest } from "../middleware/auth";
import { logActivity } from "../utils/logger";
import { cache, CACHE_KEYS, CACHE_TTL, invalidateCache } from "../utils/cache";
import { GCSService } from "../services/gcsService";

/**
 * Get all projects with optional filtering
 */
export const getAllProjects = async (req: Request, res: Response) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const authReq = req as AuthRequest;

    const query: any = {};

    // Filter projects based on user's assigned projects if they don't have PROJECT_VIEW_ALL permission
    if (authReq.user?.userId) {
      // Use the role from auth middleware which has populated permissions
      const authRole = authReq.user?.role;
      let hasViewAllPermission = false;

      // Check if role permissions are populated (array of Permission objects with 'code')
      if (authRole?.permissions && Array.isArray(authRole.permissions)) {
        hasViewAllPermission = authRole.permissions.some(
          (p: any) =>
            p?.code === "PROJECT_VIEW_ALL" || p === "PROJECT_VIEW_ALL",
        );
      }

      // Also check role code - Super Admin should see all projects
      if (authRole?.code === "SUPER_ADMIN") {
        hasViewAllPermission = true;
      }

      console.log(
        `👤 User: ${authReq.user?.email}, Role: ${authRole?.code}, Has PROJECT_VIEW_ALL: ${hasViewAllPermission}`,
      );

      // If user doesn't have PROJECT_VIEW_ALL, filter by assigned projects
      if (!hasViewAllPermission) {
        const user = await User.findById(authReq.user.userId).populate({
          path: "role",
          populate: {
            path: "projects",
            model: "Project",
          },
        });
        const userRole = user?.role as any;

        console.log(
          `📁 User's assigned projects (user.projects):`,
          user?.projects,
        );
        console.log(
          `📁 User's role projects (role.projects):`,
          userRole?.projects,
        );

        // Combine projects from both user.projects and role.projects
        const userProjectIds =
          user?.projects?.map((p: any) => p.toString()) || [];
        const roleProjectIds =
          userRole?.projects?.map((p: any) =>
            typeof p === "string" ? p : p._id?.toString() || p.toString(),
          ) || [];

        // Merge unique project IDs
        const allProjectIds = [
          ...new Set([...userProjectIds, ...roleProjectIds]),
        ];

        console.log(`📁 Combined project IDs:`, allProjectIds);

        if (allProjectIds.length > 0) {
          query._id = { $in: allProjectIds };
          console.log(
            `🔒 Filtering projects for user ${user?.email}: ${allProjectIds.length} projects`,
          );
        } else {
          // Explicitly match nothing so no projects are leaked to users with no assignments
          query._id = { $in: [] };
          console.log(
            `⚠️  User ${user?.email} has no assigned projects — returning empty list`,
          );
        }
      } else {
        console.log(
          `✅ User ${authReq.user?.email} has PROJECT_VIEW_ALL - showing all projects`,
        );
      }
    }

    // Search by name, code, or projectId
    if (search && typeof search === "string") {
      // Sanitize search to prevent regex injection
      const sanitizedSearch = search
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .trim();
      if (sanitizedSearch) {
        query.$or = [
          { name: { $regex: sanitizedSearch, $options: "i" } },
          { code: { $regex: sanitizedSearch, $options: "i" } },
          { projectId: { $regex: sanitizedSearch, $options: "i" } },
        ];
      }
    }

    if (status) {
      const validStatuses = ["active", "inactive", "archived"];
      if (validStatuses.includes(status as string)) {
        query.status = status;
      }
    }

    // ============================================
    // ADDITIONAL FILTERS (date range)
    // ============================================

    // Date range filter
    if (req.query.createdAfter || req.query.createdBefore) {
      query.createdAt = {};
      if (req.query.createdAfter) {
        const afterDate = new Date(req.query.createdAfter as string);
        if (!isNaN(afterDate.getTime())) query.createdAt.$gte = afterDate;
      }
      if (req.query.createdBefore) {
        const beforeDate = new Date(req.query.createdBefore as string);
        if (!isNaN(beforeDate.getTime())) {
          beforeDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = beforeDate;
        }
      }
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }

    // ============================================
    // SORTING
    // ============================================
    const allowedSortFields = ["createdAt", "name", "code", "status"];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string)
      ? (req.query.sortBy as string)
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const sortObj: { [key: string]: 1 | -1 } = { [sortBy]: sortOrder };

    // Enforce max limit
    const effectiveLimit = Math.min(Number(limit) || 10, 100);
    const skip = (Number(page) - 1) * effectiveLimit;

    const projects = await Project.find(query)
      // OPTIMIZED: Exclude heavy config fields from list view
      .select(
        "-ticketConfig -slaConfig -notificationConfig -integrations -emailConfig",
      )
      .sort(sortObj)
      .skip(skip)
      .limit(effectiveLimit)
      .populate("createdBy", "firstName lastName")
      .populate("updatedBy", "firstName lastName")
      .lean();

    // Optimized: Single aggregation to get user counts for all projects
    // This reduces N+1 queries to just 1 additional query
    const projectIds = projects.map((p) => p._id);
    const userCounts = await User.aggregate([
      { $match: { projects: { $in: projectIds } } },
      { $unwind: "$projects" },
      { $match: { projects: { $in: projectIds } } },
      { $group: { _id: "$projects", count: { $sum: 1 } } },
    ]);

    const userCountMap = new Map(
      userCounts.map((uc: any) => [uc._id.toString(), uc.count]),
    );

    const projectsWithUserCount = projects.map((project) => ({
      ...project,
      users: userCountMap.get(project._id.toString()) || 0,
    }));

    const total = await Project.countDocuments(query);

    console.log(`📋 Retrieved ${projects.length} projects (Total: ${total})`);

    return res.json({
      success: true,
      data: {
        projects: projectsWithUserCount,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalItems: total,
          itemsPerPage: Number(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get all projects error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get projects assigned to the current user (for project switcher)
 * This endpoint doesn't require PROJECT_VIEW_ALL permission - only authentication
 */
export const getMyProjects = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;

    if (!authReq.user?.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Use permissions from auth middleware (already populated)
    // authReq.user.role.permissions contains populated Permission documents
    const authRole = authReq.user?.role;
    let hasViewAllPermission = false;

    // Check if role permissions are populated (array of Permission objects with 'code')
    if (authRole?.permissions && Array.isArray(authRole.permissions)) {
      hasViewAllPermission = authRole.permissions.some(
        (p: any) => p?.code === "PROJECT_VIEW_ALL" || p === "PROJECT_VIEW_ALL",
      );
    }

    // Also check role code - Super Admin should see all projects
    if (authRole?.code === "SUPER_ADMIN") {
      hasViewAllPermission = true;
    }

    console.log(
      `🔄 getMyProjects - User: ${authReq.user.email}, Role: ${authRole?.code}, Has PROJECT_VIEW_ALL: ${hasViewAllPermission}`,
    );

    let projects: any[] = [];

    if (hasViewAllPermission) {
      // User can see all active projects
      projects = await Project.find({ status: "active" })
        .sort({ name: 1 })
        .select("_id projectId name code customUrlPath branding logo status")
        .lean();
      console.log(
        `✅ User has PROJECT_VIEW_ALL, returning all ${projects.length} active projects`,
      );
    } else {
      // Get user with their role and projects for non-admin users
      const user = await User.findById(authReq.user.userId).populate({
        path: "role",
        populate: {
          path: "projects",
          model: "Project",
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const userRole = user.role as any;

      console.log(
        `📁 User's assigned projects (user.projects):`,
        user.projects,
      );
      console.log(
        `📁 User's role projects (role.projects):`,
        userRole?.projects?.map((p: any) => p._id || p),
      );

      // Combine projects from both user.projects and role.projects
      const userProjectIds = user.projects?.map((p: any) => p.toString()) || [];
      const roleProjectIds =
        userRole?.projects?.map((p: any) =>
          typeof p === "string" ? p : p._id?.toString() || p.toString(),
        ) || [];

      // Merge unique project IDs
      const allProjectIds = [
        ...new Set([...userProjectIds, ...roleProjectIds]),
      ];

      console.log(`📁 Combined project IDs:`, allProjectIds);

      if (allProjectIds.length > 0) {
        projects = await Project.find({
          _id: { $in: allProjectIds },
          status: "active",
        })
          .sort({ name: 1 })
          .select("_id projectId name code customUrlPath branding logo status")
          .lean();
        console.log(
          `✅ Returning ${projects.length} assigned projects for user ${user.email}`,
        );
      } else {
        console.log(`⚠️ User ${user.email} has no assigned projects`);
      }
    }

    return res.json({
      success: true,
      data: {
        projects: projects.map((p) => ({
          _id: p._id,
          projectId: p.projectId,
          name: p.name,
          code: p.code,
          customUrlPath: p.branding?.customUrlPath || p.code?.toLowerCase(), // Root level for easy access
          branding: p.branding,
          logo: p.logo,
          status: p.status,
        })),
      },
    });
  } catch (error) {
    console.error("Get my projects error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get single project by ID
 */
export const getProjectById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id)
      .populate("createdBy", "firstName lastName email")
      .populate("updatedBy", "firstName lastName email");

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Calculate actual user count
    const userCount = await User.countDocuments({ projects: project._id });

    const projectWithUserCount = {
      ...project.toObject(),
      users: userCount,
    };

    console.log(`📋 Retrieved project: ${project.name} (${userCount} users)`);

    return res.json({
      success: true,
      data: { project: projectWithUserCount },
    });
  } catch (error) {
    console.error("Get project by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Create new project
 */
export const createProject = async (req: Request, res: Response) => {
  try {
    const projectData = req.body;

    // Check if code already exists
    const existingProject = await Project.findOne({
      code: projectData.code.toUpperCase(),
    });
    if (existingProject) {
      return res.status(400).json({
        success: false,
        message: "Project code already exists",
      });
    }

    // Create new project
    const project = new Project({
      ...projectData,
      code: projectData.code.toUpperCase(),
      createdBy: req.body.createdBy, // TODO: Get from authenticated user
    });

    await project.save();

    console.log(
      `✅ Created new project: ${project.name} (${project.projectId})`,
    );

    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        await logActivity({
          userId: currentUser.userId,
          userName:
            `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
          userEmail: currentUser.email,
          action: "create",
          entity: "project",
          entityId: project._id.toString(),
          entityName: project.name,
          projectId: project._id.toString(),
          projectName: project.name,
          description: `Project ${project.name} (${project.code}) created`,
          req,
          metadata: { projectId: project.projectId, code: project.code },
        });
      }
    } catch (logError) {
      console.error("Failed to log activity:", logError);
    }

    return res.status(201).json({
      success: true,
      data: { project },
      message: "Project created successfully",
    });
  } catch (error: any) {
    console.error("Create project error:", error);
    console.error("Error details:", error.message);
    // Handle duplicate projectId caused by concurrent creates — reset and retry once
    if (error.code === 11000 && error.keyPattern?.projectId) {
      try {
        const projects = await (Project as any)
          .find({ projectId: /^P\d+$/ }, { projectId: 1 })
          .lean();
        let maxNum = 0;
        for (const p of projects as Array<{ projectId?: string }>) {
          const match = p.projectId?.match(/^P(\d+)$/);
          if (match) {
            const n = parseInt(match[1], 10);
            if (n > maxNum) maxNum = n;
          }
        }
        const projectData = req.body;
        const retryProject = new Project({
          ...projectData,
          code: projectData.code.toUpperCase(),
          projectId: `P${String(maxNum + 1).padStart(3, "0")}`,
          createdBy: req.body.createdBy,
        });
        await retryProject.save();
        return res.status(201).json({
          success: true,
          data: { project: retryProject },
          message: "Project created successfully",
        });
      } catch (retryError: any) {
        return res.status(500).json({
          success: false,
          message:
            "Failed to create project due to ID conflict. Please try again.",
        });
      }
    }
    if (error.errors) {
      console.error(
        "Validation errors:",
        JSON.stringify(error.errors, null, 2),
      );
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
      errors: error.errors,
    });
  }
};

/**
 * Update project
 */
export const updateProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if code is being updated and if it's unique
    if (updateData.code) {
      const existingProject = await Project.findOne({
        code: updateData.code.toUpperCase(),
        _id: { $ne: id },
      });
      if (existingProject) {
        return res.status(400).json({
          success: false,
          message: "Project code already exists",
        });
      }
      updateData.code = updateData.code.toUpperCase();
    }

    // Get existing project to preserve offlineModuleSettings
    const existingProject = await Project.findById(id);
    if (!existingProject) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Preserve existing offlineModuleSettings if it exists
    if (
      updateData.configuration &&
      existingProject.configuration?.offlineModuleSettings
    ) {
      updateData.configuration.offlineModuleSettings =
        existingProject.configuration.offlineModuleSettings;
    }

    // Debug: Log loginSettings being saved
    if (updateData.configuration?.loginSettings) {
      console.log(
        "📝 Saving loginSettings:",
        JSON.stringify(updateData.configuration.loginSettings),
      );
    }

    // Upload logo and favicon to GCS if they are base64 encoded
    const projectCode = updateData.code || existingProject.code || id;

    if (
      updateData.branding?.logo &&
      updateData.branding.logo.startsWith("data:image/")
    ) {
      try {
        // Delete old logo from GCS if exists
        if (
          existingProject.branding?.logo?.startsWith(
            "https://storage.googleapis.com/",
          )
        ) {
          await GCSService.deleteProjectBrandingImage(
            existingProject.branding.logo,
          );
        }

        const logoUrl = await GCSService.uploadProjectBrandingImage(
          updateData.branding.logo,
          projectCode,
          "logo",
        );
        updateData.branding.logo = logoUrl;
        console.log(`☁️ Uploaded logo to GCS for project: ${projectCode}`);
      } catch (gcsError) {
        console.warn(
          "⚠️ Failed to upload logo to GCS, keeping base64:",
          gcsError,
        );
        // Keep the base64 data as fallback
      }
    }

    if (
      updateData.branding?.favicon &&
      updateData.branding.favicon.startsWith("data:image/")
    ) {
      try {
        // Delete old favicon from GCS if exists
        if (
          existingProject.branding?.favicon?.startsWith(
            "https://storage.googleapis.com/",
          )
        ) {
          await GCSService.deleteProjectBrandingImage(
            existingProject.branding.favicon,
          );
        }

        const faviconUrl = await GCSService.uploadProjectBrandingImage(
          updateData.branding.favicon,
          projectCode,
          "favicon",
        );
        updateData.branding.favicon = faviconUrl;
        console.log(`☁️ Uploaded favicon to GCS for project: ${projectCode}`);
      } catch (gcsError) {
        console.warn(
          "⚠️ Failed to upload favicon to GCS, keeping base64:",
          gcsError,
        );
        // Keep the base64 data as fallback
      }
    }

    const project = await Project.findByIdAndUpdate(
      id,
      {
        ...updateData,
        updatedBy: req.body.updatedBy, // TODO: Get from authenticated user
      },
      { new: true, runValidators: true },
    );

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    console.log(`✅ Updated project: ${project.name} (${project.projectId})`);

    // Invalidate cache
    invalidateCache.project(id);
    if (project.branding?.customUrlPath) {
      invalidateCache.projectBranding(project.branding.customUrlPath);
    }
    // Also invalidate by project code as fallback
    if (project.code) {
      invalidateCache.projectBranding(project.code.toLowerCase());
    }

    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        const changes = Object.keys(updateData)
          .filter((key) => !["updatedBy", "updatedAt"].includes(key))
          .map((key) => ({
            field: key,
            oldValue: "previous value",
            newValue: updateData[key],
          }));

        await logActivity({
          userId: currentUser.userId,
          userName:
            `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
          userEmail: currentUser.email,
          action: "update",
          entity: "project",
          entityId: project._id.toString(),
          entityName: project.name,
          projectId: project._id.toString(),
          projectName: project.name,
          changes: changes.length > 0 ? changes : undefined,
          description: `Project ${project.name} updated`,
          req,
        });
      }
    } catch (logError) {
      console.error("Failed to log activity:", logError);
    }

    return res.json({
      success: true,
      data: { project },
      message: "Project updated successfully",
    });
  } catch (error) {
    console.error("Update project error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Delete project
 */
export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch project first to get its data
    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Store project data before deletion
    const deletedProjectData = {
      id: project._id.toString(),
      name: project.name,
      code: project.code,
      projectId: project.projectId,
    };

    // Delete the project
    await Project.findByIdAndDelete(id);

    console.log(
      `🗑️ Deleted project: ${deletedProjectData.name} (${deletedProjectData.projectId})`,
    );

    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        await logActivity({
          userId: currentUser.userId,
          userName:
            `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
          userEmail: currentUser.email,
          action: "delete",
          entity: "project",
          entityId: deletedProjectData.id,
          entityName: deletedProjectData.name,
          description: `Project ${deletedProjectData.name} (${deletedProjectData.code}) deleted`,
          req,
          metadata: {
            projectId: deletedProjectData.projectId,
            code: deletedProjectData.code,
          },
        });
      }
    } catch (logError) {
      console.error("Failed to log activity:", logError);
    }

    return res.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("Delete project error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Toggle project status (active/inactive)
 */
export const toggleProjectStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    project.isActive = !project.isActive;
    project.status = project.isActive ? "active" : "inactive";
    await project.save();

    console.log(
      `🔄 Toggled project status: ${project.name} -> ${project.status}`,
    );

    return res.json({
      success: true,
      data: { project },
      message: `Project ${project.status === "active" ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error("Toggle project status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Update project modules
 */
export const updateProjectModules = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { modules } = req.body;

    const project = await Project.findByIdAndUpdate(
      id,
      { modules },
      { new: true, runValidators: true },
    );

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Invalidate branding cache so module changes take effect immediately
    invalidateCache.project(id);
    if (project.branding?.customUrlPath) {
      invalidateCache.projectBranding(project.branding.customUrlPath);
    }
    if (project.code) {
      invalidateCache.projectBranding(project.code.toLowerCase());
    }

    console.log(`✅ Updated modules for project: ${project.name}`);

    return res.json({
      success: true,
      data: { project },
      message: "Project modules updated successfully",
    });
  } catch (error) {
    console.error("Update project modules error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get project statistics - Optimized with single aggregate query
 */
export const getProjectStats = async (req: Request, res: Response) => {
  try {
    // Combine all counts into a single aggregate query for better performance
    const stats = await Project.aggregate([
      {
        $facet: {
          total: [{ $count: "count" }],
          active: [{ $match: { status: "active" } }, { $count: "count" }],
          inactive: [{ $match: { status: "inactive" } }, { $count: "count" }],
          suspended: [{ $match: { status: "suspended" } }, { $count: "count" }],
        },
      },
    ]);

    const result = stats[0];

    return res.json({
      success: true,
      data: {
        total: result.total[0]?.count || 0,
        active: result.active[0]?.count || 0,
        inactive: result.inactive[0]?.count || 0,
        suspended: result.suspended[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error("Get project stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get project branding by custom URL path
 */
export const getProjectBranding = async (req: Request, res: Response) => {
  try {
    const { urlPath } = req.params;

    console.log(`🔍 Looking for project with customUrlPath: ${urlPath}`);

    // Check cache first (15 min TTL for branding data)
    const cacheKey = CACHE_KEYS.PROJECT_BRANDING(urlPath);
    const cachedProject = cache.get<any>(cacheKey);

    let project;
    if (cachedProject) {
      console.log(`✅ [CACHE HIT] Project branding: ${urlPath}`);
      project = cachedProject;
    } else {
      project = await Project.findOne({
        "branding.customUrlPath": urlPath,
      }).lean();
      if (project) {
        cache.set(cacheKey, project, CACHE_TTL.LONG);
        console.log(`📦 [CACHE SET] Project branding: ${urlPath}`);
      }
    }

    if (!project) {
      console.log(`❌ Project not found with customUrlPath: ${urlPath}`);
      return res.status(404).json({
        success: false,
        message: "Project not found",
        error: "No project found with this URL path",
      });
    }

    // Return only the necessary branding information
    const brandingData = {
      projectId: project._id.toString(),
      name: project.name,
      code: project.code,
      branding: {
        customUrlPath: project.branding?.customUrlPath,
        logo: project.branding?.logo,
        logoLinkbackUrl: project.branding?.logoLinkbackUrl,
        favicon: project.branding?.favicon,
        headerText: project.branding?.headerText,
        browserTitle: project.branding?.browserTitle,
        footerText: project.branding?.footerText,
        colorTheme: {
          primary: project.branding?.colorTheme?.primary || "#667eea",
          secondary: project.branding?.colorTheme?.secondary || "#1f2937",
          accent: project.branding?.colorTheme?.accent || "#764ba2",
          background: project.branding?.colorTheme?.background || "#ffffff",
        },
      },
      logoUrl: project.branding?.logo, // Adding at root level for convenience
      logoLinkbackUrl: project.branding?.logoLinkbackUrl, // Adding at root level for convenience
      footerLinks: (project as any).configuration?.footerLinks, // Footer policy URLs
      announcementBanner: (project as any).configuration?.announcementBanner, // Announcement banner
      loginSettings: {
        enableFormLogin:
          (project as any).configuration?.loginSettings?.enableFormLogin ??
          true,
        enableGoogleRecaptcha:
          (project as any).configuration?.loginSettings
            ?.enableGoogleRecaptcha ?? false,
        recaptchaSiteKey: (project as any).configuration?.loginSettings
          ?.enableGoogleRecaptcha
          ? process.env.RECAPTCHA_SITE_KEY ||
            "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI" // Test key as fallback
          : undefined,
      },
      knowledgeBase: (project as any).modules?.knowledgeBase ?? true, // Reads from project.modules.knowledgeBase
      ticketSubmissionMode:
        (project as any).configuration?.ticketSubmissionSettings?.mode ||
        "both", // online, offline, or both
    };

    console.log(`✅ Found project branding: ${project.name}`, brandingData);

    // Set cache control headers to prevent stale branding data
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.json({
      success: true,
      data: brandingData,
    });
  } catch (error) {
    console.error("Get project branding error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get project ticket submission settings
 */
export const getProjectTicketSettings = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    console.log(`🔍 Looking for ticket settings for project: ${projectId}`);

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Get ticket numbering config - prefer ticketNumberSettings, fallback to old location
    const ticketNumberSettings = project.configuration?.ticketNumberSettings;
    const oldNumbering = (project.configuration as any)
      ?.ticketSubmissionSettings?.numbering;

    console.log(
      "🔍 DB ticketNumberSettings:",
      JSON.stringify(ticketNumberSettings, null, 2),
    );
    console.log("🔍 DB oldNumbering:", JSON.stringify(oldNumbering, null, 2));

    // Convert backend format to UI format
    let numbering;
    if (ticketNumberSettings) {
      const prefix = ticketNumberSettings.prefix || "TKT";
      const format = ticketNumberSettings.format || "{PREFIX}-{YYYY}-{NNNN}";

      // Extract separator from format (character between placeholders)
      let separator = "-";
      const match = format.match(/\{[^}]+\}(.)\{/);
      if (match) separator = match[1];

      // Build UI format string (replace {PREFIX} with actual prefix, {NNNN} with ####)
      const uiFormat = format
        .replace("{PREFIX}", prefix)
        .replace("{NNNN}", "####")
        .replace("{NNN}", "###")
        .replace("{NN}", "##");

      numbering = {
        format: uiFormat,
        prefix: prefix,
        startingNumber: ticketNumberSettings.startingNumber || 1,
        separator: separator,
        includeYear: format.includes("{YYYY}"),
        includeMonth: format.includes("{MM}"),
        resetFrequency: ticketNumberSettings.resetPeriod || "yearly",
      };
    } else if (oldNumbering) {
      numbering = oldNumbering;
    } else {
      numbering = {
        format: "TICK-{YYYY}-{####}",
        prefix: "TICK",
        startingNumber: 1,
        separator: "-",
        includeYear: true,
        includeMonth: false,
        resetFrequency: "yearly",
      };
    }

    console.log(
      "📋 Returning ticket numbering config:",
      JSON.stringify(numbering, null, 2),
    );

    // Fixed fields that are ALWAYS present for online ticket submission
    const fixedFields = [
      {
        fieldName: "Name",
        fieldType: "text",
        required: true,
        placeholder: "Enter your full name",
        isFixed: true,
      },
      {
        fieldName: "Email",
        fieldType: "email",
        required: true,
        placeholder: "Enter your email address",
        isFixed: true,
      },
      {
        fieldName: "Phone",
        fieldType: "phone",
        required: true,
        placeholder: "Enter your phone number",
        isFixed: true,
      },
    ];

    // Get custom dynamic fields from database (these are configured in Form Fields tab)
    const customFields =
      project.configuration?.ticketSubmissionSettings?.onlineFormFields || [];

    // Combine fixed fields + custom fields
    const allFormFields = [...fixedFields, ...customFields];

    // Return ticket submission settings with defaults
    const settings = {
      mode: project.configuration?.ticketSubmissionSettings?.mode || "both",
      enableOnlineForm:
        project.configuration?.ticketSubmissionSettings?.enableOnlineForm !==
        false,
      enableOfflineCenter:
        project.configuration?.ticketSubmissionSettings?.enableOfflineCenter !==
        false,
      onlineFormFields: allFormFields,
      customFormFields: customFields, // Return custom fields separately for Form Fields tab editing
      offlineCenters:
        project.configuration?.ticketSubmissionSettings?.offlineCenters || [],
      welcomeMessage:
        project.configuration?.ticketSubmissionSettings?.welcomeMessage ||
        "Welcome! Submit your ticket below and our team will assist you.",
      successMessage:
        project.configuration?.ticketSubmissionSettings?.successMessage ||
        "Your ticket has been successfully submitted. We will get back to you soon.",
      announcement:
        project.configuration?.ticketSubmissionSettings?.announcement || "",
      allowAttachments:
        project.configuration?.ticketSubmissionSettings?.allowAttachments !==
        false,
      maxAttachmentSize:
        project.configuration?.ticketSubmissionSettings?.maxAttachmentSize ||
        10,
      allowedFileTypes: project.configuration?.ticketSubmissionSettings
        ?.allowedFileTypes || [
        ".pdf",
        ".doc",
        ".docx",
        ".jpg",
        ".jpeg",
        ".png",
      ],
      // Fetch categories from Category model (master)
      categories: await (async () => {
        const categories = await Category.find({
          projectId: project._id,
          isActive: true,
        })
          .select("_id name")
          .sort({ order: 1, name: 1 });
        return categories.map((cat) => ({ _id: cat._id, name: cat.name }));
      })(),
      // Fetch allowed statuses from Status model (master)
      allowedStatuses: await (async () => {
        const statuses = await Status.find({
          projectId: project._id,
          isActive: true,
        })
          .select("name code color isDefault isClosed requireClosingRemark")
          .sort({ displayOrder: 1 });
        return statuses;
      })(),
      // Fetch priorities from Priority master data (project-scoped)
      allowedPriorities: await (async () => {
        const masterPriorities = await Priority.find({
          projectId: project._id,
          isActive: true,
        })
          .select("code order isDefault")
          .sort({ isDefault: -1, order: 1, createdAt: 1 })
          .lean();

        const priorityCodes = [
          ...new Set(
            masterPriorities
              .map((p: any) =>
                String(p.code || "")
                  .trim()
                  .toUpperCase(),
              )
              .filter((p: string) => p.length > 0),
          ),
        ];

        if (priorityCodes.length > 0) {
          console.log(
            `📊 Found ${priorityCodes.length} priorities from Priority master for project ${project.name}:`,
            priorityCodes,
          );
          return priorityCodes;
        }

        // Backward-compat fallback for projects not fully migrated to Priority master.
        const slaRules = await SLARule.find({
          projectIds: { $in: [project._id] },
          isActive: true,
        })
          .select("name priority")
          .lean();

        const fallbackPriorities = [
          ...new Set(
            slaRules
              .map((rule: any) => rule.priority || rule.name)
              .filter((p: any) => p)
              .map((p: any) => String(p).trim().toUpperCase()),
          ),
        ];

        console.log(
          `📊 Priority master empty, using ${fallbackPriorities.length} SLA-derived priorities for project ${project.name}:`,
          fallbackPriorities,
        );
        return fallbackPriorities;
      })(),
      // Fetch full SLA rules for resolution time
      slaRules: await (async () => {
        const slaRules = await SLARule.find({
          projectIds: { $in: [project._id] },
          isActive: true,
        }).populate("priority", "name code");

        return slaRules.map((rule) => ({
          _id: rule._id,
          name: rule.name,
          priority: rule.priority,
          resolutionTime: rule.resolutionTime,
          responseTime: rule.responseTime,
          escalationPolicyId: rule.escalationPolicyId, // Task 6.4: Include for level-based SLA timing
        }));
      })(),
    };

    console.log(`✅ Found ticket settings for project: ${project.name}`);
    console.log(`📋 Mode: ${settings.mode}`);
    console.log(`📋 Fixed fields: 3 (Name, Email, Phone)`);
    console.log(`📋 Custom dynamic fields: ${customFields.length}`);
    console.log(
      `📋 Total form fields: ${settings.onlineFormFields?.length || 0}`,
    );

    return res.json({
      success: true,
      projectName: project.name,
      data: settings,
      ticketConfig: {
        numbering,
        tableColumns:
          project.configuration?.ticketSubmissionSettings?.tableColumns || [],
      },
    });
  } catch (error) {
    console.error("Get project ticket settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get offline module settings for a project
 */
export const getOfflineSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    let settings = project.configuration?.offlineModuleSettings;

    // Log for debugging
    console.log("📋 Project found:", project.name);
    console.log("📋 Has offlineModuleSettings?", !!settings);
    console.log(
      "📋 Registration fields count:",
      settings?.registrationFields?.length || 0,
    );
    console.log("📋 Ticket fields count:", settings?.ticketFields?.length || 0);

    // If no settings exist, create and save defaults
    if (!settings) {
      console.log("📋 No offline settings found, initializing defaults...");
      settings = {
        registrationFields: [
          {
            id: "1",
            fieldName: "firstName",
            fieldType: "text",
            required: true,
            placeholder: "Enter first name",
            order: 1,
          },
          {
            id: "2",
            fieldName: "lastName",
            fieldType: "text",
            required: true,
            placeholder: "Enter last name",
            order: 2,
          },
          {
            id: "3",
            fieldName: "email",
            fieldType: "email",
            required: true,
            placeholder: "student@example.com",
            order: 3,
          },
          {
            id: "4",
            fieldName: "phone",
            fieldType: "phone",
            required: true,
            placeholder: "+91 98765 43210",
            order: 4,
          },
          {
            id: "5",
            fieldName: "parentMobile",
            fieldType: "phone",
            required: true,
            placeholder: "Parent mobile number",
            isParentMobile: true,
            order: 5,
          },
        ],
        ticketFields: [
          {
            id: "category-fixed",
            fieldName: "Category",
            fieldType: "category",
            required: true,
            placeholder: "Select category",
            isFixed: true,
            isEnabled: true,
            order: 1,
          },
          {
            id: "subject-fixed",
            fieldName: "Subject",
            fieldType: "text",
            required: true,
            placeholder: "Brief description of issue",
            isFixed: true,
            order: 2,
          },
          {
            id: "description-fixed",
            fieldName: "Description",
            fieldType: "textarea",
            required: true,
            placeholder: "Detailed description...",
            isFixed: true,
            order: 3,
          },
          {
            id: "3",
            fieldName: "Attachments",
            fieldType: "file",
            required: false,
            placeholder: "",
            allowMultiple: true,
            maxFiles: 5,
            allowedFileTypes: ["pdf", "jpg", "png", "doc", "docx"],
            order: 4,
          },
        ],
        allowAgentToMarkResolved: true,
        allowAgentToEscalate: true,
        autoAssignToCreatingAgent: false,
        requireStudentVerification: false,
        offlineTicketNumbering: {
          prefix: "OFF",
          startingNumber: 1,
          separator: "-",
          includeYear: true,
          includeMonth: false,
          resetFrequency: "yearly",
        },
        notificationSettings: {
          notifyStudentOnRegistration: true,
          notifyStudentOnTicketCreation: true,
          sendWelcomeEmail: true,
        },
      };

      // Save defaults to database
      try {
        if (!project.configuration) {
          project.configuration = {};
        }
        project.configuration.offlineModuleSettings = settings;
        await project.save();
        console.log("✅ Default offline settings saved to database");
      } catch (saveError) {
        console.error("❌ Error saving default settings:", saveError);
      }
    }

    // Convert to plain object to remove Mongoose metadata and ensure category field
    const parsedSettings = JSON.parse(JSON.stringify(settings));

    // Ensure category field exists in ticket fields
    if (parsedSettings.ticketFields) {
      const hasCategoryField = parsedSettings.ticketFields.some(
        (f: any) =>
          f.fieldType === "category" ||
          f.fieldType === "category-select" ||
          f.fieldName === "Category",
      );
      if (!hasCategoryField) {
        parsedSettings.ticketFields = [
          {
            id: "category-fixed",
            fieldName: "Category",
            fieldType: "category",
            required: true,
            placeholder: "Select category",
            isFixed: true,
            isEnabled: true,
            order: 1,
          },
          ...parsedSettings.ticketFields.map((f: any) => ({
            ...f,
            order: (f.order || 0) + 1,
          })),
        ];
      }
    }

    return res.json({
      success: true,
      data: parsedSettings,
    });
  } catch (error) {
    console.error("Get offline settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Update offline module settings for a project
 */
export const updateOfflineSettings = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    let settings = req.body;

    console.log(`📝 Updating offline settings for project ID: ${id}`);
    console.log(
      `📋 Registration fields: ${settings.registrationFields?.length || 0}`,
    );
    console.log(`🎫 Ticket fields: ${settings.ticketFields?.length || 0}`);

    // Clean the settings - remove MongoDB _id fields from nested arrays
    if (settings.registrationFields) {
      settings.registrationFields = settings.registrationFields.map(
        (field: any) => {
          const { _id, ...cleanField } = field;
          return cleanField;
        },
      );
    }

    if (settings.ticketFields) {
      settings.ticketFields = settings.ticketFields.map((field: any) => {
        const { _id, ...cleanField } = field;
        // Convert 'category-select' to 'category' for schema compatibility
        if (cleanField.fieldType === "category-select") {
          cleanField.fieldType = "category";
        }
        return cleanField;
      });
    }

    const project = await Project.findById(id);

    if (!project) {
      console.log(`❌ Project not found: ${id}`);
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    console.log(`✅ Project found: ${project.name} (${project.projectId})`);

    // Initialize configuration if it doesn't exist
    if (!project.configuration) {
      project.configuration = {};
    }

    // Update offline module settings
    project.configuration.offlineModuleSettings = settings;
    project.updatedAt = new Date();
    if (req.user?.userId) {
      project.updatedBy = req.user.userId as any;
    }

    // Use markModified to ensure nested object changes are detected
    project.markModified("configuration.offlineModuleSettings");

    const savedProject = await project.save();

    console.log(
      `✅ Offline module settings saved successfully for: ${project.name}`,
    );
    console.log(
      `📊 Saved ${settings.registrationFields?.length || 0} registration fields`,
    );
    console.log(`📊 Saved ${settings.ticketFields?.length || 0} ticket fields`);
    console.log(
      `📊 Verification - Settings in DB:`,
      !!savedProject.configuration?.offlineModuleSettings,
    );

    return res.json({
      success: true,
      message: "Offline module settings updated successfully",
      data: settings,
    });
  } catch (error) {
    console.error("❌ Update offline settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Update project ticket settings
 */
export const updateProjectTicketSettings = async (
  req: Request,
  res: Response,
) => {
  try {
    const { projectId } = req.params;
    const { numbering, statuses, types, onlineFormFields, tableColumns } =
      req.body;

    console.log(
      "💾 Saving ticket settings:",
      JSON.stringify(
        { numbering, statuses, types, onlineFormFields, tableColumns },
        null,
        2,
      ),
    );

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Initialize configuration structure if needed
    if (!project.configuration) {
      (project as any).configuration = {};
    }

    // Update ticket numbering configuration - save to ticketNumberSettings (where backend reads from)
    if (numbering) {
      // Build format string from UI settings
      const prefix = numbering.prefix || "TKT";
      const separator = numbering.separator || "-";
      let formatParts = ["{PREFIX}"];

      if (numbering.includeYear) {
        formatParts.push("{YYYY}");
      }
      if (numbering.includeMonth) {
        formatParts.push("{MM}");
      }
      formatParts.push("{NNNN}");

      const format = formatParts.join(separator);

      // Convert UI format to backend format
      const ticketNumberSettings = {
        prefix: prefix,
        format: format,
        startingNumber: numbering.startingNumber || 1,
        resetPeriod: (numbering.resetFrequency || "yearly") as
          | "never"
          | "daily"
          | "monthly"
          | "yearly",
      };

      console.log(
        "✅ Converted UI format to backend format:",
        ticketNumberSettings,
      );
      (project as any).configuration.ticketNumberSettings =
        ticketNumberSettings;

      // Also save to old location for backward compatibility
      if (!(project as any).configuration.ticketSubmissionSettings) {
        (project as any).configuration.ticketSubmissionSettings = {};
      }
      (project as any).configuration.ticketSubmissionSettings.numbering =
        numbering;
    }

    if (statuses) {
      if (!(project as any).configuration.ticketSubmissionSettings) {
        (project as any).configuration.ticketSubmissionSettings = {};
      }
      (project as any).configuration.ticketSubmissionSettings.statuses =
        statuses;
    }
    if (types) {
      if (!(project as any).configuration.ticketSubmissionSettings) {
        (project as any).configuration.ticketSubmissionSettings = {};
      }
      (project as any).configuration.ticketSubmissionSettings.types = types;
    }

    if (tableColumns !== undefined) {
      if (!(project as any).configuration.ticketSubmissionSettings) {
        (project as any).configuration.ticketSubmissionSettings = {};
      }
      (project as any).configuration.ticketSubmissionSettings.tableColumns =
        Array.isArray(tableColumns)
          ? tableColumns
              .map((col: any) => String(col || "").trim())
              .filter(Boolean)
          : [];
    }

    // Update online form fields
    if (onlineFormFields !== undefined) {
      if (!(project as any).configuration.ticketSubmissionSettings) {
        (project as any).configuration.ticketSubmissionSettings = {};
      }
      (project as any).configuration.ticketSubmissionSettings.onlineFormFields =
        onlineFormFields;
      console.log(
        "✅ Updated online form fields:",
        onlineFormFields.length,
        "fields",
      );
    }

    // Use markModified to ensure Mongoose detects nested object changes (like offlineModuleSettings does)
    project.markModified("configuration.ticketNumberSettings");
    project.markModified("configuration.ticketSubmissionSettings");

    await project.save();

    console.log("✅ Ticket settings saved successfully");
    console.log(
      "📊 Verification - ticketNumberSettings in DB:",
      JSON.stringify(
        (project as any).configuration?.ticketNumberSettings,
        null,
        2,
      ),
    );

    return res.json({
      success: true,
      message: "Ticket settings updated successfully",
      data: {
        numbering: (project as any).configuration?.ticketSubmissionSettings
          ?.numbering,
        ticketNumberSettings: (project as any).configuration
          ?.ticketNumberSettings,
        statuses: (project as any).configuration?.ticketSubmissionSettings
          ?.statuses,
        types: (project as any).configuration?.ticketSubmissionSettings?.types,
        tableColumns: (project as any).configuration?.ticketSubmissionSettings
          ?.tableColumns,
      },
    });
  } catch (error) {
    console.error("Update ticket settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get project configuration by domain
 * Public endpoint for login page to fetch branding, favicon, background image, announcement banner
 */
export const getProjectByDomain = async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;

    console.log(`🔍 Looking for project with domain: ${domain}`);

    // Try to find by custom URL path first, then by domain
    let project = await Project.findOne({ "branding.customUrlPath": domain });

    if (!project) {
      console.log(`❌ Project not found with domain: ${domain}`);
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Return project configuration needed for login page
    const projectConfig = {
      _id: project._id,
      name: project.name,
      code: project.code,
      branding: {
        logo: project.branding?.logo,
        favicon: project.branding?.favicon,
        headerText: project.branding?.headerText,
        footerText: project.branding?.footerText,
        customUrlPath: project.branding?.customUrlPath,
        colorTheme: project.branding?.colorTheme,
      },
      configuration: {
        announcementBanner: (project as any).configuration?.announcementBanner,
        customizationSettings: {
          loginPageBackgroundImage: (project as any).configuration
            ?.customizationSettings?.loginPageBackgroundImage,
        },
        security: (project as any).configuration?.security,
      },
    };

    console.log(`✅ Found project: ${project.name}`);

    // Set cache control headers
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.json(projectConfig);
  } catch (error) {
    console.error("Get project by domain error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get form fields for online ticket submission
 */
export const getFormFields = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Return only custom dynamic fields (not fixed fields like Name, Email, Phone)
    const customFields =
      project.configuration?.ticketSubmissionSettings?.onlineFormFields || [];

    console.log(
      `📋 Returning ${customFields.length} custom form fields for project ${project.name}`,
    );

    return res.json({
      success: true,
      data: customFields,
    });
  } catch (error) {
    console.error("Get form fields error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Create a new form field
 */
export const createFormField = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      fieldName,
      fieldLabel,
      fieldType,
      required,
      placeholder,
      options,
      order,
    } = req.body;

    if (!fieldName || !fieldLabel || !fieldType) {
      return res.status(400).json({
        success: false,
        message: "Field name, label, and type are required",
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Initialize configuration structure if needed
    if (!project.configuration) {
      (project as any).configuration = {};
    }
    if (!(project as any).configuration.ticketSubmissionSettings) {
      (project as any).configuration.ticketSubmissionSettings = {};
    }
    if (
      !(project as any).configuration.ticketSubmissionSettings.onlineFormFields
    ) {
      (project as any).configuration.ticketSubmissionSettings.onlineFormFields =
        [];
    }

    // Create new field with unique ID
    const newField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fieldName,
      fieldLabel,
      fieldType,
      required: required || false,
      placeholder: placeholder || "",
      options: options || [],
      order:
        order ||
        (project as any).configuration.ticketSubmissionSettings.onlineFormFields
          .length + 1,
    };

    (
      project as any
    ).configuration.ticketSubmissionSettings.onlineFormFields.push(
      newField as any,
    );
    await project.save();

    console.log(`✅ Form field created for project: ${project.name}`);

    return res.json({
      success: true,
      message: "Form field created successfully",
      data: newField,
    });
  } catch (error) {
    console.error("Create form field error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Update a form field
 */
export const updateFormField = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, fieldId } = req.params;
    const {
      fieldName,
      fieldLabel,
      fieldType,
      required,
      placeholder,
      options,
      order,
    } = req.body;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const formFields =
      project.configuration?.ticketSubmissionSettings?.onlineFormFields;

    if (!formFields) {
      return res.status(404).json({
        success: false,
        message: "No form fields found for this project",
      });
    }

    const fieldIndex = formFields.findIndex((f: any) => f.id === fieldId);

    if (fieldIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Form field not found",
      });
    }

    // Update the field
    formFields[fieldIndex] = {
      ...formFields[fieldIndex],
      fieldName: fieldName || formFields[fieldIndex].fieldName,
      fieldLabel: fieldLabel || formFields[fieldIndex].fieldLabel,
      fieldType: fieldType || formFields[fieldIndex].fieldType,
      required:
        required !== undefined ? required : formFields[fieldIndex].required,
      placeholder:
        placeholder !== undefined
          ? placeholder
          : formFields[fieldIndex].placeholder,
      options: options !== undefined ? options : formFields[fieldIndex].options,
      order: order !== undefined ? order : formFields[fieldIndex].order,
    };

    await project.save();

    console.log(`✅ Form field updated for project: ${project.name}`);

    return res.json({
      success: true,
      message: "Form field updated successfully",
      data: formFields[fieldIndex],
    });
  } catch (error) {
    console.error("Update form field error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Delete a form field
 */
export const deleteFormField = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, fieldId } = req.params;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const formFields =
      project.configuration?.ticketSubmissionSettings?.onlineFormFields;

    if (!formFields) {
      return res.status(404).json({
        success: false,
        message: "No form fields found for this project",
      });
    }

    const fieldIndex = formFields.findIndex((f: any) => f.id === fieldId);

    if (fieldIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Form field not found",
      });
    }

    // Remove the field
    formFields.splice(fieldIndex, 1);

    await project.save();

    console.log(`✅ Form field deleted from project: ${project.name}`);

    return res.json({
      success: true,
      message: "Form field deleted successfully",
    });
  } catch (error) {
    console.error("Delete form field error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Upload project branding image (logo or favicon) to GCS
 */
export const uploadBrandingImage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { imageData, imageType } = req.body;

    if (!imageData) {
      return res.status(400).json({
        success: false,
        message: "Image data is required",
      });
    }

    if (!imageType || !["logo", "favicon"].includes(imageType)) {
      return res.status(400).json({
        success: false,
        message: 'Image type must be either "logo" or "favicon"',
      });
    }

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if it's already a GCS URL (no need to re-upload)
    if (imageData.startsWith("https://storage.googleapis.com/")) {
      return res.json({
        success: true,
        data: { url: imageData },
        message: "Image URL already in GCS format",
      });
    }

    // Check if it's base64 data
    if (!imageData.startsWith("data:image/")) {
      return res.status(400).json({
        success: false,
        message: "Invalid image data format. Expected base64 encoded image.",
      });
    }

    try {
      // Delete old image if it exists in GCS
      const oldImageUrl =
        imageType === "logo"
          ? project.branding?.logo
          : project.branding?.favicon;

      if (
        oldImageUrl &&
        oldImageUrl.startsWith("https://storage.googleapis.com/")
      ) {
        await GCSService.deleteProjectBrandingImage(oldImageUrl);
      }

      // Upload new image to GCS
      const publicUrl = await GCSService.uploadProjectBrandingImage(
        imageData,
        project.code || project._id.toString(),
        imageType as "logo" | "favicon",
      );

      // Update project with new URL
      if (!project.branding) {
        project.branding = {};
      }

      if (imageType === "logo") {
        project.branding.logo = publicUrl;
      } else {
        project.branding.favicon = publicUrl;
      }

      await project.save();

      console.log(
        `✅ Uploaded ${imageType} to GCS for project: ${project.name}`,
      );

      return res.json({
        success: true,
        data: { url: publicUrl },
        message: `${imageType} uploaded successfully to GCS`,
      });
    } catch (gcsError: any) {
      console.error(`GCS upload error for ${imageType}:`, gcsError);

      // If GCS fails, return the base64 data as fallback (will still work, just stored in DB)
      return res.status(500).json({
        success: false,
        message: `Failed to upload to GCS: ${gcsError.message}. Please check GCS configuration.`,
      });
    }
  } catch (error) {
    console.error("Upload branding image error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get WhatsApp widget configuration for a project (public — no auth required).
 * Returns only the widget config needed by the floating icon component.
 */
export const getWhatsappWidgetConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId)
      .select("configuration.whatsappWidget")
      .lean();
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    const widget = project.configuration?.whatsappWidget;
    if (!widget?.enabled) {
      return res.json({ success: true, data: { enabled: false } });
    }

    return res.json({
      success: true,
      data: {
        enabled: true,
        visibility: widget.visibility || "always",
        roleVisibility: widget.roleVisibility || "all",
        visibleRoles: Array.isArray(widget.visibleRoles)
          ? widget.visibleRoles
          : [],
        phoneNumber: widget.phoneNumber || "",
        whatsappUrl: `https://wa.me/${widget.phoneNumber}`,
        predefinedMessage: widget.predefinedMessage || "",
        position: widget.position || "bottom-right",
        iconSize: widget.iconSize || "medium",
      },
    });
  } catch (error) {
    console.error("Get WhatsApp widget config error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

/**
 * Update WhatsApp widget settings for a project (admin only).
 */
export const updateWhatsappWidgetSettings = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const {
      enabled,
      visibility,
      roleVisibility,
      visibleRoles,
      phoneNumber,
      predefinedMessage,
      position,
      iconSize,
    } = req.body;

    const project = await Project.findById(id);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    if (!project.configuration) {
      project.configuration = {};
    }

    // Strip non-digit characters from phone number for storage
    const cleanPhone = phoneNumber
      ? String(phoneNumber).replace(/\D/g, "")
      : "";

    const cleanVisibleRoles = Array.isArray(visibleRoles)
      ? Array.from(
          new Set(
            visibleRoles
              .map((role: any) =>
                String(role || "")
                  .trim()
                  .replace(/\s+/g, "_")
                  .toUpperCase(),
              )
              .filter(Boolean),
          ),
        )
      : [];

    const effectiveRoleVisibility =
      roleVisibility === "roles" ? "roles" : "all";

    if (
      !!enabled &&
      effectiveRoleVisibility === "roles" &&
      cleanVisibleRoles.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one role for role-based visibility",
      });
    }

    project.configuration.whatsappWidget = {
      enabled: !!enabled,
      visibility: visibility || "always",
      roleVisibility: effectiveRoleVisibility,
      visibleRoles: cleanVisibleRoles,
      phoneNumber: cleanPhone,
      predefinedMessage: predefinedMessage || "",
      position: position || "bottom-right",
      iconSize: iconSize || "medium",
    };

    project.updatedAt = new Date();
    if (req.user?.userId) {
      project.updatedBy = req.user.userId as any;
    }

    project.markModified("configuration.whatsappWidget");
    await project.save();

    return res.json({
      success: true,
      message: "WhatsApp widget settings updated successfully",
      data: project.configuration.whatsappWidget,
    });
  } catch (error) {
    console.error("Update WhatsApp widget settings error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
