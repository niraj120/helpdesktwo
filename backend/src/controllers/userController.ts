import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { User } from "../models/User";
import { MDMFieldConfig } from "../models/MDMFieldConfig";
import { Role } from "../models/Role";
import { Project } from "../models/Project";
import { Center } from "../models/Center";
import { hrmsService } from "../services/hrmsService";
import { resolveRoleFromHRMS } from "../services/roleMappingService";
import mongoose from "mongoose";
import { logActivity } from "../utils/logger";
import { validatePasswordPolicy } from "../utils/passwordPolicyUtils";
import ExcelJS from "exceljs";
import multer from "multer";
import { dashboardEvents } from "../services/dashboardEventBus";

const normalizeContactPhone = (value?: unknown): string => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
};

const resolveHrmsImportRole = async (
  projectId: any,
  attrs: {
    hrmsCode?: string;
    department?: string;
    designation?: string;
  },
  explicitRole?: string,
) => {
  if (explicitRole) return explicitRole;

  const mappedRole = await resolveRoleFromHRMS(projectId, attrs);
  if (mappedRole) return mappedRole;

  const projectScopedAgent = projectId
    ? await Role.findOne({
        code: "AGENT",
        isActive: true,
        $or: [{ projects: projectId }, { projectId }],
      }).select("_id")
    : null;
  if (projectScopedAgent?._id) return projectScopedAgent._id;

  const globalAgent = await Role.findOne({
    code: "AGENT",
    isActive: true,
  }).select("_id");
  if (globalAgent?._id) return globalAgent._id;

  const agentLikeRole = projectId
    ? await Role.findOne({
        isAgent: true,
        isActive: true,
        $or: [{ projects: projectId }, { projectId }],
      }).select("_id")
    : null;
  if (agentLikeRole?._id) return agentLikeRole._id;

  return null;
};

const makeHrmsPlaceholderEmail = (
  employeeCode?: string,
  mdmSourceId?: string,
) => {
  const code = String(employeeCode || "")
    .trim()
    .toLowerCase();
  if (!code) return "";

  const safeCode = code
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const sourcePart = mdmSourceId
    ? `.${String(mdmSourceId).slice(-6).toLowerCase()}`
    : "";

  return `${safeCode}${sourcePart}@hrms.local`;
};

// Multer config for bulk upload (memory storage, Excel files only)
const bulkUploadStorage = multer.memoryStorage();
export const bulkUploadMiddleware = multer({
  storage: bulkUploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx and .xls files are allowed"));
    }
  },
}).single("file");

/**
 * Get all users with filters and pagination
 */
export const getAllUsers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      role = "",
      isActive = "",
      project = "",
      department = "",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    const filter: any = {};

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { employeeCode: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
      ];
    }

    if (role) {
      const roleTokens = String(role)
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);

      const roleIds: mongoose.Types.ObjectId[] = [];
      const roleCodes: string[] = [];

      for (const roleToken of roleTokens) {
        const isValidObjectId =
          roleToken.length === 24 && /^[0-9a-fA-F]{24}$/.test(roleToken);

        if (isValidObjectId) {
          roleIds.push(new mongoose.Types.ObjectId(roleToken));
        } else {
          roleCodes.push(roleToken);
        }
      }

      if (roleCodes.length > 0) {
        const roleDocs = await Role.find({
          code: { $in: roleCodes.map((r) => new RegExp(`^${r}$`, "i")) },
        }).select("_id");
        roleIds.push(...roleDocs.map((r) => r._id as mongoose.Types.ObjectId));
      }

      if (roleIds.length === 0) {
        res.json({
          success: true,
          data: [],
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: 0,
            pages: 0,
          },
        });
        return;
      }

      filter.role = roleIds.length === 1 ? roleIds[0] : { $in: roleIds };
    }

    if (isActive !== "") {
      const activeTokens = String(isActive)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s === "true" || s === "false");

      // Apply filter only when exactly one status type is selected.
      // If both are selected, it means "all".
      if (activeTokens.length === 1) {
        filter.isActive = activeTokens[0] === "true";
      }
    }

    if (project) {
      const projectIds = String(project)
        .split(",")
        .map((p) => p.trim())
        .filter((p) => mongoose.Types.ObjectId.isValid(p))
        .map((p) => new mongoose.Types.ObjectId(p));

      if (projectIds.length === 1) {
        filter.projects = projectIds[0];
      } else if (projectIds.length > 1) {
        filter.projects = { $in: projectIds };
      }
    }

    if (department) {
      filter.department = { $regex: department, $options: "i" };
    }

    // ============================================
    // ADDITIONAL FILTERS (date range, centers)
    // ============================================

    // Date range filter
    if (req.query.createdAfter || req.query.createdBefore) {
      filter.createdAt = {};
      if (req.query.createdAfter) {
        const afterDate = new Date(req.query.createdAfter as string);
        if (!isNaN(afterDate.getTime())) filter.createdAt.$gte = afterDate;
      }
      if (req.query.createdBefore) {
        const beforeDate = new Date(req.query.createdBefore as string);
        if (!isNaN(beforeDate.getTime())) {
          beforeDate.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = beforeDate;
        }
      }
      if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt;
    }

    // Centers filter
    if (req.query.centers) {
      const centerIds = String(req.query.centers)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      if (centerIds.length > 0) {
        filter.centers = { $in: centerIds };
      }
    }

    // Company / payroll filter
    if (req.query.company) {
      const companyParam = String(req.query.company);
      if (companyParam === "internal") {
        filter.payrollType = "internal";
      } else if (companyParam === "external") {
        filter.payrollType = "external";
      } else {
        // Filter by specific company ObjectId
        filter.company = companyParam;
      }
    }

    // ============================================
    // PROJECT SCOPING FOR NON-SUPER-ADMIN CALLERS
    // If the caller has a role scoped to specific projects (e.g. Sub Admin),
    // restrict the user list to only users who belong to those projects.
    // SUPER_ADMIN and roles with no projects[] restriction see everyone.
    // ============================================
    const callerRole = (req as any).user?.role;
    const isSuperAdmin =
      callerRole?.code === "SUPER_ADMIN" || callerRole?.name === "Super Admin";

    if (!isSuperAdmin && callerRole?.projects?.length > 0) {
      const allowedProjectIds = callerRole.projects.map(
        (p: any) => new mongoose.Types.ObjectId(p._id || p),
      );
      if (filter.projects) {
        // A specific ?project= filter was also supplied — honour intersection
        const selectedProjectIds = filter.projects?.$in
          ? filter.projects.$in
          : [filter.projects];

        filter.projects = {
          $in: selectedProjectIds.filter((id: any) =>
            allowedProjectIds.some((a: any) => a.equals(id)),
          ),
        };
      } else {
        filter.projects = { $in: allowedProjectIds };
      }
    }

    // ============================================
    // SORTING
    // ============================================
    const allowedSortFields = [
      "createdAt",
      "firstName",
      "lastName",
      "email",
      "lastLogin",
    ];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string)
      ? (req.query.sortBy as string)
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const sortObj: Record<string, 1 | -1> = { [sortBy]: sortOrder as 1 | -1 };

    // Enforce max limit (2000 for bulk picker requests such as escalation matrix user selection)
    const effectiveLimit = Math.min(limitNum || 20, 2000);

    // Build the final query filter
    // Ensure role field is a valid ObjectId (exclude documents with string role values like "agent")
    // This prevents "Cast to ObjectId failed" errors during populate
    const roleFilter = filter.role;
    if (roleFilter) {
      // If a specific role filter is set, use $and to combine with type check
      filter.$and = filter.$and || [];
      filter.$and.push({ role: roleFilter });
      filter.$and.push({ role: { $type: "objectId" } });
      delete filter.role;
    } else {
      // Exclude only old-style string roles (e.g. "agent") which cause populate to throw.
      // Users with no role assigned (null/undefined) are still included.
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { role: { $type: "objectId" } },
          { role: null },
          { role: { $exists: false } },
        ],
      });
    }

    // Active count over the FULL filtered set (not just the current page) so the
    // stat cards reflect all matching users, not the 50 on screen.
    const activeFilter = { ...filter, isActive: true };
    const [users, total, activeTotal] = await Promise.all([
      User.find(filter)
        // OPTIMIZED: Exclude password and heavy fields, reduce populate data for list view
        .select(
          "-password -resetPasswordOTP -resetPasswordOTPExpires -permissions -notificationPreferences -metadata",
        )
        .populate("role", "name code isAgent")
        .populate("projects", "name") // Only name for list view
        .populate("centers", "centerName") // Only name for list view
        .populate("reportingManager", "firstName lastName") // Reduced fields
        .populate("departmentRef", "name")
        .populate({ path: "projectDepartments.departmentRef", select: "name" })
        .populate("company", "name") // Company name for user list
        .sort(sortObj)
        .skip(skip)
        .limit(effectiveLimit)
        .lean(),
      User.countDocuments(filter),
      User.countDocuments(activeFilter),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      // Full-dataset stats for the cards (independent of pagination).
      stats: {
        total,
        active: activeTotal,
        inactive: Math.max(0, total - activeTotal),
      },
    });
  } catch (error: any) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch users",
      message: error.message,
    });
  }
};

