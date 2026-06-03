/**
 * am_* Widget Handlers — Asset Management
 *
 * Keys: am_total_asset_types, am_total_required, am_total_assigned,
 *       am_required_vs_assigned, am_working_assets, am_non_working_assets,
 *       am_asset_health_rate, am_utilization_rate, am_audits_submitted,
 *       am_audits_pending, am_audit_compliance_rate, am_assets_overdue_audit,
 *       am_by_category, am_by_center, am_audit_activity_trend
 *
 * Models used:
 *   Asset              — projectId, name, predefinedCount, category, isActive
 *   CenterAssetMapping — projectId, centerId, assetId, totalAssigned, workingAsset,
 *                        notWorkingAsset, assetUsed, auditSubmitted, nextAuditDate
 *   AssetAuditLog      — centerAssetMappingId, centerId, assetId, changedAt
 *   AssetCategory      — name, projectId
 *   Center             — centerName
 */

import mongoose from "mongoose";
import {
  QueryHandler,
  WidgetData,
  buildDateRange,
  registerWidgetHandler,
} from "../widgetQueryEngine";

const getAsset = () => mongoose.model("Asset");
const getMapping = () => mongoose.model("CenterAssetMapping");
const getAuditLog = () => mongoose.model("AssetAuditLog");

// ─── am_total_asset_types ─────────────────────────────────────────────────────
const amTotalAssetTypesHandler: QueryHandler = {
  widgetKey: "am_total_asset_types",
  cacheTtlSeconds: 600,
  async execute(ctx): Promise<WidgetData> {
    const value = await getAsset().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      isActive: true,
    });
    return { value };
  },
};

// ─── am_total_required (sum of predefinedCount across all active asset types) ──
const amTotalRequiredHandler: QueryHandler = {
  widgetKey: "am_total_required",
  cacheTtlSeconds: 600,
  async execute(ctx, params, rf): Promise<WidgetData> {
    // Manual override from widget config (super admin can set this in the builder)
    if (params.targetCount != null && params.targetCount > 0) {
      return { value: params.targetCount };
    }
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId) {
      // Center view: sum totalAssigned for this center (the configured quantity IS the requirement per center)
      const cid = new mongoose.Types.ObjectId(String(effectiveCentreId));
      const res = await getMapping().aggregate([
        { $match: { projectId: pid, centerId: cid } },
        { $group: { _id: null, total: { $sum: "$totalAssigned" } } },
      ]);
      return { value: res[0]?.total ?? 0 };
    }
    // Project-wide fallback (admin view): sum predefinedCount across all active asset types
    const res = await getAsset().aggregate([
      { $match: { projectId: pid, isActive: true } },
      { $group: { _id: null, total: { $sum: "$predefinedCount" } } },
    ]);
    return { value: res[0]?.total ?? 0 };
  },
};

// ─── am_total_assigned (sum of totalAssigned from all center-asset mappings) ──
const amTotalAssignedHandler: QueryHandler = {
  widgetKey: "am_total_assigned",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const match: Record<string, any> = { projectId: pid };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      match.centerId = new mongoose.Types.ObjectId(String(effectiveCentreId));
    const res = await getMapping().aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$totalAssigned" } } },
    ]);
    return { value: res[0]?.total ?? 0 };
  },
};

