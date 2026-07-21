import mongoose from "mongoose";

/**
 * Best-effort, async audit-row writer.
 *
 * The mongoose audit plugin hands finished audit rows here and returns
 * immediately — never awaiting — so a mutation's latency is unaffected by
 * auditing and a slow/failed audit write can never fail the user's request
 * (the durability policy chosen for this system).
 *
 * Rows are buffered and flushed in batches via the raw driver collection
 * (`insertMany`, unordered). Writing through the raw collection — not the
 * ActivityLog mongoose model — is deliberate: the global audit plugin is
 * attached to every schema, so writing an audit row through a model would
 * re-enter the plugin and recurse. The raw collection bypasses all middleware.
 */

const COLLECTION = "activitylogs";
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_BATCH = 500;
/** Hard cap so a DB outage can't let the buffer grow without bound. */
const MAX_BUFFER = 10000;

let buffer: Record<string, any>[] = [];
let timer: NodeJS.Timeout | null = null;
let droppedSinceLastWarn = 0;

const flush = async (): Promise<void> => {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, FLUSH_BATCH);

  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1 || !conn.db) {
    // Not connected — put the batch back (bounded) and try again next tick.
    buffer = [...batch, ...buffer].slice(0, MAX_BUFFER);
    return;
  }

  try {
    await conn.db.collection(COLLECTION).insertMany(batch, { ordered: false });
  } catch (err) {
    // Best-effort: log and drop. Never rethrow — this runs detached.
    console.error(
      `[audit] failed to write ${batch.length} audit row(s):`,
      (err as Error).message,
    );
  }

  // Drain remaining buffer promptly if it built up.
  if (buffer.length > 0) scheduleFlush(0);
};

const scheduleFlush = (delay = FLUSH_INTERVAL_MS): void => {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    try {
      await flush();
    } catch {
      /* swallow — detached */
    }
  }, delay);
  // Do not keep the event loop alive solely for an audit flush.
  if (typeof timer.unref === "function") timer.unref();
};

/**
 * Enqueue one finished audit row. Returns immediately. Rows are dropped (with
 * a throttled warning) only if the buffer is saturated, which implies the DB
 * has been unreachable for a sustained period.
 */
export const enqueueAudit = (row: Record<string, any>): void => {
  if (buffer.length >= MAX_BUFFER) {
    droppedSinceLastWarn++;
    if (droppedSinceLastWarn === 1 || droppedSinceLastWarn % 1000 === 0) {
      console.error(
        `[audit] buffer full (${MAX_BUFFER}); dropping audit rows (${droppedSinceLastWarn} dropped)`,
      );
    }
    return;
  }
  if (droppedSinceLastWarn > 0) {
    console.error(`[audit] buffer recovered after dropping ${droppedSinceLastWarn} row(s)`);
    droppedSinceLastWarn = 0;
  }
  buffer.push(row);
  scheduleFlush();
};

/** Force a synchronous-ish flush. Call on graceful shutdown to drain the tail. */
export const flushAudit = async (): Promise<void> => {
  while (buffer.length > 0) {
    const before = buffer.length;
    // eslint-disable-next-line no-await-in-loop
    await flush();
    if (buffer.length >= before) break; // not draining (e.g. disconnected) — give up
  }
};

/** Current buffer depth — for health/metrics endpoints. */
export const auditBufferDepth = (): number => buffer.length;