/**
 * Get single user by ID
 */
export const getUserById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select("-password -resetPasswordOTP -resetPasswordOTPExpires")
      .populate("role", "name code permissions")
      .populate("projects", "name code")
      .populate("reportingManager", "firstName lastName email employeeCode")
      .populate("departmentRef", "name")
      .populate({ path: "projectDepartments.departmentRef", select: "name" })
      .lean();

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user",
      message: error.message,
    });
  }
};

/**
 * Create new user (manual creation or HRMS import)
 */
export const createUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      phone,
      mobile,
      role,
      employeeCode,
      department,
      designation,
      joiningDate,
      reportingManager,
      projects,
      centers,
      syncFromHRMS = false,
      mdmSourceId,
      payrollType,
      company,
    } = req.body;
    let resolvedRole = role;

    // Validate required fields
    // When syncing from HRMS with employeeCode, email can be fetched from HRMS
    if (!resolvedRole && !syncFromHRMS) {
      res.status(400).json({
        success: false,
        error: "Role is required",
      });
      return;
    }

    if (!syncFromHRMS && !email) {
      res.status(400).json({
        success: false,
        error: "Email is required",
      });
      return;
    }

    if (syncFromHRMS && !employeeCode) {
      res.status(400).json({
        success: false,
        error: "Employee code is required when syncing from HRMS",
      });
      return;
    }

    // Check if email already exists (skip if syncing from HRMS and email not provided yet)
    if (email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        res.status(400).json({
          success: false,
          error: "User with this email already exists",
        });
        return;
      }
    }

    // Check if employee code already exists (only if non-empty)
    if (employeeCode && employeeCode.trim()) {
      const existingEmployee = await User.findOne({ employeeCode });
      if (existingEmployee) {
        res.status(400).json({
          success: false,
          error: "User with this employee code already exists",
        });
        return;
      }
    }

    const contactPhone = normalizeContactPhone(phone || mobile);

    let userData: any = {
      email,
      password: password || Math.random().toString(36).slice(-10), // Generate random password if not provided
      firstName,
      lastName,
      phone: contactPhone || undefined,
      mobile: contactPhone || undefined,
      role: resolvedRole,
      department,
      designation,
      reportingManager,
      projects: projects || [],
      centers: centers || [],
      payrollType: payrollType || null,
      company: company || null,
    };

    // Store departmentRef if provided (ObjectId from dropdown)
    if (req.body.departmentRef) {
      userData.departmentRef = req.body.departmentRef;
    }

    // Store per-project department mappings
    if (
      req.body.projectDepartments &&
      Array.isArray(req.body.projectDepartments)
    ) {
      userData.projectDepartments = req.body.projectDepartments;
    }

    // Sync from HRMS if requested
    if (syncFromHRMS && employeeCode) {
      try {
        const hrmsData = await hrmsService.syncEmployeeData(
          employeeCode,
          mdmSourceId,
          req.body?.fieldMapping,
        );
        if (hrmsData) {
          userData = {
            ...userData,
            ...hrmsData,
            // Override with provided data if any
            firstName: firstName || hrmsData.firstName,
            lastName: lastName || hrmsData.lastName,
            email: email || hrmsData.email,
            mobile: mobile || hrmsData.mobile,
          };
        }
        // Provenance: record this came from HRMS via the chosen MDM source
        userData.registrationSource = "hrms";
        if (mdmSourceId) userData.mdmSourceId = mdmSourceId;

        if (!userData.email) {
          userData.email = makeHrmsPlaceholderEmail(employeeCode, mdmSourceId);
        }

        if (!userData.email) {
          res.status(400).json({
            success: false,
            error:
              "HRMS employee has no email and no employee code to create an internal HRMS email",
          });
          return;
        }

        // Check if email from HRMS already exists
        const existingUserByEmail = await User.findOne({
          email: userData.email,
        });
        if (existingUserByEmail) {
          res.status(400).json({
            success: false,
            error: `User with email ${userData.email} already exists`,
          });
          return;
        }
      } catch (hrmsError: any) {
        res.status(400).json({
          success: false,
          error: "Failed to sync from HRMS",
          message: hrmsError.message,
        });
        return;
      }
    } else if (employeeCode && employeeCode.trim()) {
      // Only set employeeCode if it's not empty
      userData.employeeCode = employeeCode;
    }

    if (syncFromHRMS && !resolvedRole) {
      const mappingProjectId = Array.isArray(projects) ? projects[0] : projects;
      resolvedRole = await resolveHrmsImportRole(
        mappingProjectId,
        {
          hrmsCode: employeeCode,
          department: userData.department,
          designation: userData.designation,
        },
        resolvedRole,
      );

      if (!resolvedRole) {
        res.status(400).json({
          success: false,
          error:
            "No role mapping rule matched this HRMS employee and no AGENT fallback role is configured",
        });
        return;
      }
    }

    const roleDoc = await Role.findById(resolvedRole);
    if (!roleDoc) {
      res.status(400).json({
        success: false,
        error: "Invalid role ID",
      });
      return;
    }
    userData.role = resolvedRole;

    if (joiningDate) {
      userData.joiningDate = new Date(joiningDate);
    }

    const user = new User(userData);
    await user.save();

    // Automatically create hierarchy mapping if reportingManager is assigned
    if (reportingManager) {
      try {
        const { UserReportingHierarchy } =
          await import("../models/UserReportingHierarchy");

        // Check if mapping already exists (using actual DB field names)
        const existingMapping = await UserReportingHierarchy.findOne({
          userId: user._id,
          reportingManager: reportingManager,
        });

        if (!existingMapping) {
          // Create the hierarchy mapping
          await UserReportingHierarchy.create({
            userId: user._id,
            reportingManager: reportingManager,
            createdAt: new Date(),
          });
          console.log(
            `✅ [HIERARCHY] Auto-created: User ${user._id} reports to ${reportingManager}`,
          );
        } else {
          console.log(
            `ℹ️ [HIERARCHY] Mapping already exists for user ${user._id}`,
          );
        }
      } catch (hierError) {
        console.error(
          "❌ [HIERARCHY] Failed to auto-create hierarchy mapping:",
          hierError,
        );
        // Don't fail user creation if hierarchy fails
      }
    }

    // Populate role and projects before returning
    await user.populate("role", "name code");
    await user.populate("projects", "name code");
    await user.populate("departmentRef", "name");
    await user.populate({
      path: "projectDepartments.departmentRef",
      select: "name",
    });

    const userResponse: any = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordOTP;
    delete userResponse.resetPasswordOTPExpires;

    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        const projectNames =
          user.projects &&
          Array.isArray(user.projects) &&
          user.projects.length > 0
            ? (user.projects as any[]).map((p) => p.name || p).join(", ")
            : "No projects";
        const projectIds =
          user.projects &&
          Array.isArray(user.projects) &&
          user.projects.length > 0
            ? (user.projects as any[])[0]._id || (user.projects as any[])[0]
            : undefined;

        await logActivity({
          userId: currentUser.userId,
          userName:
            `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
          userEmail: currentUser.email,
          action: "create",
          entity: "user",
          entityId: user._id.toString(),
          entityName: `${user.firstName} ${user.lastName}`,
          projectId: projectIds?.toString(),
          projectName: projectNames,
          description: `User ${user.email} created with role ${(user.role as any)?.name || "N/A"}`,
          req,
          metadata: { employeeCode: user.employeeCode, syncFromHRMS },
        });
      }
    } catch (logError) {
      console.error("Failed to log activity:", logError);
    }

    res.status(201).json({
      success: true,
      data: userResponse,
      message: "User created successfully",
    });

    // Dashboard cache invalidation (fire-and-forget, after response sent)
    const firstProjectId =
      (user.projects?.[0] as any)?._id?.toString() ??
      (user.projects?.[0] as any)?.toString();
    if (firstProjectId) {
      dashboardEvents.emit("user.created", { tenantId: firstProjectId });
    }
  } catch (error: any) {
    console.error("Error creating user:", error);

    // Handle Mongoose validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(
        (err: any) => err.message,
      );
      res.status(400).json({
        success: false,
        error: messages.join(", "),
      });
      return;
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(400).json({
        success: false,
        error: `User with this ${field} already exists`,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to create user",
    });
  }
};

/**
 * Update user
 */
export const updateUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      phone,
      mobile,
      role,
      employeeCode,
      department,
      designation,
      joiningDate,
      reportingManager,
      projects,
      centers,
      syncFromHRMS = false,
      payrollType,
      company,
    } = req.body;

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    // Check if email is being changed and if it's unique
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({ email: req.body.email });
      if (existingUser) {
        res.status(400).json({
          success: false,
          error: "User with this email already exists",
        });
        return;
      }
      user.email = req.body.email;
    }

    // Check if employee code is being changed and if it's unique (only if non-empty)
    if (
      employeeCode &&
      employeeCode.trim() &&
      employeeCode !== user.employeeCode
    ) {
      const existingEmployee = await User.findOne({ employeeCode });
      if (existingEmployee) {
        res.status(400).json({
          success: false,
          error: "User with this employee code already exists",
        });
        return;
      }
    }

    // Validate role if being updated
    if (role) {
      const roleDoc = await Role.findById(role);
      if (!roleDoc) {
        res.status(400).json({
          success: false,
          error: "Invalid role ID",
        });
        return;
      }

      // Check if role is actually changing
      const roleChanged = user.role.toString() !== role.toString();
      user.role = role;

      // Increment token version to invalidate existing tokens when role changes
      if (roleChanged) {
        console.log(
          `🔄 Role changed for user ${user.email}. Incrementing token version.`,
        );
        await user.incrementTokenVersion();
      }
    }

    // Sync from HRMS if requested
    if (syncFromHRMS && (employeeCode || user.employeeCode)) {
      try {
        const hrmsData = await hrmsService.syncEmployeeData(
          employeeCode || user.employeeCode!,
        );
        Object.assign(user, hrmsData);
      } catch (hrmsError: any) {
        res.status(400).json({
          success: false,
          error: "Failed to sync from HRMS",
          message: hrmsError.message,
        });
        return;
      }
    }

    // Capture old reporting manager before updating (for hierarchy mapping)
    const oldManagerId = user.reportingManager?.toString();

    // Update fields
    const contactPhone = normalizeContactPhone(phone || mobile);
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined || mobile !== undefined) {
      user.phone = contactPhone || undefined;
      user.mobile = contactPhone || undefined;
    }
    // Convert empty string to undefined for sparse unique fields
    if (employeeCode !== undefined)
      user.employeeCode = employeeCode || undefined;
    if (department !== undefined) user.department = department;
    if (req.body.departmentRef !== undefined)
      (user as any).departmentRef = req.body.departmentRef || null;
    if (req.body.projectDepartments !== undefined)
      (user as any).projectDepartments = req.body.projectDepartments || [];
    if (designation !== undefined) user.designation = designation;
    if (joiningDate !== undefined) user.joiningDate = new Date(joiningDate);
    if (reportingManager !== undefined)
      user.reportingManager = reportingManager;
    if (projects !== undefined) user.projects = projects;
    if (centers !== undefined) user.centers = centers;
    if (payrollType !== undefined)
      (user as any).payrollType = payrollType || null;
    if (company !== undefined) (user as any).company = company || null;

    // Handle hierarchy mapping when reportingManager changes
    if (reportingManager !== undefined) {
      try {
        const { UserReportingHierarchy } =
          await import("../models/UserReportingHierarchy");
        const newManagerId = reportingManager;

        // If reporting manager changed
        if (oldManagerId !== newManagerId) {
          // Delete old mapping if exists (using actual DB field names)
          if (oldManagerId) {
            await UserReportingHierarchy.deleteMany({
              userId: user._id,
              reportingManager: oldManagerId,
            });
            console.log(
              `🔄 [HIERARCHY] Deleted old mapping: User ${user._id} → ${oldManagerId}`,
            );
          }

          // Create new mapping if new manager assigned
          if (newManagerId) {
            // Check if mapping already exists (using actual DB field names)
            const existingMapping = await UserReportingHierarchy.findOne({
              userId: user._id,
              reportingManager: newManagerId,
            });

            if (!existingMapping) {
              await UserReportingHierarchy.create({
                userId: user._id,
                reportingManager: newManagerId,
                createdAt: new Date(),
              });
              console.log(
                `✅ [HIERARCHY] Auto-created: User ${user._id} reports to ${newManagerId}`,
              );
            } else {
              console.log(
                `ℹ️ [HIERARCHY] Mapping already exists for user ${user._id}`,
              );
            }
          } else {
            console.log(
              `ℹ️ [HIERARCHY] Reporting manager removed, no new mapping created`,
            );
          }
        }
      } catch (hierError) {
        console.error(
          "❌ [HIERARCHY] Failed to update hierarchy mapping:",
          hierError,
        );
        // Don't fail user update if hierarchy fails
      }
    }

    await user.save();

    await user.populate("role", "name code");
    await user.populate("projects", "name code");
    await user.populate("centers", "centerName city state projectId");
    await user.populate("company", "name");
    await user.populate(
      "reportingManager",
      "firstName lastName email employeeCode",
    );
    await user.populate("departmentRef", "name");
    await user.populate({
      path: "projectDepartments.departmentRef",
      select: "name",
    });

    const userResponse: any = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordOTP;
    delete userResponse.resetPasswordOTPExpires;

    // Log activity
    try {
      const currentUser = (req as any).user;
      if (currentUser) {
        const projectNames =
          user.projects &&
          Array.isArray(user.projects) &&
          user.projects.length > 0
            ? (user.projects as any[]).map((p) => p.name || p).join(", ")
            : "No projects";
        const projectIds =
          user.projects &&
          Array.isArray(user.projects) &&
          user.projects.length > 0
            ? (user.projects as any[])[0]._id || (user.projects as any[])[0]
            : undefined;

        // Track changes
        const changes = [];
        if (firstName !== undefined)
          changes.push({
            field: "firstName",
            oldValue: user.firstName,
            newValue: firstName,
          });
        if (lastName !== undefined)
          changes.push({
            field: "lastName",
            oldValue: user.lastName,
            newValue: lastName,
          });
        if (role !== undefined)
          changes.push({ field: "role", oldValue: user.role, newValue: role });

        await logActivity({
          userId: currentUser.userId,
          userName:
            `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
          userEmail: currentUser.email,
          action: "update",
          entity: "user",
          entityId: user._id.toString(),
          entityName: `${user.firstName} ${user.lastName}`,
          projectId: projectIds?.toString(),
          projectName: projectNames,
          changes: changes.length > 0 ? changes : undefined,
          description: `User ${user.email} updated`,
          req,
        });
      }
    } catch (logError) {
      console.error("Failed to log activity:", logError);
    }

    res.json({
      success: true,
      data: userResponse,
      message: "User updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update user",
      message: error.message,
    });
  }
};

