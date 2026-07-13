import mongoose from "mongoose";
import MDMCacheJoin from "../models/MDMCacheJoin";
import MDMCacheRecord, { IMDMCacheRecord } from "../models/MDMCacheRecord";
import MDMSyncJob from "../models/MDMSyncJob";
import MDMSource, {
  IMDMCacheDataset,
  IMDMCacheJoinConfig,
  IMDMSource,
} from "../models/MDMSource";
import {
  configuredScalar,
  fetchMdmRawArray,
  fetchMdmRawArrayWithConfig,
  flattenRecord,
  normalizeChild,
  normalizeParent,
} from "./mdmService";

const toStringValue = (value: any) =>
  value === undefined || value === null ? "" : String(value).trim();

const asObjectIdArray = (values?: mongoose.Types.ObjectId[]) =>
  (values || []).filter(Boolean);

const apiProjectIds = (source: IMDMSource, apiIndex: number) =>
  asObjectIdArray(source.apis?.[apiIndex]?.projectIds || []);

const sourceCache = (source: IMDMSource) =>
  source.cache || { enabled: false, datasets: [], joins: [] };

const findDataset = (source: IMDMSource, datasetKey: string) =>
  sourceCache(source).datasets.find((dataset) => dataset.key === datasetKey);

const findJoin = (source: IMDMSource, joinKey: string) =>
  sourceCache(source).joins.find((join) => join.key === joinKey);

const datasetSource = async (ownerSource: IMDMSource, dataset: IMDMCacheDataset) => {
  const explicitSourceId = dataset.sourceId ? String(dataset.sourceId) : "";
  if (!explicitSourceId || explicitSourceId === String(ownerSource._id)) {
    return ownerSource;
  }
  const source = await MDMSource.findById(explicitSourceId);
  if (!source) {
    throw new Error(`Dataset source "${explicitSourceId}" was not found`);
  }
  return source;
};

const fieldList = (...groups: Array<string[] | undefined>) =>
  Array.from(
    new Set(
      groups
        .flatMap((group) => group || [])
        .map((field) => String(field || "").trim())
        .filter(Boolean),
    ),
  );

const selectedFromRecord = (flat: Record<string, any>, fields: string[]) => {
  const selected: Record<string, string> = {};
  for (const field of fields) {
    const value = configuredScalar(flat, field);
    if (value !== "") selected[field] = value;
  }
  return selected;
};

const buildSearchableText = (flat: Record<string, any>, fields: string[]) => {
  const configuredValues = fields
    .map((field) => configuredScalar(flat, field))
    .filter(Boolean);
  const fallbackValues = Object.values(flat)
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        typeof value !== "object",
    )
    .map((value) => String(value));

  return Array.from(new Set([...configuredValues, ...fallbackValues]))
    .join(" ")
    .toLowerCase();
};

const outputRecord = (
  record: Pick<IMDMCacheRecord, "externalId" | "raw" | "selected">,
  fields: string[],
) => {
  const raw = record.raw || {};
  const selected =
    record.selected instanceof Map
      ? Object.fromEntries(record.selected)
      : record.selected || {};
  const picked = selectedFromRecord(raw, fields);
  return {
    externalId: record.externalId,
    ...selected,
    ...picked,
  };
};

const ensureJob = async (
  sourceId: string,
  type: "dataset_sync" | "join_rebuild",
  datasetKey?: string,
  joinKey?: string,
) =>
  MDMSyncJob.create({
    sourceId,
    type,
    datasetKey: datasetKey || "",
    joinKey: joinKey || "",
    status: "running",
    startedAt: new Date(),
  });

const finishJob = async (
  jobId: mongoose.Types.ObjectId,
  patch: Partial<{
    status: "success" | "failed";
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
    error: string;
    sampleErrors: string[];
  }>,
) =>
  MDMSyncJob.findByIdAndUpdate(
    jobId,
    {
      ...patch,
      finishedAt: new Date(),
    },
    { new: true },
  );

