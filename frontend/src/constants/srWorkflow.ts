/**
 * Service Request lifecycle — the frontend mirror of
 * backend/src/modules/service-request/srWorkflow.ts. The server is the
 * authority (it rejects any move not in its table); this copy only decides
 * which choices to offer, so keep the two in step.
 *
 * Labels and colours never come from here — they come from the project's
 * status master via useProjectStatuses.
 */
export const SR_STATUS = {
  OPEN: 1,
  WIP: 2,
  RESOLVED: 4,
  CLOSED: 5,
  REOPEN: 6,
  REOPEN_WIP: 7,
  CANCEL: 8,
} as const;

/** Status moves offered in "Update status" (close / re-open / cancel have their own actions). */
export const SR_NEXT_STATUSES: Record<number, number[]> = {
  [SR_STATUS.OPEN]: [SR_STATUS.WIP, SR_STATUS.RESOLVED],
  // WIP → WIP revises the committed date; each revision is kept.
  [SR_STATUS.WIP]: [SR_STATUS.WIP, SR_STATUS.RESOLVED],
  [SR_STATUS.REOPEN]: [SR_STATUS.REOPEN_WIP],
  [SR_STATUS.REOPEN_WIP]: [],
  [SR_STATUS.RESOLVED]: [],
  [SR_STATUS.CLOSED]: [],
};

/** Statuses the Close action is allowed from (server: → CLOSED transitions). */
export const SR_CLOSABLE_FROM: number[] = [
  SR_STATUS.RESOLVED,
  SR_STATUS.REOPEN,
  SR_STATUS.REOPEN_WIP,
];

/** Live statuses an SR may be cancelled from (server: SR_CANCELABLE_FROM). */
export const SR_CANCELABLE_FROM: number[] = [
  SR_STATUS.OPEN,
  SR_STATUS.WIP,
  SR_STATUS.RESOLVED,
  SR_STATUS.REOPEN,
  SR_STATUS.REOPEN_WIP,
];

/** Moves that need a committed closure date. */
export const SR_NEEDS_COMMITTED_DATE: number[] = [SR_STATUS.WIP, SR_STATUS.REOPEN_WIP];

/** The path a request normally takes, in order. */
export const SR_MAIN_PATH: number[] = [
  SR_STATUS.OPEN,
  SR_STATUS.WIP,
  SR_STATUS.RESOLVED,
  SR_STATUS.CLOSED,
];

/** The path after a re-open, continuing on from the first closure. */
export const SR_REOPEN_PATH: number[] = [
  SR_STATUS.REOPEN,
  SR_STATUS.REOPEN_WIP,
  SR_STATUS.CLOSED,
];