// ─── am_required_vs_assigned (required qty vs actual assigned + gap) ──────────
const amRequiredVsAssignedHandler: QueryHandler = {
  widgetKey: "am_required_vs_assigned",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    let required: number;
    let assigned: number;
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId) {
      const cid = new mongoose.Types.ObjectId(String(effectiveCentreId));
      const [assignedRes, mappedAssetIds] = await Promise.all([
        getMapping().aggregate([
          { $match: { projectId: pid, centerId: cid } },
          { $group: { _id: null, total: { $sum: "$totalAssigned" } } },
        ]),
        getMapping().distinct("assetId", { projectId: pid, centerId: cid }),
      ]);
      assigned = assignedRes[0]?.total ?? 0;
      const reqRes = await getAsset().aggregate([
        {
          $match: {
            projectId: pid,
            isActive: true,
            _id: { $in: mappedAssetIds },
          },
        },
        { $group: { _id: null, total: { $sum: "$predefinedCount" } } },
      ]);
      required = reqRes[0]?.total ?? 0;
    } else {
      const [requiredRes, assignedRes] = await Promise.all([
        getAsset().aggregate([
          { $match: { projectId: pid, isActive: true } },
          { $group: { _id: null, total: { $sum: "$predefinedCount" } } },
        ]),
        getMapping().aggregate([
          { $match: { projectId: pid } },
          { $group: { _id: null, total: { $sum: "$totalAssigned" } } },
        ]),
      ]);
      required = requiredRes[0]?.total ?? 0;
      assigned = assignedRes[0]?.total ?? 0;
    }
    const gap = required - assigned;
    return {
      value: gap,
      series: [
        {
          key: "required",
          label: "Required",
          color: "#6366f1",
          data: [{ x: "Assets", y: required }],
        },
        {
          key: "assigned",
          label: "Assigned",
          color: "#22c55e",
          data: [{ x: "Assets", y: assigned }],
        },
      ],
      subtitle:
        gap > 0
          ? `${gap} units under-assigned`
          : gap < 0
            ? `${Math.abs(gap)} units over-assigned`
            : "Fully balanced",
      trendDirection: "lower_is_better",
    };
  },
};

// ─── am_working_assets ────────────────────────────────────────────────────────
const amWorkingAssetsHandler: QueryHandler = {
  widgetKey: "am_working_assets",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const match: Record<string, any> = { projectId: pid };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      match.centerId = new mongoose.Types.ObjectId(String(effectiveCentreId));
    const res = await getMapping().aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$workingAsset" } } },
    ]);
    return { value: res[0]?.total ?? 0, trendDirection: "higher_is_better" };
  },
};

// ─── am_non_working_assets ────────────────────────────────────────────────────
const amNonWorkingAssetsHandler: QueryHandler = {
  widgetKey: "am_non_working_assets",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const match: Record<string, any> = { projectId: pid };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      match.centerId = new mongoose.Types.ObjectId(String(effectiveCentreId));
    const res = await getMapping().aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$notWorkingAsset" } } },
    ]);
    return { value: res[0]?.total ?? 0, trendDirection: "lower_is_better" };
  },
};

// ─── am_asset_health_rate (working / (working + notWorking) × 100) ────────────
const amAssetHealthRateHandler: QueryHandler = {
  widgetKey: "am_asset_health_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const match: Record<string, any> = { projectId: pid };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      match.centerId = new mongoose.Types.ObjectId(String(effectiveCentreId));
    const res = await getMapping().aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          working: { $sum: "$workingAsset" },
          notWorking: { $sum: "$notWorkingAsset" },
        },
      },
    ]);
    const w = res[0]?.working ?? 0;
    const nw = res[0]?.notWorking ?? 0;
    const total = w + nw;
    const value = total > 0 ? Math.round((w / total) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `${w} working / ${nw} not working`,
      thresholds: { green: 90, amber: 75 },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── am_utilization_rate (assetUsed / totalAssigned × 100) ───────────────────
const amUtilizationRateHandler: QueryHandler = {
  widgetKey: "am_utilization_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const match: Record<string, any> = { projectId: pid };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      match.centerId = new mongoose.Types.ObjectId(String(effectiveCentreId));
    const res = await getMapping().aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          used: { $sum: "$assetUsed" },
          assigned: { $sum: "$totalAssigned" },
        },
      },
    ]);
    const used = res[0]?.used ?? 0;
    const assigned = res[0]?.assigned ?? 0;
    const value =
      assigned > 0 ? Math.round((used / assigned) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `${used} used of ${assigned} assigned`,
      thresholds: { green: 80, amber: 60 },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── am_audits_submitted ──────────────────────────────────────────────────────
const amAuditsSubmittedHandler: QueryHandler = {
  widgetKey: "am_audits_submitted",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const filter: Record<string, any> = {
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      auditSubmitted: true,
    };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      filter.centerId = new mongoose.Types.ObjectId(String(effectiveCentreId));
    const value = await getMapping().countDocuments(filter);
    return { value, trendDirection: "higher_is_better" };
  },
};

