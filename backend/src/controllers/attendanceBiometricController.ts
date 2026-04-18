import { Request, Response } from "express";
import axios from "axios";
import mongoose from "mongoose";
import { User } from "../models/User";
import { AttendanceConfig } from "../models/attendance/AttendanceConfig";
import { BiometricSyncLog } from "../models/attendance/BiometricSyncLog";

const SYNC_DELAY_MS = 1200; // 1.2s between AFT calls = max 50 calls/min

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/employees?projectId=&syncStatus=&search=&page=&limit=
// ─────────────────────────────────────────────────────────────────────────────
export const getEmployeesForSync = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId, syncStatus, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      200,
      Math.max(1, parseInt(req.query.limit as string) || 50),
    );

    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    const query: Record<string, unknown> = {
      projects: new mongoose.Types.ObjectId(projectId as string),
      isActive: true,
    };

    // Status filter
    if (syncStatus === "synced") {
      query.biometricSynced = true;
    } else if (syncStatus === "not_synced") {
      query.biometricSynced = { $ne: true };
      query.biometricSyncError = { $in: [null, undefined, ""] };
    } else if (syncStatus === "sync_failed") {
      query.biometricSyncError = { $exists: true, $ne: "" };
    }

    // Search filter
    if (search) {
      const re = new RegExp(search as string, "i");
      query.$or = [
        { fullName: re },
        { firstName: re },
        { lastName: re },
        { employeeCode: re },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select(
          "_id employeeCode firstName lastName fullName email payrollNumber biometricSynced biometricEmployeeId biometricDeviceId biometricSyncedAt biometricSyncError",
        )
        .collation({ locale: "en" })
        .sort({ fullName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    const data = users.map((u) => ({
      userId: u._id,
      employeeCode: u.employeeCode || "",
      name:
        u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" ") || "",
      email: u.email,
      payrollNumber: u.payrollNumber ?? null,
      biometricSynced: u.biometricSynced ?? false,
      biometricEmployeeId: u.biometricEmployeeId ?? null,
      biometricDeviceId: u.biometricDeviceId ?? null,
      biometricSyncedAt: u.biometricSyncedAt ?? null,
      biometricSyncError: u.biometricSyncError ?? null,
    }));

    res.json({ data, meta: { total, page, limit } });
  } catch (err) {
    console.error("[BiometricSync] getEmployeesForSync error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/attendance/employees/:userId/payroll
// Body: { payrollNumber }
// ─────────────────────────────────────────────────────────────────────────────
export const updatePayrollNumber = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { payrollNumber } = req.body;

    if (payrollNumber === undefined || payrollNumber === null) {
      res.status(400).json({ message: "payrollNumber is required" });
      return;
    }

    const parsed = parseInt(String(payrollNumber), 10);
    if (isNaN(parsed) || parsed < 1) {
      res
        .status(400)
        .json({ message: "payrollNumber must be a positive integer" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { payrollNumber: parsed },
      { new: true, select: "_id payrollNumber" },
    );

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({ userId: user._id, payrollNumber: user.payrollNumber });
  } catch (err) {
    console.error("[BiometricSync] updatePayrollNumber error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/employees/biometric-sync
// Body: { projectId, userIds: string[] }
// ─────────────────────────────────────────────────────────────────────────────
export const triggerBiometricSync = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId, userIds } = req.body;

    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }
    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ message: "userIds must be a non-empty array" });
      return;
    }

    const config = await AttendanceConfig.findOne({ projectId });
    if (!config || !config.apiKeyEncrypted) {
      res.status(400).json({
        message: "No AFT API credentials configured for this project",
      });
      return;
    }

    const token = config.getDecryptedApiKey();
    const addEmployeeUrl = `${config.aftBaseUrl}/${config.aftProjectPrefix}/add-employee`;
    const updateEmployeeUrl = `${config.aftBaseUrl}/${config.aftProjectPrefix}/update-employee`;
    const triggeredBy = (req as Request & { user?: { _id: string } }).user?._id;

    const results: Array<{
      userId: string;
      employeeCode: string;
      status: "success" | "failed";
      aftEmployeeId?: number;
      aftBiometricId?: number;
      error?: string;
    }> = [];

    let succeeded = 0;
    let failed = 0;

    for (const userId of userIds) {
      const user = await User.findById(userId).select(
        "_id employeeCode firstName lastName fullName payrollNumber biometricEmployeeId biometricDeviceId projects",
      );

      if (!user) {
        failed++;
        results.push({
          userId,
          employeeCode: "",
          status: "failed",
          error: "User not found",
        });
        continue;
      }

      if (!user.payrollNumber) {
        failed++;
        results.push({
          userId,
          employeeCode: user.employeeCode || "",
          status: "failed",
          error: "Payroll number missing",
        });
        continue;
      }

      // ── Call AFT add-employee or update-employee ──────────────
      const employeeName =
        user.fullName ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.employeeCode;

      const aftPayload = {
        Name: employeeName,
        userid: user.employeeCode,
        payroll: user.payrollNumber,
      };

      let aftResponse: {
        status: string;
        message?: string;
        data?: {
          EmployeeID: number;
          EmployeeBiometricID: number;
          Name: string;
          UserID: string;
          Payroll_Type: number;
        };
      };

      // If already synced, try update-employee first; otherwise add-employee
      const isAlreadySynced = !!user.biometricEmployeeId;
      const primaryUrl = isAlreadySynced ? updateEmployeeUrl : addEmployeeUrl;
      const fallbackUrl = isAlreadySynced ? addEmployeeUrl : null;

      const callAft = async (url: string) => {
        const response = await axios.post(url, aftPayload, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        });
        return response.data;
      };

      try {
        aftResponse = await callAft(primaryUrl);

        // If update-employee returned non-success (employee not found on AFT side),
        // fall back to add-employee
        if (
          isAlreadySynced &&
          aftResponse.status !== "success" &&
          fallbackUrl
        ) {
          aftResponse = await callAft(fallbackUrl);
        }

        // If add-employee says "already exists", try update-employee
        if (
          !isAlreadySynced &&
          aftResponse.status !== "success" &&
          /already|exist/i.test(aftResponse.message || "")
        ) {
          aftResponse = await callAft(updateEmployeeUrl);
        }
      } catch (httpErr: unknown) {
        const errMsg =
          httpErr instanceof Error ? httpErr.message : "Network error";

        await User.findByIdAndUpdate(userId, {
          biometricSynced: false,
          biometricSyncError: errMsg,
        });

        await BiometricSyncLog.create({
          projectId,
          userId,
          employeeCode: user.employeeCode,
          payrollNumber: user.payrollNumber,
          triggeredBy: triggeredBy || null,
          status: "FAILED",
          errorMessage: errMsg,
        });

        failed++;
        results.push({
          userId,
          employeeCode: user.employeeCode || "",
          status: "failed",
          error: errMsg,
        });

        await sleep(SYNC_DELAY_MS);
        continue;
      }

      if (aftResponse.status === "success") {
        // update-employee may not return data — fall back to what's already stored
        const EmployeeID =
          aftResponse.data?.EmployeeID ?? user.biometricEmployeeId ?? null;
        const EmployeeBiometricID =
          aftResponse.data?.EmployeeBiometricID ??
          user.biometricDeviceId ??
          null;

        await User.findByIdAndUpdate(userId, {
          biometricSynced: true,
          biometricEmployeeId: EmployeeID,
          biometricDeviceId: EmployeeBiometricID,
          biometricSyncedAt: new Date(),
          biometricSyncError: null,
        });

        await BiometricSyncLog.create({
          projectId,
          userId,
          employeeCode: user.employeeCode,
          payrollNumber: user.payrollNumber,
          triggeredBy: triggeredBy || null,
          status: "SUCCESS",
          aftEmployeeId: EmployeeID,
          aftBiometricId: EmployeeBiometricID,
          aftResponse,
        });

        succeeded++;
        results.push({
          userId,
          employeeCode: user.employeeCode || "",
          status: "success",
          aftEmployeeId: EmployeeID ?? undefined,
          aftBiometricId: EmployeeBiometricID ?? undefined,
        });
      } else {
        const errMsg = aftResponse.message || "Unknown AFT error";

        await User.findByIdAndUpdate(userId, {
          biometricSynced: false,
          biometricSyncError: errMsg,
        });

        await BiometricSyncLog.create({
          projectId,
          userId,
          employeeCode: user.employeeCode,
          payrollNumber: user.payrollNumber,
          triggeredBy: triggeredBy || null,
          status: "FAILED",
          aftResponse,
          errorMessage: errMsg,
        });

        failed++;
        results.push({
          userId,
          employeeCode: user.employeeCode || "",
          status: "failed",
          error: errMsg,
        });
      }

      await sleep(SYNC_DELAY_MS);
    }

    res.json({
      total: userIds.length,
      succeeded,
      failed,
      results,
    });
  } catch (err) {
    console.error("[BiometricSync] triggerBiometricSync error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/employees/biometric-sync/logs?projectId=&userId=&status=&page=
// ─────────────────────────────────────────────────────────────────────────────
export const getBiometricSyncLogs = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId, userId, status } = req.query;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 30),
    );

    const query: Record<string, unknown> = { projectId };
    if (userId) query.userId = userId;
    if (status) query.status = status;

    const [logs, total] = await Promise.all([
      BiometricSyncLog.find(query)
        .sort({ syncedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BiometricSyncLog.countDocuments(query),
    ]);

    res.json({ data: logs, meta: { total, page, limit } });
  } catch (err) {
    console.error("[BiometricSync] getBiometricSyncLogs error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/employees/download-csv?projectId=
// ─────────────────────────────────────────────────────────────────────────────
export const downloadEmployeeCsv = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    const users = await User.find({
      projects: new mongoose.Types.ObjectId(projectId as string),
      isActive: true,
    })
      .select("employeeCode fullName email payrollNumber")
      .sort({ fullName: 1 })
      .lean();

    const today = new Date().toISOString().split("T")[0];
    const filename = `employees_${projectId}_${today}.csv`;

    const header = "Employee ID,Name,Email,Payroll Number\n";
    const rows = users
      .map(
        (u) =>
          `"${u.employeeCode || ""}","${(u.fullName || "").replace(/"/g, '""')}","${u.email}","${u.payrollNumber ?? ""}"`,
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(header + rows);
  } catch (err) {
    console.error("[BiometricSync] downloadEmployeeCsv error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