/**
 * Delete user
 */
export const deleteUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    // Don't allow deleting super admin - check if user has a role first
    if (user.role) {
      await user.populate("role", "code type");
      if ((user.role as any)?.code === "SUPER_ADMIN") {
        res.status(403).json({
          success: false,
          error: "Cannot delete Super Admin user",
        });
        return;
      }
    }

    // Store user data before deletion for logging
    const deletedUserData = {
      id: user._id.toString(),
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      projects: user.projects,
    };

    await User.findByIdAndDelete(id);

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
          entity: "user",
          entityId: deletedUserData.id,
          entityName: deletedUserData.name,
          description: `User ${deletedUserData.email} deleted`,
          req,
        });
      }
    } catch (logError) {
      console.error("Failed to log activity:", logError);
    }

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete user",
      message: error.message,
    });
  }
};

/**
 * Toggle user active status
 */
export const toggleUserStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).populate("role", "code type");
    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    // Don't allow deactivating super admin
    if ((user.role as any).code === "SUPER_ADMIN") {
      res.status(403).json({
        success: false,
        error: "Cannot deactivate Super Admin user",
      });
      return;
    }

    user.isActive = !user.isActive;
    await user.save();

    // Dashboard cache invalidation (fire-and-forget)
    const userProjectId =
      (user.projects?.[0] as any)?._id?.toString() ??
      (user.projects?.[0] as any)?.toString();
    if (userProjectId) {
      dashboardEvents.emit("user.status_changed", { tenantId: userProjectId });
    }

    await user.populate("role", "name code");
    await user.populate("projects", "name code");

    const userResponse: any = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordOTP;
    delete userResponse.resetPasswordOTPExpires;

    res.json({
      success: true,
      data: userResponse,
      message: `User ${user.isActive ? "activated" : "deactivated"} successfully`,
    });
  } catch (error: any) {
    console.error("Error toggling user status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to toggle user status",
      message: error.message,
    });
  }
};