export const syncDataset = async (sourceId: string, datasetKey: string) => {
  const job = await ensureJob(sourceId, "dataset_sync", datasetKey);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const sampleErrors: string[] = [];

  try {
    const source = await MDMSource.findById(sourceId);
    if (!source) throw new Error("MDM source not found");
    if (!sourceCache(source).enabled) throw new Error("MDM cache is disabled");

    const dataset = findDataset(source, datasetKey);
    if (!dataset) throw new Error(`Dataset "${datasetKey}" is not configured`);
    if (!dataset.enabled) throw new Error(`Dataset "${datasetKey}" is disabled`);
    if (!dataset.uniqueKeyField?.trim()) {
      throw new Error("Dataset unique key field is required");
    }

    const sourceForDataset = await datasetSource(source, dataset);
    const api = sourceForDataset.apis?.[dataset.apiIndex];
    if (!api) throw new Error("Dataset API row index is invalid");

    // Use the enhanced fetch that respects configured responsePath and pagination
    const rows = await fetchMdmRawArrayWithConfig(sourceForDataset, api, {
      responsePath: (dataset as any).responsePath,
      pagination: (dataset as any).pagination,
    });
    const storedFields = fieldList(
      dataset.storedFields,
      dataset.searchFields,
      [dataset.uniqueKeyField, dataset.displayField || ""],
    );
    const searchFields = fieldList(dataset.searchFields, storedFields);
    const projectIds = apiProjectIds(sourceForDataset, dataset.apiIndex);

    for (const rawRow of rows) {
      try {
        const flat = flattenRecord(rawRow);
        const externalId = configuredScalar(flat, dataset.uniqueKeyField);
        if (!externalId) {
          skipped += 1;
          continue;
        }

        const selected = selectedFromRecord(flat, storedFields);
        const sourceUpdatedAt = dataset.incremental?.updatedAtField
          ? new Date(configuredScalar(flat, dataset.incremental.updatedAtField))
          : undefined;

        const result = await MDMCacheRecord.updateOne(
          { sourceId, datasetKey, externalId },
          {
            $set: {
              projectIds,
              raw: flat,
              selected,
              searchableText: buildSearchableText(flat, searchFields),
              ...(sourceUpdatedAt && !Number.isNaN(sourceUpdatedAt.getTime())
                ? { sourceUpdatedAt }
                : {}),
              lastSyncedAt: new Date(),
              syncJobId: job._id,
            },
          },
          { upsert: true },
        );

        if (result.upsertedCount) inserted += 1;
        else if (result.modifiedCount || result.matchedCount) updated += 1;
      } catch (error: any) {
        failed += 1;
        if (sampleErrors.length < 10) {
          sampleErrors.push(error?.message || "Failed to sync row");
        }
      }
    }

    return finishJob(job._id, {
      status: failed ? "failed" : "success",
      inserted,
      updated,
      skipped,
      failed,
      sampleErrors,
      ...(failed ? { error: `${failed} row(s) failed during sync` } : {}),
    });
  } catch (error: any) {
    return finishJob(job._id, {
      status: "failed",
      inserted,
      updated,
      skipped,
      failed,
      error: error?.message || "Dataset sync failed",
      sampleErrors,
    });
  }
};

const recordsByExternalId = async (sourceId: string, datasetKey: string) => {
  const records = await MDMCacheRecord.find({ sourceId, datasetKey }).lean();
  return new Map(records.map((record: any) => [record.externalId, record]));
};

const firstConfiguredValue = (
  records: Record<string, any>,
  field: string,
  preferredDatasetKey?: string,
) => {
  if (!field) return "";
  const orderedRecords = [
    ...(preferredDatasetKey && records[preferredDatasetKey]
      ? [records[preferredDatasetKey]]
      : []),
    ...Object.entries(records)
      .filter(([datasetKey]) => datasetKey !== preferredDatasetKey)
      .map(([, record]) => record),
  ];
  for (const record of orderedRecords) {
    const value = configuredScalar(record?.raw || {}, field);
    if (value !== "") return value;
  }
  return "";
};

const projectIdsFromRecords = (records: Record<string, any>) =>
  Array.from(
    new Set(
      Object.values(records).flatMap((record: any) =>
        ((record?.projectIds || []) as any[]).map(String),
      ),
    ),
  );

const joinKeyPairs = (step: NonNullable<IMDMCacheJoinConfig["joinSteps"]>[number]) =>
  (step.keyPairs?.length
    ? step.keyPairs
    : [{ leftKey: step.leftKey, rightKey: step.rightKey }]
  ).filter((pair) => pair.leftKey && pair.rightKey);

const compositeJoinValue = (
  raw: Record<string, any>,
  pairs: Array<{ leftKey: string; rightKey: string }>,
  side: "left" | "right",
) => {
  const values = pairs.map((pair) =>
    configuredScalar(raw, side === "left" ? pair.leftKey : pair.rightKey),
  );
  if (values.some((value) => value === "")) return "";
  return values.join("\u001f");
};

