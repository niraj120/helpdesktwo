import { Schema, Query, Document } from "mongoose";
import { getAuditContext } from "../context/requestContext";
import { buildChanges, snapshotChanges, Change } from "../utils/auditRedaction";
import { enqueueAudit } from "./auditWriter";

/**
 * Global mongoose plugin that turns any model's writes into audit rows with no
 * change to controllers. Attach once via `mongoose.plugin(auditPlugin)` before
 * models are compiled, or per-schema for a phased rollout.
 *
 * Coverage across mongoose's two middleware worlds:
 *   - Document middleware: save (covers .save() and .create())
 *   - Query middleware:    findOneAndUpdate, updateOne, updateMany,
 *                          findOneAndDelete, deleteOne, deleteMany
 *
 * Blind spots (documented, handled outside the plugin in Phase 3):
 *   - insertMany() does NOT fire save hooks — needs its own hook (added below).
 *   - bulkWrite() fires NO hooks at all — the 8 call sites are converted by hand.
 *
 * WHO comes from AsyncLocalStorage (getAuditContext); WHAT comes from diffing
 * the document. A write with no bound context is attributed to source "system".
 */

/**
 * Models that must never be audited. Three classes:
 *
 *  1. Log/telemetry collections — auditing these recurses or explodes volume.
 *     Also caught by the `/Log$/` suffix rule below.
 *  2. High-write machinery — caches, queues, jobs, sync state, sessions,
 *     notifications, push subscriptions. These churn constantly and are NOT
 *     business changes; auditing them would bury the config/entity edits the
 *     log exists to surface. This is a deliberate, documented exclusion — if a
 *     specific machinery model needs auditing, remove it from this set.
 *  3. Derived/bulk data written via bulkWrite() or into raw dynamic
 *     collections (PSR psr_tbl_*, report data points) — these fire no hooks
 *     anyway and are intentionally left unaudited (bulk sync, not edits).
 *
 * NOTE on bulkWrite blind spots (fire no mongoose hooks, all intentionally
 * unaudited): attendanceBulkController, reportController (ReportDataPoint),
 * widgetDefinitionController, seedRolesPermissions, srStatusSeed, and the raw
 * psr_tbl_* writers (psrBuilderController, pipelineEngine). All are seeds or
 * high-volume data pipelines, not user config changes.
 */
const DENYLIST = new Set<string>([
  // (1) logs
  "ActivityLog",
  "AccessLog",
  "APILog",
  "ErrorLog",
  "EmailLog",
  "SMSLog",
  "WhatsAppLog",
  "JobLog",
  "IvrIngestLog",
  "AssetAuditLog",
  "FormAuditLog",
  "DataAccessLog",
  "AttendanceSyncLog",
  "BiometricSyncLog",
  // (2) machinery
  "Session",
  "Notification",
  "PushSubscription",
  "Job",
  "EmailProcessingQueue",
  "MDMCacheRecord",
  "MDMCacheJoin",
  "MDMSyncJob",
  "PsrSyncRun",
  "ReportDataPoint",
  "AttendanceRecord",
]);

const isDenied = (modelName?: string): boolean =>
  !!modelName && (DENYLIST.has(modelName) || /Log$/.test(modelName));

type AuditAction = "create" | "update" | "delete";

/** Best-guess human label for the mutated document. */
const deriveEntityName = (doc: any): string | undefined => {
  if (!doc) return undefined;
  return (
    doc.name ??
    doc.title ??
    doc.subject ??
    doc.ticketNumber ??
    doc.code ??
    doc.email ??
    doc.label ??
    undefined
  );
};

/** Role name off a possibly-populated role object or plain string. */
const roleName = (role: any): string | undefined => {
  if (!role) return undefined;
  if (typeof role === "string") return role;
  return role.name ?? role.roleName ?? undefined;
};

/**
 * Resolve the acting user from the request held in the ALS context. Auth
 * populates `req.user` after the context is bound, so this is read at write
 * time. Falls back to the explicit ctx fields, then to the system sentinel.
 */