/**
 * Search HRMS employees
 */
export const searchHRMSEmployees = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { query, mdmSourceId } = req.query;
    const q = typeof query === "string" ? query : "";
    const sid = typeof mdmSourceId === "string" ? mdmSourceId : undefined;
    const loadMode = req.query.loadMode === "range" ? "range" : "all";
    const start =
      typeof req.query.start === "string" ? Number(req.query.start) : undefined;
    const end =
      typeof req.query.end === "string" ? Number(req.query.end) : undefined;
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    // Blank query is allowed → loads all (needed for "Load all from MDM").
    const searchResult = await hrmsService.searchEmployeesWithMeta(q, sid, {
      mode: loadMode,
      start: Number.isFinite(start) ? start : undefined,
      end: Number.isFinite(end) ? end : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    const employees = searchResult.rows;

    // Field union across the returned rows for the dynamic column picker.
    const fieldSet = new Set<string>();
    for (const e of employees) {
      const raw = (e as any)._raw || e;
      for (const [k, v] of Object.entries(raw)) {
        if (v !== null && typeof v === "object") continue;
        fieldSet.add(k);
      }
    }

    // Which of these employee codes already exist as User accounts (dedupe UI).
    const codes = employees
      .map((e) => e.employeeCode)
      .filter((c): c is string => !!c);
    let existingCodes: string[] = [];
    if (codes.length) {
      const existing = await User.find({ employeeCode: { $in: codes } })
        .select("employeeCode")
        .lean();
      existingCodes = existing
        .map((u: any) => u.employeeCode)
        .filter(Boolean);
    }

    res.json({
      success: true,
      data: employees,
      fields: Array.from(fieldSet),
      existingCodes,
      meta: {
        totalAvailable: searchResult.totalAvailable,
        matchedCount: searchResult.matchedCount,
        loadedCount: searchResult.loadedCount,
        loadMode: searchResult.mode,
        rangeStart: searchResult.rangeStart,
        rangeEnd: searchResult.rangeEnd,
      },
    });
  } catch (error: any) {
    console.error("Error searching HRMS employees:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search HRMS employees",
      message: error.message,
    });
  }
};

/**
 * Discover the field list (+ small sample) for a source — used when the admin
 * picks an MDM source in the dropdown so the column picker can populate before
 * searching.
 */
export const getHRMSFields = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { mdmSourceId } = req.query;
    const out = await hrmsService.getFields(
      typeof mdmSourceId === "string" ? mdmSourceId : undefined,
    );
    res.json({ success: true, ...out });
  } catch (error: any) {
    console.error("Error loading HRMS fields:", error);
    res.status(500).json({
      success: false,
      error: "Failed to load fields",
      message: error.message,
    });
  }
};

/** List all saved field-config presets for a source/dataType. */
export const getMdmFieldConfig = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const mdmSourceId =
      typeof req.query.mdmSourceId === "string" ? req.query.mdmSourceId : "";
    const dataType =
      typeof req.query.dataType === "string" ? req.query.dataType : "employees";
    if (!mdmSourceId) {
      res.json({ success: true, data: [] });
      return;
    }
    const presets = await MDMFieldConfig.find({ mdmSourceId, dataType })
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, data: presets });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/** Upsert a named field-config preset (selectedFields + import mapping). */
export const saveMdmFieldConfig = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { mdmSourceId, dataType, name, selectedFields, fieldMapping } =
      req.body;
    if (!mdmSourceId) {
      res.status(400).json({ success: false, error: "mdmSourceId is required" });
      return;
    }
    const presetName = (name && String(name).trim()) || "Default";
    const cfg = await MDMFieldConfig.findOneAndUpdate(
      { mdmSourceId, dataType: dataType || "employees", name: presetName },
      {
        mdmSourceId,
        dataType: dataType || "employees",
        name: presetName,
        selectedFields: Array.isArray(selectedFields) ? selectedFields : [],
        fieldMapping: fieldMapping || {},
        updatedBy: req.user?.userId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    res.json({ success: true, data: cfg });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/** Delete a named preset. */
export const deleteMdmFieldConfig = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const mdmSourceId =
      typeof req.query.mdmSourceId === "string" ? req.query.mdmSourceId : "";
    const dataType =
      typeof req.query.dataType === "string" ? req.query.dataType : "employees";
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!mdmSourceId || !name) {
      res.status(400).json({ success: false, error: "mdmSourceId + name required" });
      return;
    }
    await MDMFieldConfig.deleteOne({ mdmSourceId, dataType, name });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Validate employee code from HRMS
 */
export const validateEmployeeCode = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { employeeCode } = req.params;

    if (!employeeCode) {
      res.status(400).json({
        success: false,
        error: "Employee code is required",
      });
      return;
    }

    const isValid = await hrmsService.validateEmployeeCode(employeeCode);

    if (!isValid) {
      res.status(404).json({
        success: false,
        error: "Employee code not found in HRMS",
      });
      return;
    }

    const employee = await hrmsService.getEmployeeByCode(employeeCode);

    res.json({
      success: true,
      data: employee,
      message: "Employee code is valid",
    });
  } catch (error: any) {
    console.error("Error validating employee code:", error);
    res.status(500).json({
      success: false,
      error: "Failed to validate employee code",
      message: error.message,
    });
  }
};

/**
 * Bulk import users from HRMS
 */