// ─── am_audits_pending ────────────────────────────────────────────────────────
const amAuditsPendingHandler: QueryHandler = {
  widgetKey: "am_audits_pending",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const filter: Record<string, any> = {
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      auditSubmitted: { $ne: true },
    };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      filter.centerId = new mongoose.Types.ObjectId(String(effectiveCentreId));
    const value = await getMapping().countDocuments(filter);
    return { value, trendDirection: "lower_is_better" };
  },
};

// ─── am_audit_compliance_rate (submitted / total × 100) ──────────────────────
const amAuditComplianceRateHandler: QueryHandler = {
  widgetKey: "am_audit_compliance_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const baseFilter: Record<string, any> = { projectId: pid };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      baseFilter.centerId = new mongoose.Types.ObjectId(
        String(effectiveCentreId),
      );
    const [submitted, total] = await Promise.all([
      getMapping().countDocuments({ ...baseFilter, auditSubmitted: true }),
      getMapping().countDocuments(baseFilter),
    ]);
    const value =
      total > 0 ? Math.round((submitted / total) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `${submitted} of ${total} audits submitted`,
      thresholds: { green: 90, amber: 70 },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── am_assets_overdue_audit (nextAuditDate < now AND not submitted) ──────────
const amAssetsOverdueAuditHandler: QueryHandler = {
  widgetKey: "am_assets_overdue_audit",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const filter: Record<string, any> = {
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      nextAuditDate: { $lt: new Date() },
      auditSubmitted: { $ne: true },
    };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      filter.centerId = new mongoose.Types.ObjectId(String(effectiveCentreId));
    const value = await getMapping().countDocuments(filter);
    return { value, trendDirection: "lower_is_better" };
  },
};

// ─── am_by_category (working/not-working breakdown per asset category) ─────────
const amByCategoryHandler: QueryHandler = {
  widgetKey: "am_by_category",
  cacheTtlSeconds: 600,
  async execute(ctx, _params, rf): Promise<WidgetData> {
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const match: Record<string, any> = { projectId: pid };
    const effectiveCentreId = rf.centreId ?? ctx.centreId;
    if (effectiveCentreId)
      match.centerId = new mongoose.Types.ObjectId(String(effectiveCentreId));
    const rows = await getMapping().aggregate([
      { $match: match },
      {
        $lookup: {
          from: "assets",
          localField: "assetId",
          foreignField: "_id",
          as: "asset",
        },
      },
      { $unwind: { path: "$asset", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "assetcategories",
          localField: "asset.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$category.name", "Uncategorized"] },
          totalAssigned: { $sum: "$totalAssigned" },
          working: { $sum: "$workingAsset" },
          notWorking: { $sum: "$notWorkingAsset" },
          assetUsed: { $sum: "$assetUsed" },
        },
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          totalAssigned: 1,
          working: 1,
          notWorking: 1,
          assetUsed: 1,
          healthRate: {
            $cond: [
              { $gt: [{ $add: ["$working", "$notWorking"] }, 0] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          "$working",
                          { $add: ["$working", "$notWorking"] },
                        ],
                      },
                      100,
                    ],
                  },
                  1,
                ],
              },
              null,
            ],
          },
        },
      },
      { $sort: { totalAssigned: -1 } },
    ]);
    return { segments: rows };
  },
};

