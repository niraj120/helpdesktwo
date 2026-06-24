/**
 * Service Request (PSR/ISR) — per-project PSR status seeding.
 * Phase 2: when a project enables SR, ensure the PSR status rows exist
 * (idempotent upsert). Codes 1–5 usually already exist; 6/7 are PSR-specific.
 */
import { Status } from "../../models/Status";
import { SR_PSR_STATUSES } from "./types";

export async function seedPsrStatuses(
  projectId: string,
  createdBy?: string,
): Promise<void> {
  const ops = SR_PSR_STATUSES.map((s, i) => ({
    updateOne: {
      filter: { projectId, code: s.code },
      update: {
        $setOnInsert: {
          projectId,
          code: s.code,
          name: s.name,
          color: s.color,
          isClosed: s.isClosed,
          displayOrder: i,
          isActive: true,
          ...(createdBy ? { createdBy } : {}),
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await Status.bulkWrite(ops as any);
}
