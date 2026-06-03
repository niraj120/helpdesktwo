/**
 * att_* Widget Handlers — raw attendance metrics from AttendanceRecord
 * Keys: att_total_checkins, att_present_today, att_absent_today,
 *       att_attendance_rate, att_absenteeism_rate, att_late_arrivals,
 *       att_daily_trend, att_by_batch, att_by_course
 */

import mongoose from "mongoose";
import {
  QueryHandler,
  WidgetData,
  buildDateRange,
  registerWidgetHandler,
} from "../widgetQueryEngine";

const getAttendance = () => mongoose.model("AttendanceRecord");

// Statuses that count as Present (includes leave/holiday days that are still
// considered "accounted-for" attendance: CL, PL, H).
// Everything else — M/p, A, AB, ABSENT, WFH, OD, etc. — counts as Absent.
const PRESENT_STATUSES = [
  "P",
  "CL",
  "PL",
  "H",
  "L",
  "LATE",
  "Late",
  "late",
  "LT",
];
const LATE_STATUSES = ["L", "LATE", "Late", "late", "LT"];

// ─── att_total_checkins ───────────────────────────────────────────────────────
const attTotalCheckinsHandler: QueryHandler = {
  widgetKey: "att_total_checkins",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await getAttendance().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      attendanceDate: { $gte: start, $lte: end },
    });
    return { value, trendDirection: "higher_is_better" };
  },
};

// ─── att_present_today ────────────────────────────────────────────────────────
const attPresentTodayHandler: QueryHandler = {
  widgetKey: "att_present_today",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await getAttendance().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      attendanceDate: { $gte: start, $lte: end },
      status: { $in: PRESENT_STATUSES },
    });
    return { value, trendDirection: "higher_is_better" };
  },
};

// ─── att_absent_today ─────────────────────────────────────────────────────────
const attAbsentTodayHandler: QueryHandler = {
  widgetKey: "att_absent_today",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await getAttendance().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      attendanceDate: { $gte: start, $lte: end },
      status: { $nin: PRESENT_STATUSES },
    });
    return { value, trendDirection: "lower_is_better" };
  },
};

// ─── att_attendance_rate ──────────────────────────────────────────────────────
const attAttendanceRateHandler: QueryHandler = {
  widgetKey: "att_attendance_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const AR = getAttendance();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const dateFilter = { $gte: start, $lte: end };
    const [present, total] = await Promise.all([
      AR.countDocuments({
        projectId: pid,
        attendanceDate: dateFilter,
        status: { $in: PRESENT_STATUSES },
      }),
      AR.countDocuments({ projectId: pid, attendanceDate: dateFilter }),
    ]);
    const value = total > 0 ? Math.round((present / total) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `${present} of ${total} present`,
      thresholds: { green: 80, amber: 60 },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── att_absenteeism_rate ─────────────────────────────────────────────────────
const attAbsenteeismRateHandler: QueryHandler = {
  widgetKey: "att_absenteeism_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const AR = getAttendance();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const dateFilter = { $gte: start, $lte: end };
    const [absent, total] = await Promise.all([
      AR.countDocuments({
        projectId: pid,
        attendanceDate: dateFilter,
        status: { $nin: PRESENT_STATUSES },
      }),
      AR.countDocuments({ projectId: pid, attendanceDate: dateFilter }),
    ]);
    const value = total > 0 ? Math.round((absent / total) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `${absent} of ${total} absent`,
      thresholds: { green: 10, amber: 20 },
      trendDirection: "lower_is_better",
    };
  },
};

// ─── att_late_arrivals ────────────────────────────────────────────────────────
const attLateArrivalsHandler: QueryHandler = {
  widgetKey: "att_late_arrivals",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await getAttendance().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      attendanceDate: { $gte: start, $lte: end },
      status: { $in: LATE_STATUSES },
    });
    return { value, trendDirection: "lower_is_better" };
  },
};

// ─── att_daily_trend ──────────────────────────────────────────────────────────
const attDailyTrendHandler: QueryHandler = {
  widgetKey: "att_daily_trend",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );
    const rows = await getAttendance().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          attendanceDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$attendanceDate" },
          },
          total: { $sum: 1 },
          present: {
            $sum: { $cond: [{ $in: ["$status", PRESENT_STATUSES] }, 1, 0] },
          },
          absent: {
            $sum: {
              $cond: [{ $not: [{ $in: ["$status", PRESENT_STATUSES] }] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          total: 1,
          present: 1,
          absent: 1,
        },
      },
      { $sort: { date: 1 } },
    ]);
    return {
      series: [
        {
          key: "present",
          label: "Present",
          color: "#22c55e",
          data: rows.map((r: any) => ({ x: r.date, y: r.present })),
        },
        {
          key: "absent",
          label: "Absent",
          color: "#ef4444",
          data: rows.map((r: any) => ({ x: r.date, y: r.absent })),
        },
      ],
      xAxisLabel: "Date",
      yAxisLabel: "Count",
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ─── att_by_batch (proxy: group by center field on AttendanceRecord) ──────────
const attByBatchHandler: QueryHandler = {
  widgetKey: "att_by_batch",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const rows = await getAttendance().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          attendanceDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$center", "Unknown"] },
          total: { $sum: 1 },
          present: {
            $sum: { $cond: [{ $in: ["$status", PRESENT_STATUSES] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          batch: "$_id",
          total: 1,
          present: 1,
          rate: {
            $cond: [
              { $gt: ["$total", 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ["$present", "$total"] }, 100] },
                  1,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { total: -1 } },
    ]);
    return { segments: rows };
  },
};

// ─── att_by_course (proxy: group by user.department via lookup) ───────────────
const attByCourseHandler: QueryHandler = {
  widgetKey: "att_by_course",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const rows = await getAttendance().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          attendanceDate: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$user.department", "Unknown"] },
          total: { $sum: 1 },
          present: {
            $sum: { $cond: [{ $in: ["$status", PRESENT_STATUSES] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          course: "$_id",
          total: 1,
          present: 1,
          rate: {
            $cond: [
              { $gt: ["$total", 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ["$present", "$total"] }, 100] },
                  1,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { total: -1 } },
    ]);
    return { segments: rows };
  },
};

// ─── Registration ─────────────────────────────────────────────────────────────
export function registerAttRawHandlers(): void {
  registerWidgetHandler(attTotalCheckinsHandler);
  registerWidgetHandler(attPresentTodayHandler);
  registerWidgetHandler(attAbsentTodayHandler);
  registerWidgetHandler(attAttendanceRateHandler);
  registerWidgetHandler(attAbsenteeismRateHandler);
  registerWidgetHandler(attLateArrivalsHandler);
  registerWidgetHandler(attDailyTrendHandler);
  registerWidgetHandler(attByBatchHandler);
  registerWidgetHandler(attByCourseHandler);
  console.log("📊 Dashboard Engine: att_* handlers registered (9)");
}
