import zlib from "zlib";
import mongoose from "mongoose";
import ActivityLog from "../models/ActivityLog";
import { getAuditArchiveSettings } from "../models/AuditArchiveSettings";
import { gcsBucket, gcsBucketName } from "./gcsService";

/**
 * GCP archival for the audit log.
 *
 * Hot rows live in MongoDB. A daily job moves rows older than the configured
 * retention window to GCS as gzipped NDJSON, partitioned by the row's date
 * (<prefix>/YYYY/MM/DD/part-<ids>.jsonl.gz), verifies the upload, then deletes
 * those rows from Mongo. Retrievable on demand via readArchive() (see the audit
 * controller), or by pointing a BigQuery external table at the same gs:// path.
 *
 * Reuses the SAME GCS bucket + credentials as the Knowledge Base (gcsService),
 * under a separate folder — no second bucket/key to configure. The enable
 * toggle and retention window are DB-backed (AuditArchiveSettings), editable
 * from the UI. Only the folder prefix is env-tunable.
 *
 * Env:
 *   AUDIT_ARCHIVE_PREFIX  folder within the KB bucket (default "activity-logs")
 *   (bucket + creds come from the KB GCS config: GCS_BUCKET_NAME / gcs-key.json)
 */

const PREFIX = process.env.AUDIT_ARCHIVE_PREFIX || "activity-logs";
const BATCH = 5000;

/**
 * Whether cloud storage is available (the shared KB bucket). Hard prerequisite
 * for BOTH reading and writing the archive; the enable toggle and retention
 * window are behavioural and live in the DB settings instead.
 */
export const isBucketConfigured = (): boolean => !!gcsBucket;

/** Resolve effective archival settings: bucket from KB GCS, rest from the DB. */
export const getEffectiveArchiveSettings = async (): Promise<{
  bucketConfigured: boolean;
  enabled: boolean;
  retentionDays: number;
}> => {
  const bucketConfigured = isBucketConfigured();
  const s = await getAuditArchiveSettings();
  return {
    bucketConfigured,
    enabled: bucketConfigured && s.enabled,
    retentionDays: s.retentionDays,
  };
};

const pad = (n: number) => String(n).padStart(2, "0");

/** GCS object key for a partition + batch, partitioned by the cutoff date. */
const objectKey = (d: Date, marker: string): string =>
  `${PREFIX}/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(
    d.getUTCDate(),
  )}/part-${marker}.jsonl.gz`;

/**
 * Run one archival pass. Returns the number of rows archived + deleted.
 * `now` is injectable for testing/scheduling (avoids Date.now in callers).
 */
export const runAuditArchival = async (now: Date = new Date()): Promise<{
  archived: number;
  batches: number;
  skippedReason?: string;
}> => {
  const s = await getEffectiveArchiveSettings();
  if (!s.bucketConfigured)
    return { archived: 0, batches: 0, skippedReason: "no bucket configured" };
  if (!s.enabled)
    return { archived: 0, batches: 0, skippedReason: "archival disabled" };

  const cutoff = new Date(now.getTime() - s.retentionDays * 86400_000);
  const bucket = gcsBucket!; // shared KB bucket (guarded by isBucketConfigured)

  let archived = 0;
  let batches = 0;

  // Loop batches until no rows older than the cutoff remain.
  for (;;) {
    const rows = await ActivityLog.find({ timestamp: { $lt: cutoff } })
      .sort({ timestamp: 1 })
      .limit(BATCH)
      .lean();
    if (rows.length === 0) break;

    // Newline-delimited JSON, one row per line.
    const ndjson = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    const gz = zlib.gzipSync(Buffer.from(ndjson, "utf8"));

    // Partition by the oldest row's date; unique marker from id range.
    const first = rows[0] as any;
    const last = rows[rows.length - 1] as any;
    const marker = `${first._id}-${last._id}`;
    const key = objectKey(new Date(first.timestamp), marker);

    // Upload, then verify it exists before deleting anything from Mongo.
    const file = bucket.file(key);
    await file.save(gz, {
      resumable: false,
      contentType: "application/gzip",
      metadata: { metadata: { rows: String(rows.length) } },
    });
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`[audit-archive] upload verification failed for ${key}`);
    }

    // Safe to remove now that the batch is durably in GCS.
    const ids = rows.map((r: any) => r._id);
    await ActivityLog.deleteMany({ _id: { $in: ids } });

    archived += rows.length;
    batches += 1;
    console.log(
      `[audit-archive] archived ${rows.length} rows → gs://${gcsBucketName}/${key}`,
    );

    if (rows.length < BATCH) break;
  }

  return { archived, batches };
};