const resolveActor = (ctx: any) => {
  const u = ctx?.req?.user;
  const fullName =
    u && (u.firstName || u.lastName)
      ? [u.firstName, u.lastName].filter(Boolean).join(" ")
      : undefined;
  return {
    userId: u?.userId ?? ctx?.userId ?? null,
    userName: fullName ?? ctx?.userName ?? "System",
    userEmail: u?.email ?? ctx?.userEmail ?? "system@internal",
    role: roleName(u?.role) ?? ctx?.role,
    projectId: u?.projectId ?? ctx?.projectId ?? null,
    projectName: u?.projectName ?? ctx?.projectName,
  };
};

/** Assemble the audit row from context + computed changes. */
const buildRow = (params: {
  modelName: string;
  action: AuditAction;
  entityId?: string;
  entityName?: string;
  changes: Change[];
}): Record<string, any> => {
  const ctx = getAuditContext();
  const actor = resolveActor(ctx);
  return {
    userId: actor.userId,
    userName: actor.userName,
    userEmail: actor.userEmail,
    action: params.action,
    entity: params.modelName, // canonical: the mongoose model name
    entityId: params.entityId,
    entityName: params.entityName,
    changes: params.changes,
    description: `${params.action} ${params.modelName}${
      params.entityName ? ` "${params.entityName}"` : ""
    }`,
    ipAddress: ctx?.ipAddress,
    userAgent: ctx?.userAgent,
    project: actor.projectId,
    projectName: actor.projectName,
    role: actor.role,
    source: ctx?.source ?? "system",
    route: ctx?.route,
    method: ctx?.method,
    timestamp: new Date(),
  };
};

const toPlain = (doc: any): any =>
  doc && typeof doc.toObject === "function"
    ? doc.toObject({ depopulate: true, virtuals: false })
    : doc;

