import { useEffect, useMemo, useState } from "react";
import { serviceRequestApi } from "../services/serviceRequests";

/**
 * The project's status master — the same rows SLA & Escalation is configured
 * against (`GET /statuses/project/:projectId`, active only, sorted by
 * displayOrder).
 *
 * Every SR screen reads its status labels, colours and filter options through
 * here so nothing keeps a private copy of the ladder: rename or recolour a
 * status in the master and the whole module follows with no code change.
 */
export interface ProjectStatus {
  code: number;
  label: string;
  color: string;
  bg: string;
  isClosed: boolean;
  isDefault: boolean;
  displayOrder: number;
}

/** Tint a status colour for use as a chip background. */
const tint = (color: string): string => {
  const hex = (color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}1a` : "#f3f4f6";
};

// Statuses change rarely and several SR panels mount at once — cache per
// project so one screen does not fire the same request five times.
const cache = new Map<string, ProjectStatus[]>();
const inflight = new Map<string, Promise<ProjectStatus[]>>();

const fetchStatuses = (projectId: string): Promise<ProjectStatus[]> => {
  const hit = cache.get(projectId);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(projectId);
  if (pending) return pending;

  const req = serviceRequestApi
    .projectStatuses(projectId)
    .then((r: any) => {
      const rows: any[] = r?.data || r || [];
      const list: ProjectStatus[] = rows
        .map((s: any) => ({
          code: Number(s.code),
          label: String(s.name || s.code),
          color: s.color || "#6b7280",
          bg: tint(s.color),
          isClosed: !!s.isClosed,
          isDefault: !!s.isDefault,
          displayOrder: Number(s.displayOrder ?? 0),
        }))
        .filter((s) => Number.isFinite(s.code));
      cache.set(projectId, list);
      return list;
    })
    .catch((e) => {
      console.error("[sr] status master load failed:", e);
      return [] as ProjectStatus[];
    })
    .finally(() => {
      inflight.delete(projectId);
    });

  inflight.set(projectId, req);
  return req;
};

/** Drop the cached master for a project (call after editing statuses). */
export const invalidateProjectStatuses = (projectId?: string) => {
  if (projectId) cache.delete(projectId);
  else cache.clear();
};

export const useProjectStatuses = (projectId?: string) => {
  const [statuses, setStatuses] = useState<ProjectStatus[]>(
    projectId ? cache.get(projectId) || [] : [],
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setStatuses([]);
      return;
    }
    setLoading(true);
    fetchStatuses(projectId).then((list) => {
      if (cancelled) return;
      setStatuses(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const byCode = useMemo(() => {
    const map = new Map<number, ProjectStatus>();
    for (const s of statuses) map.set(s.code, s);
    return map;
  }, [statuses]);

  /**
   * Chip metadata for a code. Unknown codes (a status deleted from the master
   * while tickets still carry it) render as the bare code rather than a
   * guessed name.
   */
  const metaFor = (code: number | string | undefined) => {
    const n = Number(code);
    const hit = byCode.get(n);
    return (
      hit || {
        code: n,
        label: String(code ?? ""),
        color: "#374151",
        bg: "#f3f4f6",
        isClosed: false,
        isDefault: false,
        displayOrder: 0,
      }
    );
  };

  return { statuses, byCode, metaFor, loading };
};

export default useProjectStatuses;