const rebuildFlatJoin = async ({
  sourceId,
  join,
  jobId,
}: {
  sourceId: string;
  join: IMDMCacheJoinConfig;
  jobId: mongoose.Types.ObjectId;
}) => {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const sampleErrors: string[] = [];
  const datasetKeys = fieldList(
    (join.datasets || []).map((dataset) => dataset.datasetKey),
    (join.joinSteps || []).flatMap((step) => [
      step.leftDatasetKey,
      step.rightDatasetKey,
    ]),
  );

  try {
    if (!datasetKeys.length) {
      throw new Error("Flat join requires at least one dataset");
    }

    const recordsByDataset = new Map<string, any[]>();
    for (const datasetKey of datasetKeys) {
      const rows = await MDMCacheRecord.find({ sourceId, datasetKey }).lean();
      recordsByDataset.set(datasetKey, rows);
    }

    let joinedRows: Array<{ records: Record<string, any> }> = (
      recordsByDataset.get(datasetKeys[0]) || []
    ).map((record) => ({ records: { [datasetKeys[0]]: record } }));

    for (const step of join.joinSteps || []) {
      const pairs = joinKeyPairs(step);
      if (!pairs.length) {
        throw new Error("Each flat join step requires at least one key pair");
      }
      const rightRows = recordsByDataset.get(step.rightDatasetKey) || [];
      const rightByValue = new Map<string, any[]>();
      for (const right of rightRows) {
        const value = compositeJoinValue(right.raw || {}, pairs, "right");
        if (!value) continue;
        rightByValue.set(value, [...(rightByValue.get(value) || []), right]);
      }

      const nextRows: Array<{ records: Record<string, any> }> = [];
      for (const row of joinedRows) {
        const leftRecord = row.records[step.leftDatasetKey];
        if (!leftRecord) {
          skipped += 1;
          continue;
        }
        const leftValue = compositeJoinValue(
          leftRecord.raw || {},
          pairs,
          "left",
        );
        const matches = leftValue ? rightByValue.get(leftValue) || [] : [];
        if (!matches.length) {
          skipped += 1;
          continue;
        }
        for (const match of matches) {
          nextRows.push({
            records: {
              ...row.records,
              [step.rightDatasetKey]: match,
            },
          });
        }
      }
      joinedRows = nextRows;
    }

    const outputFields = fieldList(join.outputFields, join.parentStoredFields);
    const searchFields = fieldList(join.searchFields, outputFields);
    const valueField = join.valueField || outputFields[0] || "";

    for (const [index, row] of joinedRows.entries()) {
      try {
        const selected: Record<string, string> = {};
        for (const field of outputFields) {
          const value = firstConfiguredValue(row.records, field);
          if (value !== "") selected[field] = value;
        }

        const parentExternalId =
          firstConfiguredValue(row.records, valueField) ||
          Object.values(row.records)[0]?.externalId ||
          `${join.key}_${index + 1}`;
        if (!parentExternalId) {
          skipped += 1;
          continue;
        }

        const searchableText = searchFields
          .map((field) => firstConfiguredValue(row.records, field))
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const result = await MDMCacheJoin.updateOne(
          { sourceId, joinKey: join.key, parentExternalId },
          {
            $set: {
              projectIds: projectIdsFromRecords(row.records),
              parent: {
                externalId: parentExternalId,
                ...selected,
              },
              children: [],
              searchableText,
              lastBuiltAt: new Date(),
            },
          },
          { upsert: true },
        );

        if (result.upsertedCount) inserted += 1;
        else if (result.modifiedCount || result.matchedCount) updated += 1;
      } catch (error: any) {
        failed += 1;
        if (sampleErrors.length < 10) {
          sampleErrors.push(error?.message || "Failed to rebuild flat join row");
        }
      }
    }

    return finishJob(jobId, {
      status: failed ? "failed" : "success",
      inserted,
      updated,
      skipped,
      failed,
      sampleErrors,
      ...(failed ? { error: `${failed} flat join row(s) failed` } : {}),
    });
  } catch (error: any) {
    return finishJob(jobId, {
      status: "failed",
      inserted,
      updated,
      skipped,
      failed,
      error: error?.message || "Flat join rebuild failed",
      sampleErrors,
    });
  }
};