export const auditPlugin = (schema: Schema): void => {
  // ---- Document middleware: save (fires for .save() and .create()) ----

  schema.pre("save", async function (this: Document) {
    const ctx = getAuditContext();
    if (ctx?.suppressAudit) return;
    const modelName = (this.constructor as any)?.modelName;
    if (isDenied(modelName)) return;

    (this as any).$locals = (this as any).$locals || {};
    (this as any).$locals.__auditIsNew = this.isNew;

    // Skip the pre-image read entirely when an existing doc has no modified
    // paths — a no-op save produces no audit row, so don't pay for the read.
    if (!this.isNew && !this.isModified()) {
      (this as any).$locals.__auditSkip = true;
      return;
    }

    // Stash the persisted pre-image for the post hook to diff against. Mongoose
    // does not retain the original document on the instance, so read it back.
    // (One extra read per modified save — the cost of a real before/after.)
    if (!this.isNew) {
      try {
        const Model = this.constructor as any;
        (this as any).$locals.__auditBefore = await Model.findById(this._id)
          .lean()
          .exec();
      } catch {
        /* pre-image unavailable — post hook will treat all fields as new */
      }
    }
  });

  schema.post("save", function (this: Document) {
    try {
      const ctx = getAuditContext();
      if (ctx?.suppressAudit) return;
      const modelName = (this.constructor as any)?.modelName;
      if (isDenied(modelName)) return;
      if ((this as any).$locals?.__auditSkip) return;

      const wasNew = (this as any).$locals?.__auditIsNew;
      const after = toPlain(this);
      const entityId = String((this as any)._id ?? "");
      const entityName = deriveEntityName(after);

      let action: AuditAction;
      let changes: Change[];
      if (wasNew) {
        action = "create";
        changes = snapshotChanges(after, "new");
      } else {
        action = "update";
        const before = (this as any).$locals?.__auditBefore;
        changes = buildChanges(before, after);
        // No detectable field change — don't emit an empty update row.
        if (changes.length === 0) return;
      }

      enqueueAudit(buildRow({ modelName, action, entityId, entityName, changes }));
    } catch (err) {
      console.error("[audit] save hook error:", (err as Error).message);
    }
  });

  // ---- Query middleware: updates ----
  // updateOne/deleteOne register as BOTH document and query middleware in
  // Mongoose 6+. We register them here as query-only ({ document:false,
  // query:true }) so document-style calls don't double-fire against the save
  // hooks above.

  const captureBeforeUpdate = async function (this: Query<any, any>) {
    try {
      const model = this.model;
      if (isDenied(model?.modelName)) return;
      const ctx = getAuditContext();
      if (ctx?.suppressAudit) return;
      // Read the pre-image so post can diff. One extra read per mutation — the
      // price of a real before/after at the query layer.
      (this as any).__auditBefore = await model
        .findOne(this.getFilter())
        .lean()
        .exec();
    } catch (err) {
      console.error("[audit] pre-update read error:", (err as Error).message);
    }
  };

  const emitAfterUpdate = async function (this: Query<any, any>) {
    try {
      const model = this.model;
      if (isDenied(model?.modelName)) return;
      const ctx = getAuditContext();
      if (ctx?.suppressAudit) return;

      const before: any = (this as any).__auditBefore;
      const filter = this.getFilter();
      const after: any = await model.findOne(filter).lean().exec();
      if (!before && !after) return;

      const entityId = String(before?._id ?? after?._id ?? "");
      const entityName = deriveEntityName(after ?? before);
      const changes = buildChanges(before, after);
      if (changes.length === 0) return;

      enqueueAudit(
        buildRow({
          modelName: model.modelName,
          action: "update",
          entityId,
          entityName,
          changes,
        }),
      );
    } catch (err) {
      console.error("[audit] post-update error:", (err as Error).message);
    }
  };

  schema.pre("findOneAndUpdate", captureBeforeUpdate);
  schema.post("findOneAndUpdate", emitAfterUpdate);
  schema.pre("updateOne", { document: false, query: true }, captureBeforeUpdate);
  schema.post("updateOne", { document: false, query: true }, emitAfterUpdate);
  schema.pre("updateMany", { document: false, query: true }, captureBeforeUpdate);
  schema.post("updateMany", { document: false, query: true }, emitAfterUpdate);

  // ---- Query middleware: deletes ----

  const captureBeforeDelete = async function (this: Query<any, any>) {
    try {
      const model = this.model;
      if (isDenied(model?.modelName)) return;
      const ctx = getAuditContext();
      if (ctx?.suppressAudit) return;
      // For deleteMany this only keeps the first match's identity; per-doc
      // granularity on bulk deletes is a Phase 3 decision, not a blocker.
      (this as any).__auditBefore = await model
        .find(this.getFilter())
        .limit(50)
        .lean()
        .exec();
    } catch (err) {
      console.error("[audit] pre-delete read error:", (err as Error).message);
    }
  };

  const emitAfterDelete = function (this: Query<any, any>) {
    try {
      const model = this.model;
      if (isDenied(model?.modelName)) return;
      const ctx = getAuditContext();
      if (ctx?.suppressAudit) return;

      const docs: any[] = (this as any).__auditBefore ?? [];
      for (const doc of docs) {
        enqueueAudit(
          buildRow({
            modelName: model.modelName,
            action: "delete",
            entityId: String(doc?._id ?? ""),
            entityName: deriveEntityName(doc),
            changes: snapshotChanges(doc, "old"),
          }),
        );
      }
    } catch (err) {
      console.error("[audit] post-delete error:", (err as Error).message);
    }
  };

  schema.pre("findOneAndDelete", captureBeforeDelete);
  schema.post("findOneAndDelete", emitAfterDelete);
  schema.pre("deleteOne", { document: false, query: true }, captureBeforeDelete);
  schema.post("deleteOne", { document: false, query: true }, emitAfterDelete);
  schema.pre("deleteMany", { document: false, query: true }, captureBeforeDelete);
  schema.post("deleteMany", { document: false, query: true }, emitAfterDelete);

  // ---- insertMany: bypasses save hooks, needs its own ----

  schema.post("insertMany", function (this: any, docs: any) {
    try {
      const ctx = getAuditContext();
      if (ctx?.suppressAudit) return;
      const modelName = this?.modelName;
      if (isDenied(modelName)) return;
      const list: any[] = Array.isArray(docs) ? docs : [docs];
      for (const d of list) {
        const plain = toPlain(d);
        enqueueAudit(
          buildRow({
            modelName,
            action: "create",
            entityId: String(plain?._id ?? ""),
            entityName: deriveEntityName(plain),
            changes: snapshotChanges(plain, "new"),
          }),
        );
      }
    } catch (err) {
      console.error("[audit] insertMany hook error:", (err as Error).message);
    }
  });
};

export default auditPlugin;
