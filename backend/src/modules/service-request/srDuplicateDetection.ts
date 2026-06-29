/**
 * Service Request (PSR/ISR) module — duplicate detection.
 * Phase 2: Vector dedup key = student + sub-category + (open) status.
 * Applied only to SR-type requests; returns candidate duplicates for the UI
 * to surface before creating a new SR.
 */
import { Ticket } from "../../models/Ticket";
import { SR_STATUS } from "./srWorkflow";

/** Statuses considered "still active" for dedup purposes. */
const SR_OPEN_STATUSES: number[] = [
  SR_STATUS.OPEN,
  SR_STATUS.WIP,
  SR_STATUS.RESOLVED,
  SR_STATUS.REOPEN,
  SR_STATUS.REOPEN_WIP,
];

export interface DuplicateQuery {
  projectId: string;
  /** Deepest selected sub-category (categoryHierarchy leaf). */
  subCategoryId: string;
  /** Either the requester user id or the student enrolment identifier. */
  studentUserId?: string;
  studentEnrollment?: string;
  /** Limit to active SRs (default true). */
  openOnly?: boolean;
}

export async function findDuplicateServiceRequests(q: DuplicateQuery) {
  const match: any = {
    project: q.projectId,
    interactionType: "PSR",
  };

  // Match the sub-category at any hierarchy level the leaf could occupy.
  match.$or = [
    { "categoryHierarchy.level1": q.subCategoryId },
    { "categoryHierarchy.level2": q.subCategoryId },
    { "categoryHierarchy.level3": q.subCategoryId },
    { "categoryHierarchy.level4": q.subCategoryId },
    { "categoryHierarchy.level5": q.subCategoryId },
    { category: q.subCategoryId },
  ];

  if (q.studentUserId) match.createdBy = q.studentUserId;
  if (q.studentEnrollment)
    match["metadata.studentEnrollment"] = q.studentEnrollment;

  if (q.openOnly !== false) match.status = { $in: SR_OPEN_STATUSES };

  return Ticket.find(match)
    .select("ticketNumber subject status createdAt categoryHierarchy")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
}