export const rebuildJoin = async (sourceId: string, joinKey: string) => {
  const job = await ensureJob(sourceId, "join_rebuild", undefined, joinKey);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const sampleErrors: string[] = [];

  try {
    const source = await MDMSource.findById(sourceId);
    if (!source) throw new Error("MDM source not found");
    if (!sourceCache(source).enabled) throw new Error("MDM cache is disabled");

    const join = findJoin(source, joinKey);
    if (!join) throw new Error(`Join "${joinKey}" is not configured`);
    if (!join.enabled) throw new Error(`Join "${joinKey}" is disabled`);
    if (join.outputType === "flat_join") {
      return rebuildFlatJoin({ sourceId, join, jobId: job._id });
    }

    if (join.outputType !== "parent_with_children") {
      throw new Error(`Join output "${join.outputType}" is not supported`);
    }

    const parentDataset = findDataset(source, join.parentDatasetKey);
    const studentDataset = findDataset(source, join.studentDatasetKey);
    if (!parentDataset || !studentDataset) {
      throw new Error("Join parent/student datasets are not configured");
    }

    const parents = await MDMCacheRecord.find({
      sourceId,
      datasetKey: join.parentDatasetKey,
    }).lean();
    const mappings = await MDMCacheRecord.find({
      sourceId,
      datasetKey: join.mappingDatasetKey,
    }).lean();
    const students = await recordsByExternalId(sourceId, join.studentDatasetKey);

    const mappingByParent = new Map<string, string[]>();
    for (const mapping of mappings as any[]) {
      const parentId = configuredScalar(mapping.raw || {}, join.mappingParentKeyField);
      const studentId = configuredScalar(mapping.raw || {}, join.mappingStudentKeyField);
      if (!parentId || !studentId) {
        skipped += 1;
        continue;
      }
      mappingByParent.set(parentId, [
        ...(mappingByParent.get(parentId) || []),
        studentId,
      ]);
    }

    const parentOutputFields = fieldList(
      join.parentStoredFields,
      parentDataset.storedFields,
      parentDataset.searchFields,
      [join.parentKeyField, parentDataset.displayField || ""],
    );
    const childOutputFields = fieldList(
      join.childStoredFields,
      studentDataset.storedFields,
      studentDataset.searchFields,
      [join.studentKeyField, studentDataset.displayField || ""],
    );

    for (const parent of parents as any[]) {
      try {
        const parentExternalId =
          configuredScalar(parent.raw || {}, join.parentKeyField) ||
          parent.externalId;
        if (!parentExternalId) {
          skipped += 1;
          continue;
        }

        const studentIds = Array.from(
          new Set(mappingByParent.get(parentExternalId) || []),
        );
        const children = studentIds
          .map((studentId) => students.get(studentId))
          .filter(Boolean)
          .map((student: any) => outputRecord(student, childOutputFields));

        const parentPayload = outputRecord(parent, parentOutputFields);
        const searchableText = [
          buildSearchableText(parent.raw || {}, parentOutputFields),
          ...children.map((child) =>
            Object.values(child)
              .filter((value) => typeof value !== "object")
              .join(" "),
          ),
        ]
          .join(" ")
          .toLowerCase();

        const result = await MDMCacheJoin.updateOne(
          { sourceId, joinKey, parentExternalId },
          {
            $set: {
              projectIds: Array.from(
                new Set([
                  ...((parent.projectIds || []) as any[]).map(String),
                  ...apiProjectIds(source, parentDataset.apiIndex).map(String),
                ]),
              ),
              parent: parentPayload,
              children,
              searchableText,
              lastBuiltAt: new Date(),
            },
          },
          { upsert: true },
        );

        if (result.upsertedCount) inserted += 1;
        else if (result.modifiedCount || result.matchedCount) updated += 1;
      } catch (error: any) {
        failed += 1;
        if (sampleErrors.length < 10) {
          sampleErrors.push(error?.message || "Failed to rebuild join row");
        }
      }
    }

    return finishJob(job._id, {
      status: failed ? "failed" : "success",
      inserted,
      updated,
      skipped,
      failed,
      sampleErrors,
      ...(failed ? { error: `${failed} join row(s) failed` } : {}),
    });
  } catch (error: any) {
    return finishJob(job._id, {
      status: "failed",
      inserted,
      updated,
      skipped,
      failed,
      error: error?.message || "Join rebuild failed",
      sampleErrors,
    });
  }
};

export const searchCachedParentDirectory = async ({
  sourceId,
  projectId,
  joinKey,
  query,
  limit = 25,
}: {
  sourceId: string;
  projectId?: string;
  joinKey?: string;
  query: string;
  limit?: number;
}) => {
  const source = await MDMSource.findById(sourceId);
  if (!source) return null;

  const activeJoin =
    (joinKey ? findJoin(source, joinKey) : undefined) ||
    sourceCache(source).joins.find((join) => join.enabled);
  if (!activeJoin) return { source, parents: [] };

  const term = query.trim().toLowerCase();
  const filter: any = {
    sourceId,
    joinKey: activeJoin.key,
  };
  if (projectId) {
    filter.$or = [
      { projectIds: { $exists: false } },
      { projectIds: { $size: 0 } },
      { projectIds: new mongoose.Types.ObjectId(projectId) },
    ];
  }
  if (term) filter.searchableText = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  const rows = await MDMCacheJoin.find(filter)
    .sort({ updatedAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit) || 25, 100)))
    .lean();

  const parents = rows.map((row: any) => {
    const parent = normalizeParent(row.parent || {});
    const fallbackName =
      parent.name ||
      row.parent?.name ||
      row.parent?.displayName ||
      row.parent?.first_name ||
      row.parent?.firstName ||
      row.parentExternalId;
    return {
      ...row.parent,
      ...parent,
      name: fallbackName,
      parentCode: parent.parentCode || row.parentExternalId,
      children: (row.children || []).map((child: any) => ({
        ...child,
        ...normalizeChild(child),
        parentCode: parent.parentCode || row.parentExternalId,
      })),
    };
  });

  return { source, parents };
};