// ─── am_by_center (working/not-working + health rate per center) ──────────────
const amByCenterHandler: QueryHandler = {
  widgetKey: "am_by_center",
  cacheTtlSeconds: 600,
  async execute(ctx): Promise<WidgetData> {
    const rows = await getMapping().aggregate([
      { $match: { projectId: new mongoose.Types.ObjectId(ctx.tenantId) } },
      {
        $lookup: {
          from: "centers",
          localField: "centerId",
          foreignField: "_id",
          as: "center",
        },
      },
      { $unwind: { path: "$center", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$center.centerName", "Unassigned"] },
          totalAssigned: { $sum: "$totalAssigned" },
          working: { $sum: "$workingAsset" },
          notWorking: { $sum: "$notWorkingAsset" },
          assetUsed: { $sum: "$assetUsed" },
          auditsDone: { $sum: { $cond: ["$auditSubmitted", 1, 0] } },
          totalMappings: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          center: "$_id",
          totalAssigned: 1,
          working: 1,
          notWorking: 1,
          assetUsed: 1,
          auditsDone: 1,
          totalMappings: 1,
          healthRate: {
            $cond: [
              { $gt: [{ $add: ["$working", "$notWorking"] }, 0] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          "$working",
                          { $add: ["$working", "$notWorking"] },
                        ],
                      },
                      100,
                    ],
                  },
                  1,
                ],
              },
              null,
            ],
          },
          auditRate: {
            $cond: [
              { $gt: ["$totalMappings", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$auditsDone", "$totalMappings"] },
                      100,
                    ],
                  },
                  1,
                ],
              },
              null,
            ],
          },
        },
      },
      { $sort: { totalAssigned: -1 } },
    ]);
    return { segments: rows };
  },
};

// ─── am_audit_activity_trend (daily audit log changes over time) ───────────────
const amAuditActivityTrendHandler: QueryHandler = {
  widgetKey: "am_audit_activity_trend",
  cacheTtlSeconds: 600,
  async execute(ctx, params, rf): Promise<WidgetData> {
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    // AssetAuditLog has no projectId — join through CenterAssetMapping
    const rows = await getAuditLog().aggregate([
      {
        $lookup: {
          from: "centerassetmappings",
          localField: "centerAssetMappingId",
          foreignField: "_id",
          as: "mapping",
        },
      },
      { $unwind: "$mapping" },
      {
        $match: {
          "mapping.projectId": pid,
          ...(() => {
            const eCid = rf.centreId ?? ctx.centreId;
            return eCid
              ? {
                  "mapping.centerId": new mongoose.Types.ObjectId(String(eCid)),
                }
              : {};
          })(),
          changedAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$changedAt" } },
          changes: { $sum: 1 },
          working: {
            $sum: { $cond: [{ $eq: ["$changeType", "working_asset"] }, 1, 0] },
          },
          notWorking: {
            $sum: {
              $cond: [{ $eq: ["$changeType", "not_working_asset"] }, 1, 0],
            },
          },
          both: { $sum: { $cond: [{ $eq: ["$changeType", "both"] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          changes: 1,
          working: 1,
          notWorking: 1,
          both: 1,
        },
      },
      { $sort: { date: 1 } },
    ]);
    return {
      series: [
        {
          key: "changes",
          label: "Total Changes",
          color: "#6366f1",
          data: rows.map((r: any) => ({ x: r.date, y: r.changes })),
        },
        {
          key: "working",
          label: "Working Updated",
          color: "#22c55e",
          data: rows.map((r: any) => ({ x: r.date, y: r.working })),
        },
        {
          key: "notWorking",
          label: "Faults Reported",
          color: "#ef4444",
          data: rows.map((r: any) => ({ x: r.date, y: r.notWorking })),
        },
      ],
      xAxisLabel: "Date",
      yAxisLabel: "Audit Events",
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ─── Registration ─────────────────────────────────────────────────────────────
export function registerAssetMgmtHandlers(): void {
  registerWidgetHandler(amTotalAssetTypesHandler);
  registerWidgetHandler(amTotalRequiredHandler);
  registerWidgetHandler(amTotalAssignedHandler);
  registerWidgetHandler(amRequiredVsAssignedHandler);
  registerWidgetHandler(amWorkingAssetsHandler);
  registerWidgetHandler(amNonWorkingAssetsHandler);
  registerWidgetHandler(amAssetHealthRateHandler);
  registerWidgetHandler(amUtilizationRateHandler);
  registerWidgetHandler(amAuditsSubmittedHandler);
  registerWidgetHandler(amAuditsPendingHandler);
  registerWidgetHandler(amAuditComplianceRateHandler);
  registerWidgetHandler(amAssetsOverdueAuditHandler);
  registerWidgetHandler(amByCategoryHandler);
  registerWidgetHandler(amByCenterHandler);
  registerWidgetHandler(amAuditActivityTrendHandler);
  console.log(
    "📊 Dashboard Engine: am_* Asset Management handlers registered (15)",
  );
}
