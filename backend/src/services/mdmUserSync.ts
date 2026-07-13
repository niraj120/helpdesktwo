/**
 * MDM → User sync.
 * Refreshes existing MDM-managed users (User.mdmSourceId set) from their source:
 * mirrors active/inactive both ways, optionally refreshes profile fields, and
 * flags users no longer present in MDM (and deactivates them).
 */
import { User } from "../models/User";
import MDMSource from "../models/MDMSource";
import { hrmsService } from "./hrmsService";

// Profile fields safe to refresh (email excluded — it's the identity/unique key).
const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "mobile",
  "department",
  "designation",
];

const ACTIVE_KEYS = [
  "isactive",
  "active",
  "status",
  "employeestatus",
  "empstatus",
  "is_active",
  "employee_status",
  "userstatus",
  "activestatus",
];
const ACTIVE_VALS = new Set([
  "1",
  "true",
  "active",
  "a",
  "y",
  "yes",
  "working",
  "enable",
  "enabled",
  "live",
]);
const INACTIVE_VALS = new Set([
  "0",
  "false",
  "inactive",
  "left",
  "resigned",
  "terminated",
  "disabled",
  "n",
  "no",
  "exit",
  "exited",
  "relieved",
  "separated",
]);

/** Resolve active/inactive from a raw MDM record. undefined = unknown (skip). */
function parseActive(
  raw: Record<string, any>,
  statusField?: string,
  activeValues?: string[],
): boolean | undefined {
  let val: any;
  if (statusField && raw?.[statusField] !== undefined) {
    val = raw[statusField];
  } else if (raw) {
    for (const k of Object.keys(raw)) {
      if (ACTIVE_KEYS.includes(k.toLowerCase())) {
        val = raw[k];
        break;
      }
    }
  }
  if (val === undefined || val === null || val === "") return undefined;
  const s = String(val).trim().toLowerCase();
  if (activeValues && activeValues.length) {
    return activeValues.map((v) => v.toLowerCase().trim()).includes(s);
  }
  if (ACTIVE_VALS.has(s)) return true;
  if (INACTIVE_VALS.has(s)) return false;
  return undefined;
}

export interface UserSyncResult {
  source: string;
  checked: number;
  updated: number;
  deactivated: number;
  reactivated: number;
  missing: number;
  unchanged: number;
  errors: number;
}

interface SyncOpts {
  reactivate?: boolean;
  updateProfile?: boolean;
  deactivateMissing?: boolean;
}

function applyRecordToUser(
  u: any,
  rec: any,
  cfg: { statusField?: string; activeValues?: string[] },
  opts: Required<SyncOpts>,
  res: UserSyncResult,
) {
  let changed = false;
  const active = parseActive(rec._raw || rec, cfg.statusField, cfg.activeValues);
  if (active === true && !u.isActive && opts.reactivate) {
    u.isActive = true;
    res.reactivated++;
    changed = true;
  }
  if (active === false && u.isActive) {
    u.isActive = false;
    res.deactivated++;
    changed = true;
  }
  if (opts.updateProfile) {
    for (const f of PROFILE_FIELDS) {
      const v = rec[f];
      if (v && u[f] !== v) {
        u[f] = v;
        changed = true;
      }
    }
    if (u.firstName || u.lastName) {
      u.fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim();
    }
  }
  u.mdmSyncStatus = "synced";
  u.mdmLastSyncedAt = new Date();
  if (changed) res.updated++;
  else res.unchanged++;
  return changed;
}

/** Bulk sync all users belonging to one MDM source. */
export async function syncUsersFromSource(
  sourceId: string,
  opts: SyncOpts = {},
): Promise<UserSyncResult> {
  const source = await MDMSource.findById(sourceId).lean();
  if (!source) throw new Error("MDM source not found");
  const us: any = source.userSync || {};
  const o: Required<SyncOpts> = {
    reactivate: opts.reactivate ?? true,
    updateProfile: opts.updateProfile ?? us.updateProfile ?? true,
    deactivateMissing: opts.deactivateMissing ?? true,
  };

  const { rows } = await hrmsService.listAll(String(sourceId));
  const byCode = new Map<string, any>();
  for (const r of rows) {
    const code = String(r.employeeCode || r._raw?.employeeCode || "")
      .trim()
      .toLowerCase();
    if (code) byCode.set(code, r);
  }

  const users = await User.find({ mdmSourceId: sourceId });
  const res: UserSyncResult = {
    source: source.name,
    checked: users.length,
    updated: 0,
    deactivated: 0,
    reactivated: 0,
    missing: 0,
    unchanged: 0,
    errors: 0,
  };

  for (const u of users) {
    try {
      const code = String(u.employeeCode || "").trim().toLowerCase();
      const rec = code ? byCode.get(code) : undefined;
      if (!rec) {
        u.mdmSyncStatus = "missing_in_mdm";
        u.mdmLastSyncedAt = new Date();
        if (o.deactivateMissing && u.isActive) {
          u.isActive = false;
          res.deactivated++;
        }
        res.missing++;
        await u.save();
        continue;
      }
      applyRecordToUser(
        u,
        rec,
        { statusField: us.statusField, activeValues: us.activeValues },
        o,
        res,
      );
      await u.save();
    } catch (e) {
      res.errors++;
      console.error("[mdm-sync] user error:", (e as any)?.message);
    }
  }
  return res;
}

/** Sync a single MDM-managed user. */
export async function syncSingleUser(userId: string): Promise<UserSyncResult> {
  const u = await User.findById(userId);
  if (!u) throw new Error("User not found");
  if (!u.mdmSourceId) throw new Error("User is not MDM-managed");
  const source = await MDMSource.findById(u.mdmSourceId).lean();
  if (!source) throw new Error("MDM source not found");
  const us: any = source.userSync || {};
  const o: Required<SyncOpts> = {
    reactivate: true,
    updateProfile: us.updateProfile ?? true,
    deactivateMissing: true,
  };

  const rec = await hrmsService.syncEmployeeData(
    String(u.employeeCode || ""),
    String(u.mdmSourceId),
  );
  const res: UserSyncResult = {
    source: source.name,
    checked: 1,
    updated: 0,
    deactivated: 0,
    reactivated: 0,
    missing: 0,
    unchanged: 0,
    errors: 0,
  };
  if (!rec) {
    u.mdmSyncStatus = "missing_in_mdm";
    u.mdmLastSyncedAt = new Date();
    if (u.isActive) {
      u.isActive = false;
      res.deactivated++;
    }
    res.missing++;
  } else {
    applyRecordToUser(
      u,
      rec,
      { statusField: us.statusField, activeValues: us.activeValues },
      o,
      res,
    );
  }
  await u.save();
  return res;
}

/** Sync every source that has userSync enabled (used by the scheduler & "sync all"). */
export async function syncAllEnabledSources(): Promise<UserSyncResult[]> {
  const sources = await MDMSource.find({ "userSync.enabled": true })
    .select("_id")
    .lean();
  const out: UserSyncResult[] = [];
  for (const s of sources) {
    try {
      out.push(await syncUsersFromSource(String(s._id)));
    } catch (e) {
      console.error("[mdm-sync] source error:", (e as any)?.message);
    }
  }
  return out;
}