export const bulkImportFromHRMS = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { employeeCodes, roleId, projectIds } = req.body;

    if (!Array.isArray(employeeCodes) || employeeCodes.length === 0) {
      res.status(400).json({
        success: false,
        error: "Employee codes array is required",
      });
      return;
    }

    // Role is optional (Phase 6): if provided it applies to all imported users;
    // otherwise each user's role is resolved from the configurable
    // RoleMappingRule set by their HRMS code / department / designation.
    if (roleId) {
      const role = await Role.findById(roleId);
      if (!role) {
        res.status(400).json({ success: false, error: "Invalid role ID" });
        return;
      }
    }
    const mappingProjectId = Array.isArray(projectIds)
      ? projectIds[0]
      : projectIds;

    const results = {
      success: [] as any[],
      failed: [] as any[],
    };

    for (const employeeCode of employeeCodes) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ employeeCode });
        if (existingUser) {
          results.failed.push({
            employeeCode,
            reason: "User already exists",
          });
          continue;
        }

        // Fetch from HRMS
        const hrmsData = await hrmsService.syncEmployeeData(employeeCode);

        // Create user - skip if no HRMS data
        if (!hrmsData) {
          results.failed.push({
            employeeCode,
            reason: "No HRMS data found",
          });
          continue;
        }

        // Resolve role: explicit roleId wins; else map from HRMS attributes.
        const resolvedRoleId = await resolveHrmsImportRole(
          mappingProjectId,
          {
            hrmsCode: employeeCode,
            department: (hrmsData as any).department,
            designation: (hrmsData as any).designation,
          },
          roleId,
        );
        if (!resolvedRoleId) {
          results.failed.push({
            employeeCode,
            reason:
              "No role provided, no role-mapping rule matched, and no AGENT fallback role is configured",
          });
          continue;
        }

        const userEmail =
          (hrmsData as any).email || makeHrmsPlaceholderEmail(employeeCode);
        if (!userEmail) {
          results.failed.push({
            employeeCode,
            reason:
              "HRMS employee has no email and no employee code to create an internal HRMS email",
          });
          continue;
        }

        const user = new User({
          ...hrmsData,
          email: userEmail,
          registrationSource: "hrms",
          role: resolvedRoleId,
          projects: projectIds || [],
          password: Math.random().toString(36).slice(-10), // Random password
        });

        await user.save();
        results.success.push({
          employeeCode,
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
        });
      } catch (error: any) {
        results.failed.push({
          employeeCode,
          reason: error.message,
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Imported ${results.success.length} users, ${results.failed.length} failed`,
    });
  } catch (error: any) {
    console.error("Error bulk importing users:", error);
    res.status(500).json({
      success: false,
      error: "Failed to bulk import users",
      message: error.message,
    });
  }
};

/**
 * Reset user password (admin function)
 */
export const resetUserPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPassword, projectId } = req.body;

    if (!newPassword) {
      res.status(400).json({
        success: false,
        error: "New password is required",
      });
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    // Validate against project password policy
    const policyProjectId = projectId || (user as any).projects?.[0];
    const policyProject = policyProjectId
      ? await Project.findById(policyProjectId)
      : null;
    const policyResult = validatePasswordPolicy(
      newPassword,
      (policyProject as any)?.configuration?.securitySettings?.passwordPolicy,
    );
    if (!policyResult.valid) {
      res.status(400).json({
        success: false,
        error: policyResult.errors[0],
      });
      return;
    }

    user.password = newPassword;
    user.requirePasswordSetup = false; // Admin-set password clears the OTP setup requirement
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    user.resetPasswordAttempts = 0;
    user.resetPasswordLockedUntil = undefined;

    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error: any) {
    console.error("Error resetting password:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset password",
      message: error.message,
    });
  }
};

/**
 * Get user permissions by role and project
 */
export const getUserPermissions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { projectId } = req.query;

    const user = await User.findById(id).populate("role");
    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    // Get role permissions
    const role = user.role as any;
    if (!role || !role.permissions) {
      res.json({
        success: true,
        data: [],
      });
      return;
    }

    // If projectId is provided, filter permissions for that project
    let permissions = role.permissions;

    if (projectId) {
      // Filter permissions by project (if role-project mapping exists)
      // For now, return all role permissions
      permissions = role.permissions;
    }

    res.json({
      success: true,
      data: permissions,
    });
  } catch (error: any) {
    console.error("Get user permissions error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user permissions",
      message: error.message,
    });
  }
};

/**
 * Search user by email (for offline module)
 */
export const searchUserByEmail = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { email, projectId, studentOnly } = req.query;

    if (!email) {
      res.status(400).json({
        success: false,
        error: "Email is required",
      });
      return;
    }

    const filter: any = { email: email as string };

    if (projectId) {
      filter.projects = projectId;
    }

    // If studentOnly is true, filter by Student role
    if (studentOnly === "true") {
      const studentRole = await Role.findOne({ code: "STUDENT" });
      if (studentRole) {
        filter.role = studentRole._id;
      } else {
        // No student role found, return no results
        res.json({
          success: true,
          data: null,
        });
        return;
      }
    }

    const user = await User.findOne(filter).select(
      "firstName lastName email phone role",
    );

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error("Search user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search user",
      message: error.message,
    });
  }
};

/**
 * Register student for offline support
 * Creates a full user account with STUDENT role that can login to student portal
 */
export const registerStudent = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId, ...studentData } = req.body;

    console.log(
      "📝 Student registration - phone and parent mobile are OPTIONAL",
    );
    console.log("📝 Request data:", {
      projectId,
      fields: Object.keys(studentData),
    });

    // Field mapping to normalize various field name formats to expected backend fields
    const fieldMapping: Record<string, string> = {
      "First Name": "firstName",
      firstname: "firstName",
      first_name: "firstName",
      "Last Name": "lastName",
      lastname: "lastName",
      last_name: "lastName",
      Email: "email",
      "Email ID": "email",
      email_id: "email",
      Phone: "phone",
      Mobile: "phone",
      "Mobile number": "phone",
      mobile_number: "phone",
      phone_number: "phone",
      "Parent Mobile": "parentMobile",
      "Parent Contact": "parentMobile",
      parent_mobile: "parentMobile",
      parent_contact: "parentMobile",
      parentmobile: "parentMobile",
      "Unique ID": "uniqueId",
      unique_id: "uniqueId",
      uniqueid: "uniqueId",
      "Student ID": "uniqueId",
      "Full Name": "fullName",
      fullname: "fullName",
      full_name: "fullName",
    };

    // Normalize field names
    const normalizedData: Record<string, any> = {};
    Object.keys(studentData).forEach((key) => {
      const normalizedKey = fieldMapping[key] || key;
      normalizedData[normalizedKey] = studentData[key];
    });

    const {
      firstName,
      lastName,
      fullName,
      email,
      phone,
      parentMobile,
      uniqueId,
    } = normalizedData;
    const offlineContactPhone = normalizeContactPhone(phone);

    // Validate required fields
    if (!email || !projectId) {
      res.status(400).json({
        success: false,
        error: "Email and project ID are required",
      });
      return;
    }

    // Phone and parent mobile are now optional
    // if (!phone) {
    //   res.status(400).json({
    //     success: false,
    //     error: 'Phone number is required',
    //   });
    //   return;
    // }

    // if (!parentMobile) {
    //   res.status(400).json({
    //     success: false,
    //     error: 'Parent mobile number is required',
    //   });
    //   return;
    // }

    // Check if user already exists with this email
    const existingUser = await User.findOne({ email }).populate("role", "code");
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: "User with this email already exists",
        duplicateField: "email",
        existingUser: {
          _id: existingUser._id,
          firstName: existingUser.firstName,
          lastName: existingUser.lastName,
          email: existingUser.email,
          phone: existingUser.phone || (existingUser as any).mobile,
          roleCode: (existingUser.role as any)?.code || "",
        },
      });
      return;
    }

    // Check if user already exists with this phone/mobile number
    if (phone) {
      const existingUserByPhone = await User.findOne({
        $or: [{ phone }, { mobile: phone }],
      })
        .select("_id firstName lastName email phone mobile role")
        .populate("role", "code");
      if (existingUserByPhone) {
        res.status(409).json({
          success: false,
          error: "User with this mobile number already exists",
          duplicateField: "phone",
          existingUser: {
            _id: existingUserByPhone._id,
            firstName: existingUserByPhone.firstName,
            lastName: existingUserByPhone.lastName,
            email: existingUserByPhone.email,
            phone:
              existingUserByPhone.phone || (existingUserByPhone as any).mobile,
            roleCode: (existingUserByPhone.role as any)?.code || "",
          },
        });
        return;
      }
    }

    // Check if uniqueId already exists (if provided)
    if (uniqueId) {
      const existingUserByUniqueId = await User.findOne({ uniqueId });
      if (existingUserByUniqueId) {
        res.status(400).json({
          success: false,
          error: "User with this Unique ID already exists",
        });
        return;
      }
    }

    // Get STUDENT role
    const studentRole = await Role.findOne({ code: "STUDENT" });
    if (!studentRole) {
      res.status(500).json({
        success: false,
        error:
          "Student role not found in system. Please run seed-student-role.js",
      });
      return;
    }

    // Generate default password from phone or email
    // Format: first 4 chars of email + last 4 digits of phone
    const passwordSuffix = (offlineContactPhone || "0000").slice(-4);
    const defaultPassword = `${email.substring(0, 4)}${passwordSuffix}`;

    // Prepare user data with all fields from the form
    const userData: any = {
      email,
      phone: offlineContactPhone || phone,
      mobile: offlineContactPhone || undefined,
      parentMobile,
      password: defaultPassword, // Will be hashed by User model pre-save hook
      role: studentRole._id,
      projects: [projectId],
      isActive: true,
      requirePasswordSetup: true, // Student needs to change password on first login
      registrationSource: "offline", // Mark as offline registration
      eulaAccepted: false,
    };

    // Add firstName, lastName, fullName if provided
    if (firstName) userData.firstName = firstName;
    if (lastName) userData.lastName = lastName;
    if (fullName) {
      userData.fullName = fullName;
    } else if (firstName && lastName) {
      userData.fullName = `${firstName} ${lastName}`;
    } else if (firstName) {
      userData.fullName = firstName;
    }

    // Add uniqueId if provided
    if (uniqueId) userData.uniqueId = uniqueId;

    // Store ALL additional dynamic fields from offline settings (using normalized data)
    Object.keys(normalizedData).forEach((key) => {
      if (
        ![
          "firstName",
          "lastName",
          "fullName",
          "email",
          "phone",
          "parentMobile",
          "uniqueId",
          "projectId",
        ].includes(key)
      ) {
        userData[key] = normalizedData[key];
      }
    });

    // Create student user
    const newStudent = await User.create(userData);

    console.log(`✅ Student registered: ${email} (ID: ${newStudent._id})`);
    console.log(`🔑 Default password set for new student (not logged)`);

    res.status(201).json({
      success: true,
      message:
        "Student registered successfully. Default password sent to student.",
      data: {
        _id: newStudent._id,
        firstName: newStudent.firstName || "",
        lastName: newStudent.lastName || "",
        fullName: newStudent.fullName || "",
        email: newStudent.email,
        phone: newStudent.phone,
        mobile: newStudent.mobile,
        parentMobile: (newStudent as any).parentMobile,
        uniqueId: newStudent.uniqueId,
        // Do not return plaintext passwords in API responses for security
      },
    });
  } catch (error: any) {
    console.error("Register student error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to register student",
      message: error.message,
    });
  }
};

/**
 * Advanced search for students/users by name, phone, or unique ID
 * Only returns users with STUDENT role
 */
export const searchStudents = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { query, projectId, searchType } = req.query;

    if (!query) {
      res.status(400).json({
        success: false,
        error: "Search query is required",
      });
      return;
    }

    // Get Student role ID to filter only student users
    const studentRole = await Role.findOne({ code: "STUDENT" });
    if (!studentRole) {
      res.json({
        success: true,
        data: [],
        count: 0,
        message: "Student role not configured",
      });
      return;
    }

    const filter: any = {
      role: studentRole._id, // Only search users with Student role
    };

    if (projectId) {
      filter.projects = projectId;
    }

    // Build search filter based on searchType
    // searchType can be: 'name', 'email', 'phone', 'all'
    if (searchType === "name" || searchType === "all") {
      filter.$or = [
        { firstName: { $regex: query as string, $options: "i" } },
        { lastName: { $regex: query as string, $options: "i" } },
        { fullName: { $regex: query as string, $options: "i" } },
      ];
    }

    if (searchType === "email") {
      filter.email = { $regex: query as string, $options: "i" };
    }

    if (searchType === "phone" || (searchType === "all" && !filter.$or)) {
      filter.phone = query as string;
    }

    // If searchType is 'all', combine all search criteria
    if (searchType === "all" && filter.$or) {
      filter.$or.push(
        { email: { $regex: query as string, $options: "i" } },
        { phone: query as string },
      );
    }

    const users = await User.find(filter)
      .select("_id firstName lastName fullName email phone parentMobile")
      .limit(20); // Limit to 20 results

    res.json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error: any) {
    console.error("Search students error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search students",
      message: error.message,
    });
  }
};

/**
 * Get agents from escalation policies for a project
 */
export const getEscalationAgents = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      res.status(400).json({
        success: false,
        error: "Project ID is required",
      });
      return;
    }

    // Import EscalationPolicy model
    const EscalationPolicy =
      require("../models/sla-module/EscalationPolicy").default;

    // Get all active escalation policies for this project
    const policies = await EscalationPolicy.find({
      $or: [{ projectId: projectId }, { projectIds: projectId }],
      isActive: true,
    });

    // Extract agents with their escalation level info
    const agentsMap = new Map<string, any>();

    policies.forEach((policy: any) => {
      policy.levels?.forEach((level: any) => {
        if (level.escalateTo?.type === "user") {
          const userId = level.escalateTo.targetId;
          const targetName = level.escalateTo.targetName;

          // Store agent with escalation level info
          if (!agentsMap.has(userId)) {
            agentsMap.set(userId, {
              userId,
              targetName,
              escalationLevel: `Level ${level.level}`,
              escalationLevelNumber: level.level,
            });
          } else {
            // If agent appears in multiple levels, use the lowest level
            const existing = agentsMap.get(userId);
            if (level.level < existing.escalationLevelNumber) {
              existing.escalationLevel = `Level ${level.level}`;
              existing.escalationLevelNumber = level.level;
            }
          }
        }
      });
    });

    // Fetch user details for all unique user IDs
    const userIds = Array.from(agentsMap.keys());
    const users = await User.find({
      _id: { $in: userIds },
      isActive: true,
    })
      .select("_id firstName lastName email")
      .sort({ firstName: 1 });

    // Combine user details with escalation info
    const agents = users
      .map((user: any) => {
        const escalationInfo = agentsMap.get(user._id.toString());
        return {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          escalationLevel: escalationInfo?.escalationLevel || "Unknown",
          escalationLevelNumber: escalationInfo?.escalationLevelNumber || 999,
        };
      })
      .sort((a, b) => a.escalationLevelNumber - b.escalationLevelNumber);

    res.json({
      success: true,
      data: agents,
      count: agents.length,
    });
  } catch (error: any) {
    console.error("Get escalation agents error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch escalation agents",
      message: error.message,
    });
  }
};

/**
 * Get employee report data
 * @route GET /api/users/report
 */
export const getUserReport = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const users = await User.find({ isActive: true })
      .select(
        "employeeCode firstName lastName email phone mobile isActive role centers",
      )
      .populate("role", "name")
      .populate("centers", "centerName")
      .sort({ employeeCode: 1 })
      .lean();

    const reportData = users.map((user) => ({
      _id: user._id,
      employeeCode: user.employeeCode || "N/A",
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      mobile: user.phone || user.mobile || "N/A",
      centersMapped: Array.isArray(user.centers)
        ? user.centers.map((c: any) => c.centerName || "N/A").join(", ")
        : "N/A",
      isActive: user.isActive,
      status: user.isActive ? "Active" : "Inactive",
      role: (user.role as any)?.name || "N/A",
    }));

    res.json({
      success: true,
      data: reportData,
      count: reportData.length,
    });
  } catch (error: any) {
    console.error("Get user report error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user report",
      message: error.message,
    });
  }
};

/**
 * Check if an email or phone/mobile already exists in the system.
 * Used by the offline module registration form to warn agents before sending OTP.
 * GET /api/users/check-duplicate?type=email|phone&value=<value>
 */
export const checkDuplicate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { type, value } = req.query;

    if (!type || !value || typeof value !== "string") {
      res.status(400).json({
        success: false,
        error: "type and value query parameters are required",
      });
      return;
    }

    let existingUser: any = null;

    if (type === "email") {
      existingUser = await User.findOne({ email: value.toLowerCase().trim() })
        .select("_id firstName lastName email phone mobile role")
        .populate("role", "code name")
        .lean();
    } else if (type === "phone") {
      const normalised = value.trim();
      existingUser = await User.findOne({
        $or: [{ phone: normalised }, { mobile: normalised }],
      })
        .select("_id firstName lastName email phone mobile role")
        .populate("role", "code name")
        .lean();
    } else {
      res
        .status(400)
        .json({ success: false, error: 'type must be "email" or "phone"' });
      return;
    }

    if (existingUser) {
      res.json({
        success: true,
        exists: true,
        existingUser: {
          _id: existingUser._id,
          firstName: existingUser.firstName || "",
          lastName: existingUser.lastName || "",
          email: existingUser.email,
          phone: existingUser.phone || (existingUser as any).mobile || "",
          roleCode: (existingUser as any).role?.code || "",
        },
      });
    } else {
      res.json({ success: true, exists: false });
    }
  } catch (error: any) {
    console.error("Check duplicate error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Download Excel template for bulk user creation
 */
export const downloadBulkUserTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Fetch roles and projects for dropdown references
    const [roles, projects] = await Promise.all([
      Role.find({ isActive: true }).select("name code").lean(),
      Project.find({ status: "active" }).select("name code").lean(),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SAC Helpdesk";
    workbook.created = new Date();

    // ---- Main sheet: Users ----
    const sheet = workbook.addWorksheet("Users");

    sheet.columns = [
      { header: "First Name *", key: "firstName", width: 20 },
      { header: "Last Name *", key: "lastName", width: 20 },
      { header: "Email *", key: "email", width: 30 },
      { header: "Password *", key: "password", width: 20 },
      { header: "Mobile", key: "mobile", width: 18 },
      { header: "Role Code *", key: "roleCode", width: 20 },
      { header: "Employee Code", key: "employeeCode", width: 18 },
      { header: "Department", key: "department", width: 20 },
      { header: "Designation", key: "designation", width: 20 },
      { header: "Project Codes", key: "projectCodes", width: 30 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Add a sample row
    sheet.addRow({
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      password: "Password@123",
      mobile: "9876543210",
      roleCode: roles[0]?.code || "AGENT",
      employeeCode: "EMP001",
      department: "Support",
      designation: "Executive",
      projectCodes: projects.length > 0 ? projects[0].code : "PROJ1",
    });

    // Style sample row as light gray italic
    const sampleRow = sheet.getRow(2);
    sampleRow.eachCell((cell) => {
      cell.font = { italic: true, color: { argb: "FF9CA3AF" } };
    });

    // ---- Reference sheet: Roles ----
    const rolesSheet = workbook.addWorksheet("Roles Reference");
    rolesSheet.columns = [
      { header: "Role Name", key: "name", width: 30 },
      { header: "Role Code (use this)", key: "code", width: 25 },
    ];
    const rolesHeaderRow = rolesSheet.getRow(1);
    rolesHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF10B981" },
      };
    });
    for (const r of roles) {
      rolesSheet.addRow({ name: r.name, code: r.code });
    }

    // ---- Reference sheet: Projects ----
    const projectsSheet = workbook.addWorksheet("Projects Reference");
    projectsSheet.columns = [
      { header: "Project Name", key: "name", width: 30 },
      { header: "Project Code (use this)", key: "code", width: 25 },
    ];
    const projectsHeaderRow = projectsSheet.getRow(1);
    projectsHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFA855F7" },
      };
    });
    for (const p of projects) {
      projectsSheet.addRow({ name: p.name, code: p.code });
    }

    // Send the workbook as a download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="bulk-user-template.xlsx"',
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error("Download template error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Bulk create users from uploaded Excel file
 */
export const bulkCreateUsers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(file.buffer as any);

    const sheet = workbook.getWorksheet("Users") || workbook.worksheets[0];
    if (!sheet) {
      res
        .status(400)
        .json({ success: false, error: "No worksheet found in file" });
      return;
    }

    // Preload roles and projects for validation
    const [rolesMap, projectsMap] = await Promise.all([
      Role.find({ isActive: true })
        .select("name code")
        .lean()
        .then((docs) => {
          const map = new Map<string, string>();
          for (const d of docs)
            map.set(
              d.code.toUpperCase(),
              (d._id as mongoose.Types.ObjectId).toString(),
            );
          return map;
        }),
      Project.find({ status: "active" })
        .select("name code")
        .lean()
        .then((docs) => {
          const map = new Map<string, string>();
          for (const d of docs)
            map.set(
              d.code.toUpperCase(),
              (d._id as mongoose.Types.ObjectId).toString(),
            );
          return map;
        }),
    ]);

    const results: {
      row: number;
      email: string;
      status: "created" | "failed";
      error?: string;
    }[] = [];
    const emailsSeen = new Set<string>();

    // Iterate rows (skip header row 1)
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);

      const firstName = (row.getCell(1).text || "").trim();
      const lastName = (row.getCell(2).text || "").trim();
      const email = (row.getCell(3).text || "").trim().toLowerCase();
      const password = (row.getCell(4).text || "").trim();
      const mobile = (row.getCell(5).text || "").trim();
      const roleCode = (row.getCell(6).text || "").trim().toUpperCase();
      const employeeCode = (row.getCell(7).text || "").trim();
      const department = (row.getCell(8).text || "").trim();
      const designation = (row.getCell(9).text || "").trim();
      const projectCodesRaw = (row.getCell(10).text || "").trim();

      // Skip empty rows
      if (!firstName && !lastName && !email) continue;

      // Validation
      const errors: string[] = [];
      if (!firstName) errors.push("First Name is required");
      if (!lastName) errors.push("Last Name is required");
      if (!email) errors.push("Email is required");
      if (!password) errors.push("Password is required");
      if (password && password.length < 8)
        errors.push("Password must be at least 8 characters");
      if (!roleCode) errors.push("Role Code is required");

      const namePattern = /^[a-zA-Z\s.]+$/;
      if (firstName && !namePattern.test(firstName))
        errors.push("First Name: only letters, spaces, dots allowed");
      if (lastName && !namePattern.test(lastName))
        errors.push("Last Name: only letters, spaces, dots allowed");

      if (mobile && !/^[6-9]\d{9}$/.test(mobile))
        errors.push("Invalid mobile number");

      // Email format check
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errors.push("Invalid email format");

      // Role lookup
      const roleId = rolesMap.get(roleCode);
      if (roleCode && !roleId) errors.push(`Role code '${roleCode}' not found`);

      // Project codes
      const projectIds: string[] = [];
      if (projectCodesRaw) {
        for (const pc of projectCodesRaw.split(",")) {
          const code = pc.trim().toUpperCase();
          if (!code) continue;
          const pid = projectsMap.get(code);
          if (pid) {
            projectIds.push(pid);
          } else {
            errors.push(`Project code '${pc.trim()}' not found`);
          }
        }
      }

      // Duplicate in file
      if (email && emailsSeen.has(email)) {
        errors.push("Duplicate email in file");
      }

      if (errors.length > 0) {
        results.push({
          row: rowNum,
          email: email || "(empty)",
          status: "failed",
          error: errors.join("; "),
        });
        continue;
      }

      emailsSeen.add(email);

      // Check DB duplicates
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        results.push({
          row: rowNum,
          email,
          status: "failed",
          error: "Email already exists in system",
        });
        continue;
      }

      if (employeeCode) {
        const existingEmp = await User.findOne({ employeeCode });
        if (existingEmp) {
          results.push({
            row: rowNum,
            email,
            status: "failed",
            error: `Employee code '${employeeCode}' already exists`,
          });
          continue;
        }
      }

      // Create user
      try {
        const userData: any = {
          firstName,
          lastName,
          email,
          password,
          mobile: mobile || undefined,
          role: roleId,
          department: department || undefined,
          designation: designation || undefined,
          projects: projectIds,
          registrationSource: "manual",
        };
        if (employeeCode) userData.employeeCode = employeeCode;

        const user = new User(userData);
        await user.save();
        results.push({ row: rowNum, email, status: "created" });
      } catch (saveErr: any) {
        results.push({
          row: rowNum,
          email,
          status: "failed",
          error: saveErr.message || "Failed to save",
        });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const failed = results.filter((r) => r.status === "failed").length;

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
          entity: "user",
          description: `Bulk created ${created} users (${failed} failed) from Excel upload`,
          metadata: { created, failed, totalRows: results.length },
        });
      }
    } catch (logErr) {
      console.error("Failed to log bulk create activity:", logErr);
    }

    res.json({
      success: true,
      data: {
        total: results.length,
        created,
        failed,
        results,
      },
    });
  } catch (error: any) {
    console.error("Bulk create users error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Build the user-list filter from query params + caller role scoping.
 * Mirrors the filter logic in getAllUsers so export honours the SAME filters.
 */
async function buildUserExportFilter(
  query: any,
  callerRole: any,
): Promise<any> {
  const { search = "", role = "", isActive = "", project = "", department = "" } = query;
  const filter: any = {};

  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { employeeCode: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
    ];
  }

  if (role) {
    const roleTokens = String(role).split(",").map((r) => r.trim()).filter(Boolean);
    const roleIds: mongoose.Types.ObjectId[] = [];
    const roleCodes: string[] = [];
    for (const t of roleTokens) {
      if (t.length === 24 && /^[0-9a-fA-F]{24}$/.test(t)) {
        roleIds.push(new mongoose.Types.ObjectId(t));
      } else roleCodes.push(t);
    }
    if (roleCodes.length) {
      const roleDocs = await Role.find({
        code: { $in: roleCodes.map((r) => new RegExp(`^${r}$`, "i")) },
      }).select("_id");
      roleIds.push(...roleDocs.map((r) => r._id as mongoose.Types.ObjectId));
    }
    // No matching roles → impossible filter (return nothing).
    filter.role = roleIds.length ? { $in: roleIds } : new mongoose.Types.ObjectId();
  }

  if (isActive !== "") {
    const tokens = String(isActive).split(",").map((s) => s.trim().toLowerCase())
      .filter((s) => s === "true" || s === "false");
    if (tokens.length === 1) filter.isActive = tokens[0] === "true";
  }

  if (project) {
    const ids = String(project).split(",").map((p) => p.trim())
      .filter((p) => mongoose.Types.ObjectId.isValid(p))
      .map((p) => new mongoose.Types.ObjectId(p));
    if (ids.length) filter.projects = { $in: ids };
  }

  if (department) filter.department = { $regex: department, $options: "i" };

  if (query.createdAfter || query.createdBefore) {
    filter.createdAt = {};
    if (query.createdAfter) {
      const d = new Date(query.createdAfter);
      if (!isNaN(d.getTime())) filter.createdAt.$gte = d;
    }
    if (query.createdBefore) {
      const d = new Date(query.createdBefore);
      if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); filter.createdAt.$lte = d; }
    }
    if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt;
  }

  if (query.centers) {
    const ids = String(query.centers).split(",").map((c) => c.trim()).filter(Boolean);
    if (ids.length) filter.centers = { $in: ids };
  }

  if (query.company) {
    const c = String(query.company);
    if (c === "internal") filter.payrollType = "internal";
    else if (c === "external") filter.payrollType = "external";
    else filter.company = c;
  }

  // Non-super-admin callers only export users within their scoped projects.
  const isSuperAdmin =
    callerRole?.code === "SUPER_ADMIN" || callerRole?.name === "Super Admin";
  if (!isSuperAdmin && callerRole?.projects?.length > 0) {
    const allowed = callerRole.projects.map((p: any) => new mongoose.Types.ObjectId(p._id || p));
    if (filter.projects?.$in) {
      filter.projects = {
        $in: filter.projects.$in.filter((id: any) =>
          allowed.some((a: any) => a.equals(id)),
        ),
      };
    } else {
      filter.projects = { $in: allowed };
    }
  }

  // Exclude legacy string roles that break populate (same guard as getAllUsers).
  filter.$and = filter.$and || [];
  if (filter.role) {
    filter.$and.push({ role: filter.role });
    filter.$and.push({ role: { $type: "objectId" } });
    delete filter.role;
  } else {
    filter.$and.push({
      $or: [{ role: { $type: "objectId" } }, { role: null }, { role: { $exists: false } }],
    });
  }

  return filter;
}

/**
 * @route   GET /api/users/export
 * @desc    Export the filtered user list to CSV or Excel. Honours the same
 *          filters as the user list (search, role, isActive, project,
 *          department, centers, company, date range). ?format=csv|excel.
 * @access  Private (USER_VIEW_ALL)
 */
export const exportUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const format = String(req.query.format || "excel").toLowerCase();
    const callerRole = (req as any).user?.role;
    const filter = await buildUserExportFilter(req.query, callerRole);

    const users = await User.find(filter)
      .select(
        "firstName lastName email phone mobile employeeCode department payrollType isActive lastLogin createdAt role projects centers",
      )
      .populate("role", "name")
      .populate("projects", "name")
      .populate("centers", "centerName")
      .sort({ createdAt: -1 })
      .limit(50000)
      .lean();

    const columns: { key: string; label: string }[] = [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "mobile", label: "Mobile" },
      { key: "employeeCode", label: "Employee Code" },
      { key: "role", label: "Role" },
      { key: "department", label: "Department" },
      { key: "payrollType", label: "Payroll Type" },
      { key: "projects", label: "Projects" },
      { key: "centers", label: "Centers" },
      { key: "status", label: "Status" },
      { key: "lastLogin", label: "Last Login" },
      { key: "createdAt", label: "Created At" },
    ];

    const fmtDate = (d?: any): string => {
      if (!d) return "";
      const date = new Date(d);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    };

    const cell = (u: any, key: string): string => {
      switch (key) {
        case "name": return `${u.firstName || ""} ${u.lastName || ""}`.trim();
        case "email": return u.email || "";
        case "mobile": return u.phone || u.mobile || "";
        case "employeeCode": return u.employeeCode || "";
        case "role": return (u.role as any)?.name || "";
        case "department": return u.department || "";
        case "payrollType": return u.payrollType || "";
        case "projects": return (u.projects || []).map((p: any) => p?.name).filter(Boolean).join(", ");
        case "centers": return (u.centers || []).map((c: any) => c?.centerName).filter(Boolean).join(", ");
        case "status": return u.isActive ? "Active" : "Inactive";
        case "lastLogin": return fmtDate(u.lastLogin);
        case "createdAt": return fmtDate(u.createdAt);
        default: return "";
      }
    };

    const headers = columns.map((c) => c.label);
    const dataRows = users.map((u: any) => columns.map((c) => cell(u, c.key)));
    const dateStamp = new Date().toISOString().split("T")[0];

    if (format === "csv") {
      const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [headers.map(esc).join(",")];
      for (const row of dataRows) lines.push(row.map(esc).join(","));
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="users_export_${dateStamp}.csv"`);
      res.send(lines.join("\n"));
      return;
    }

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Users");
      ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: 22 }));
      users.forEach((u: any) => {
        const rowObj: Record<string, string> = {};
        columns.forEach((c) => (rowObj[c.key] = cell(u, c.key)));
        ws.addRow(rowObj);
      });
      ws.getRow(1).font = { bold: true };
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename="users_export_${dateStamp}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    res.status(400).json({ message: 'Invalid format. Use "csv" or "excel"' });
  } catch (error: any) {
    console.error("Export users error:", error);
    res.status(500).json({ success: false, message: "Failed to export users" });
  }
};
