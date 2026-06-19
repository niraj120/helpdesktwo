/**
 * Client-side helpers for the "Login as user" (impersonation) feature.
 *
 * DPDP / security notes:
 *  - No password is ever handled here. The backend mints a short-lived
 *    impersonation JWT; we just swap it into the active session.
 *  - The admin's own auth snapshot is backed up so "Exit" restores it exactly.
 *  - localStorage is shared across tabs of the same origin, so impersonation
 *    affects every open tab — by design (single active identity per browser).
 */
import { API_CONFIG } from "../config/constants";

const IMPERSONATION_KEY = "impersonation"; // active-session metadata (for banner)
const BACKUP_KEY = "impersonatorBackup"; // admin's saved auth snapshot

// Auth-related localStorage keys we snapshot/restore around a session.
const AUTH_KEYS = [
  "authToken",
  "userId",
  "userEmail",
  "user",
  "userRole",
  "userPermissions",
  "viewMode",
  "projectContext",
  "projectBranding",
  "projectId",
  "selectedProject",
];

export interface ImpersonationMeta {
  adminName: string;
  adminEmail: string;
  targetName: string;
  targetEmail: string;
  startedAt: number;
}

/** Whether an impersonation session is currently active in this browser. */
export function isImpersonating(): boolean {
  return !!localStorage.getItem(IMPERSONATION_KEY);
}

/** Active impersonation metadata, or null. */
export function getImpersonation(): ImpersonationMeta | null {
  try {
    const raw = localStorage.getItem(IMPERSONATION_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationMeta) : null;
  } catch {
    return null;
  }
}

/**
 * Begin impersonating a user. Calls the backend, swaps the session, and
 * redirects into the impersonated user's default landing page.
 * @throws Error with a user-facing message on failure.
 */
export async function startImpersonation(
  userId: string,
  reason: string,
): Promise<void> {
  const token = localStorage.getItem("authToken");
  const res = await fetch(
    `${API_CONFIG.API_URL}/auth/impersonate/${userId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({ reason }),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to start impersonation.");
  }

  const d = data.data;

  // 1) Snapshot the admin's auth state (only once — never overwrite a backup).
  if (!localStorage.getItem(BACKUP_KEY)) {
    const backup: Record<string, string | null> = {};
    AUTH_KEYS.forEach((k) => (backup[k] = localStorage.getItem(k)));
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  }

  // 2) Swap in the impersonated identity.
  localStorage.setItem("authToken", d.token);
  localStorage.setItem("userId", d.user.id);
  localStorage.setItem("userEmail", d.user.email);
  localStorage.setItem("user", JSON.stringify(d.user));
  localStorage.setItem("userRole", d.user.role || "");
  localStorage.setItem("userPermissions", JSON.stringify(d.permissions || []));

  if (d.project) {
    localStorage.setItem("projectId", d.project.id);
    localStorage.setItem("selectedProject", d.project.id);
    localStorage.setItem("viewMode", "single");
    localStorage.setItem(
      "projectContext",
      JSON.stringify({
        viewMode: "single",
        currentProjectId: d.project.id,
        accessibleProjectIds: [d.project.id],
        isAdmin: false,
      }),
    );
  } else {
    localStorage.removeItem("projectContext");
    localStorage.removeItem("projectId");
    localStorage.removeItem("selectedProject");
    localStorage.setItem("viewMode", "unified");
  }

  // 3) Banner metadata.
  const meta: ImpersonationMeta = {
    adminName: d.impersonatedBy?.name || d.impersonatedBy?.email || "Admin",
    adminEmail: d.impersonatedBy?.email || "",
    targetName:
      `${d.user.firstName || ""} ${d.user.lastName || ""}`.trim() ||
      d.user.email,
    targetEmail: d.user.email,
    startedAt: Date.now(),
  };
  localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(meta));

  // 4) Land in the right place:
  //    - student            → backend-provided student dashboard route
  //    - project-mapped user → that project's portal (branded, correct URL)
  //    - everyone else       → top-level admin app default route
  let dest: string | null = d.redirectPath || null;
  if (!dest && d.project?.customUrlPath) {
    const { getFirstAvailableRoute } = await import("./loginRedirect");
    const sub = getFirstAvailableRoute(d.permissions || []);
    dest = `/${d.project.customUrlPath}/portal/${sub}`;
  }
  if (!dest) {
    const { getDefaultRoute } = await import("./routeUtils");
    dest = getDefaultRoute(d.permissions || []);
  }
  window.location.href = dest || "/";
}

/**
 * End the current impersonation session: pings the backend (audit end-event),
 * restores the admin's saved session, and returns to User Management.
 */
export async function stopImpersonation(): Promise<void> {
  // Best-effort end-of-session audit ping (uses the impersonation token).
  try {
    const token = localStorage.getItem("authToken");
    await fetch(`${API_CONFIG.API_URL}/auth/stop-impersonation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });
  } catch {
    /* ignore — restore the admin session regardless */
  }

  const raw = localStorage.getItem(BACKUP_KEY);
  localStorage.removeItem(IMPERSONATION_KEY);
  localStorage.removeItem(BACKUP_KEY);

  if (raw) {
    try {
      const backup = JSON.parse(raw) as Record<string, string | null>;
      Object.entries(backup).forEach(([k, v]) => {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      });
    } catch {
      /* fall through to redirect */
    }
  }

  window.location.href = "/users";
}