/**
 * Read archived rows for a date range straight from GCS (no rehydration into
 * Mongo). Streams the matching gzipped partitions, filters by timestamp, and
 * returns up to `limit` rows. For heavy analytical queries, prefer a BigQuery
 * external table over the same gs:// prefix instead of this.
 */
export const readArchive = async (params: {
  start: Date;
  end: Date;
  entity?: string;
  userEmail?: string;
  limit?: number;
}): Promise<any[]> => {
  // Reading the archive only needs the bucket — independent of the enable
  // toggle, so you can still search old data after pausing auto-archival.
  if (!isBucketConfigured()) return [];
  const limit = Math.min(params.limit ?? 500, 5000);
  const bucket = gcsBucket!; // shared KB bucket (guarded by isBucketConfigured)

  // List candidate partitions across the date range (day granularity).
  const prefixes: string[] = [];
  const d = new Date(
    Date.UTC(
      params.start.getUTCFullYear(),
      params.start.getUTCMonth(),
      params.start.getUTCDate(),
    ),
  );
  while (d <= params.end) {
    prefixes.push(
      `${PREFIX}/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(
        d.getUTCDate(),
      )}/`,
    );
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const out: any[] = [];
  for (const p of prefixes) {
    if (out.length >= limit) break;
    const [files] = await bucket.getFiles({ prefix: p });
    for (const f of files) {
      if (out.length >= limit) break;
      const [buf] = await f.download();
      const text = zlib.gunzipSync(buf).toString("utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        let row: any;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        const ts = new Date(row.timestamp);
        if (ts < params.start || ts > params.end) continue;
        if (params.entity && row.entity !== params.entity) continue;
        if (params.userEmail && row.userEmail !== params.userEmail) continue;
        out.push(row);
        if (out.length >= limit) break;
      }
    }
  }
  out.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return out.slice(0, limit);
};

/**
 * Start the daily archival scheduler (setInterval, matching the codebase's
 * other schedulers). Starts whenever a bucket is configured; each tick re-reads
 * the DB settings, so the enable toggle and retention window can be changed from
 * the UI without a restart. No-op with no bucket. Returns the timer for shutdown.
 */
export const startAuditArchivalScheduler = (): NodeJS.Timeout | null => {
  if (!isBucketConfigured()) {
    console.log("[audit-archive] no bucket configured — scheduler not started");
    return null;
  }
  const DAY = 86400_000;
  const tick = async () => {
    try {
      const r = await runAuditArchival();
      if (r.archived)
        console.log(`[audit-archive] pass complete: ${r.archived} rows in ${r.batches} batch(es)`);
    } catch (e) {
      console.error("[audit-archive] pass failed:", (e as Error).message);
    }
  };
  // First run shortly after boot, then daily.
  const initial = setTimeout(tick, 60_000);
  if (typeof initial.unref === "function") initial.unref();
  const timer = setInterval(tick, DAY);
  if (typeof timer.unref === "function") timer.unref();
  console.log(
    `[audit-archive] scheduler started (enable + retention are UI-controlled) → gs://${gcsBucketName}/${PREFIX}`,
  );
  return timer;
};

// Touch mongoose import so tree-shakers keep the model registration side-effect.
void mongoose;
