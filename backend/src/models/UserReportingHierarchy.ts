import mongoose, { Document, Schema, Model } from "mongoose";

/**
 * User Reporting Hierarchy Model
 *
 * Purpose: Store USER-TO-USER reporting relationships (NOT role-based hierarchy)
 * This enables supervisors to see aggregated dashboard of their team members
 *
 * Key Design Principles:
 * - User-based mapping (supervisor_user_id → reportee_user_id)
 * - Project-scoped (same user can have different supervisors in different projects)
 * - Prevents circular dependencies via validation
 * - Supports multi-level hierarchy via recursive queries
 */

export interface IUserReportingHierarchy extends Document {
  reporteeUserId: mongoose.Types.ObjectId; // Employee (reportee) - MATCHES DB FIELD
  supervisorUserId: mongoose.Types.ObjectId; // Manager (supervisor) - MATCHES DB FIELD
  hierarchyLevel?: number;
  relationshipType?: string;
  isActive?: boolean;
  effectiveFrom?: Date;
  projectId?: mongoose.Types.ObjectId;
  metadata?: {
    centerId?: mongoose.Types.ObjectId;
    regionId?: string;
    notes?: string;
    [key: string]: any;
  };
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for static methods
export interface IUserReportingHierarchyModel extends Model<IUserReportingHierarchy> {
  getDirectReportees(
    supervisorUserId: string | mongoose.Types.ObjectId,
    projectId?: string,
  ): Promise<any[]>;
  getAllReporteesRecursive(
    supervisorUserId: string | mongoose.Types.ObjectId,
    projectId?: string,
    maxDepth?: number,
  ): Promise<any[]>;
  getSupervisorChain(
    reporteeUserId: string | mongoose.Types.ObjectId,
    projectId?: string,
  ): Promise<mongoose.Types.ObjectId[]>;
  checkCircularDependency(
    supervisorUserId: mongoose.Types.ObjectId,
    reporteeUserId: mongoose.Types.ObjectId,
    projectId?: mongoose.Types.ObjectId,
  ): Promise<boolean>;
}

const UserReportingHierarchySchema = new Schema<IUserReportingHierarchy>(
  {
    reporteeUserId: {
      // MATCHES ACTUAL DB FIELD (the employee/reportee)
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reportee User ID is required"],
      index: true,
    },
    supervisorUserId: {
      // MATCHES ACTUAL DB FIELD (the manager/supervisor)
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Supervisor User ID is required"],
      index: true,
    },
    hierarchyLevel: {
      type: Number,
      default: 1,
    },
    relationshipType: {
      type: String,
      default: "direct_report",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    collection: "userreportinghierarchies", // MATCHES ACTUAL COLLECTION NAME
  },
);

// Indexes for performance
UserReportingHierarchySchema.index(
  { supervisorUserId: 1, projectId: 1 },
  { name: "idx_supervisor_project" },
);

UserReportingHierarchySchema.index(
  { reporteeUserId: 1, projectId: 1 },
  { name: "idx_reportee_project" },
);

UserReportingHierarchySchema.index({ projectId: 1 }, { name: "idx_project" });

// Unique constraint: One supervisor per reportee per project
UserReportingHierarchySchema.index(
  { reporteeUserId: 1, projectId: 1 },
  {
    name: "idx_unique_reportee_project",
    unique: true,
    sparse: true,
  },
);

// Validation: Prevent self-reporting
UserReportingHierarchySchema.pre("save", function (next) {
  if (this.reporteeUserId.equals(this.supervisorUserId)) {
    return next(new Error("User cannot report to themselves"));
  }
  next();
});

// Static method: Get direct reportees for a supervisor
UserReportingHierarchySchema.statics.getDirectReportees = async function (
  supervisorId: mongoose.Types.ObjectId | string,
  projectId?: mongoose.Types.ObjectId | string,
  includeInactive = false,
): Promise<any[]> {
  // Convert string to ObjectId if needed
  const managerId =
    typeof supervisorId === "string"
      ? new mongoose.Types.ObjectId(supervisorId)
      : supervisorId;

  const query: any = {
    supervisorUserId: managerId,
    isActive: true,
  };

  if (projectId) {
    query.projectId = projectId;
  }

  const hierarchyReportees = await this.find(query)
    .populate("reporteeUserId", "firstName lastName email role")
    .lean();

  const found = new Set(
    hierarchyReportees.map((r: any) =>
      (r.reporteeUserId?._id || r.reporteeUserId)?.toString(),
    ),
  );
  const result = hierarchyReportees.map((r: any) => ({
    userId: r.reporteeUserId?._id || r.reporteeUserId,
    firstName: r.reporteeUserId?.firstName,
    lastName: r.reporteeUserId?.lastName,
    email: r.reporteeUserId?.email,
    role: r.reporteeUserId?.role,
  }));

  // Fallback: also query users.reportingManager directly (handles cases where
  // userreportinghierarchies collection is not synced with user setup)
  const User = mongoose.model("User");
  const userQuery: any = { reportingManager: managerId, isActive: true };
  if (projectId) {
    userQuery.projects = projectId;
  }
  const directFromUsers = await User.find(userQuery)
    .select("_id firstName lastName email role")
    .lean();

  for (const u of directFromUsers) {
    const uid = (u._id as any).toString();
    if (!found.has(uid)) {
      found.add(uid);
      result.push({
        userId: u._id,
        firstName: (u as any).firstName,
        lastName: (u as any).lastName,
        email: (u as any).email,
        role: (u as any).role,
      });
    }
  }

  console.log(
    `📋 [HIERARCHY] getDirectReportees: Found ${result.length} direct reports for supervisor ${supervisorId} (${hierarchyReportees.length} from hierarchy collection, ${directFromUsers.length} from users.reportingManager)`,
  );
  return result;
};

// Static method: Get all reportees recursively (multi-level hierarchy)
// Queries BOTH userreportinghierarchies (new format) AND users.reportingManager
// (direct field) so that users set up via either flow are always included.
UserReportingHierarchySchema.statics.getAllReporteesRecursive = async function (
  supervisorId: mongoose.Types.ObjectId | string,
  projectId?: mongoose.Types.ObjectId | string,
  maxDepth = 10,
): Promise<any[]> {
  // Convert string to ObjectId if needed
  const managerId =
    typeof supervisorId === "string"
      ? new mongoose.Types.ObjectId(supervisorId)
      : supervisorId;

  const allReportees: any[] = [];
  const visited = new Set<string>();
  const User = mongoose.model("User");

  // Internal recursive function — merges results from hierarchy collection
  // AND from users.reportingManager field to cover both data sources.
  const collectReportees = async (
    supId: mongoose.Types.ObjectId,
    depth: number,
  ) => {
    if (depth > maxDepth) return;

    // Source 1: userreportinghierarchies collection
    const hierarchyQuery: any = { supervisorUserId: supId, isActive: true };
    if (projectId) hierarchyQuery.projectId = projectId;
    const fromHierarchy = await this.find(hierarchyQuery).lean();

    // Source 2: users.reportingManager field (fallback / supplement)
    const userQuery: any = { reportingManager: supId, isActive: true };
    if (projectId) userQuery.projects = projectId;
    const fromUsers = await User.find(userQuery).select("_id").lean();

    // Merge both sources
    const candidateIds = new Set<string>();
    fromHierarchy.forEach((e: any) => {
      const id = e.reporteeUserId?.toString();
      if (id) candidateIds.add(id);
    });
    fromUsers.forEach((u: any) => {
      candidateIds.add((u._id as any).toString());
    });

    for (const idStr of candidateIds) {
      if (!visited.has(idStr)) {
        visited.add(idStr);
        const oid = new mongoose.Types.ObjectId(idStr);
        allReportees.push({ userId: oid, _id: oid });
        await collectReportees(oid, depth + 1);
      }
    }
  };

  await collectReportees(managerId, 1);

  console.log(
    `📋 [HIERARCHY] getAllReporteesRecursive: Found ${allReportees.length} reportees for supervisor ${supervisorId}`,
  );
  console.log(
    `📋 [HIERARCHY] Reportee IDs:`,
    allReportees.map((r) => r.userId?.toString()),
  );

  return allReportees;
};

// Static method: Get supervisor chain (reportee's managers up to top)
UserReportingHierarchySchema.statics.getSupervisorChain = async function (
  reporteeUserId: mongoose.Types.ObjectId,
  projectId?: mongoose.Types.ObjectId,
  maxDepth = 10,
): Promise<mongoose.Types.ObjectId[]> {
  const matchStage: any = {
    reporteeUserId,
    isActive: true,
    effectiveFrom: { $lte: new Date() },
    $or: [
      { effectiveTo: { $exists: false } },
      { effectiveTo: { $gt: new Date() } },
    ],
  };

  if (projectId) {
    matchStage.projectId = projectId;
  }

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $graphLookup: {
        from: "userreportinghierarchies",
        startWith: "$supervisorUserId",
        connectFromField: "supervisorUserId",
        connectToField: "reporteeUserId",
        as: "chain",
        maxDepth: maxDepth - 1,
        restrictSearchWithMatch: {
          isActive: true,
          effectiveFrom: { $lte: new Date() },
          ...(projectId && { projectId }),
        },
      },
    },
    {
      $project: {
        allSupervisors: {
          $concatArrays: [["$supervisorUserId"], "$chain.supervisorUserId"],
        },
      },
    },
    { $unwind: "$allSupervisors" },
    { $group: { _id: null, supervisors: { $addToSet: "$allSupervisors" } } },
  ]);

  return result[0]?.supervisors || [];
};

// Static method: Check for circular dependency
UserReportingHierarchySchema.statics.checkCircularDependency = async function (
  managerId: mongoose.Types.ObjectId,
  employeeId: mongoose.Types.ObjectId,
  projectId?: mongoose.Types.ObjectId,
): Promise<boolean> {
  // Check if the new manager is already (directly or indirectly) reporting to the employee
  // This would create a circular dependency: A reports to B, but we're trying to make B report to A
  const UserReportingHierarchyModel = this as any;
  const supervisorChain = await UserReportingHierarchyModel.getSupervisorChain(
    managerId,
    projectId,
  );
  return supervisorChain.some((id: mongoose.Types.ObjectId) =>
    id.equals(employeeId),
  );
};

export const UserReportingHierarchy = mongoose.model<
  IUserReportingHierarchy,
  IUserReportingHierarchyModel
>("UserReportingHierarchy", UserReportingHierarchySchema);
