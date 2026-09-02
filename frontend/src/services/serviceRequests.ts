/**
 * Service Request (PSR/ISR) — frontend API client. Phase 3.
 * Thin typed wrapper over the shared `api` axios instance.
 */
import { api } from "../utils/api";

export interface SrListParams {
  projectId?: string;
  interactionType?: string; // "PSR" | "ISR" | "all"
  viewScope?: "project" | "assigned" | "raised" | "my";
  status?: string;
  assignedTo?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  priority?: string;
  wipFrom?: string;
  wipTo?: string;
  wipState?: string;
  source?: string;
  classification?: string;
  categoryId?: string;
  linkedIsrState?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  limit?: number;
}

export interface SrListResponse {
  success: boolean;
  items: any[];
  total: number;
  page: number;
  limit: number;
  statusCounts?: Record<string, number>;
}

const base = "/service-requests";

export const serviceRequestApi = {
  list: (params: SrListParams) =>
    api.get<SrListResponse>(base, { params }).then((r) => r.data),
  get: (id: string) => api.get(`${base}/${id}`).then((r) => r.data),
  create: (body: any) => api.post(base, body).then((r) => r.data),
  bulkDelete: (ids: string[]) =>
    api.delete(`${base}/bulk`, { data: { ticketIds: ids } }).then((r) => r.data),
  merge: (primaryId: string, ticketIds: string[]) =>
    api.post(`${base}/${primaryId}/merge`, { ticketIds }).then((r) => r.data),
  activePriorities: (projectId?: string) =>
    api
      .get("/priorities/active", { params: { projectId } })
      .then((r) => r.data),
  projectStatuses: (projectId: string) =>
    api.get(`/statuses/project/${projectId}`).then((r) => r.data),

  // Linked ISRs (PSR ↔ ISR)
  linkedIsrs: (psrId: string) =>
    api.get(`${base}/${psrId}/linked-isrs`).then((r) => r.data),
  linkPsr: (isrId: string, psrId: string) =>
    api.post(`${base}/${isrId}/link-psr`, { psrId }).then((r) => r.data),
  linkParentTicket: (isrId: string, parentTicketId: string) =>
    api
      .post(`${base}/${isrId}/link-psr`, { parentTicketId })
      .then((r) => r.data),

  studentLookup: (q: string, projectId?: string) =>
    api
      .get(`${base}/student-lookup`, { params: { q, projectId } })
      .then((r) => r.data),
  parentLookup: (q: string, projectId?: string, mdmSourceId?: string) =>
    api
      .get(`${base}/parent-lookup`, { params: { q, projectId, mdmSourceId } })
      .then((r) => r.data),
  formMdmOptions: (params: Record<string, any>) =>
    api.get(`${base}/form-mdm-options`, { params }).then((r) => r.data),
  duplicates: (params: Record<string, any>) =>
    api.get(`${base}/duplicates`, { params }).then((r) => r.data),

  changeStatus: (id: string, body: any) =>
    api.post(`${base}/${id}/status`, body).then((r) => r.data),
  close: (id: string, body: any) =>
    api.post(`${base}/${id}/close`, body).then((r) => r.data),
  reassign: (id: string, body: any) =>
    api.post(`${base}/${id}/reassign`, body).then((r) => r.data),
  delegate: (id: string, body: any) =>
    api.post(`${base}/${id}/delegate`, body).then((r) => r.data),
  reopen: (id: string, body: any) =>
    api.post(`${base}/${id}/reopen`, body).then((r) => r.data),
  cancel: (id: string, body: any) =>
    api.post(`${base}/${id}/cancel`, body).then((r) => r.data),
  parentClose: (id: string, body: any) =>
    api.post(`${base}/${id}/parent-close`, body).then((r) => r.data),
  pslCall: (id: string, body: any) =>
    api.post(`${base}/${id}/psl-call`, body).then((r) => r.data),

  // Per-project SR config (enable + WIP limits)
  getConfig: (projectId: string) =>
    api.get(`${base}/config`, { params: { projectId } }).then((r) => r.data),
  updateConfig: (projectId: string, patch: any) =>
    api.put(`${base}/config`, { projectId, ...patch }).then((r) => r.data),
  testLeadCrmConfig: (projectId: string, leadSync: any, payload?: any) =>
    api
      .post(`${base}/config/test-crm`, { projectId, leadSync, payload })
      .then((r) => r.data),
  // Test PSR entity-scope routing: resolve owners for a scope tuple
  testPsrRouting: (projectId: string, scope: Record<string, string>) =>
    api
      .post(`${base}/config/test-psr-routing`, { projectId, scope })
      .then((r) => r.data),

  // Recompute open SR TATs (#13)
  recomputeTat: (projectId: string) =>
    api
      .post(`${base}/recompute-tat`, null, { params: { projectId } })
      .then((r) => r.data),

  // SR notification templates (#9)
  getNotificationTemplates: (projectId: string) =>
    api
      .get(`${base}/notification-templates`, { params: { projectId } })
      .then((r) => r.data),
  saveNotificationTemplate: (body: any) =>
    api.put(`${base}/notification-templates`, body).then((r) => r.data),

  // Email triage inbox (Phase 4)
  emailIntake: {
    list: (params: Record<string, any>) =>
      api.get("/email-intake", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/email-intake/${id}`).then((r) => r.data),
    ingest: (body: any) => api.post("/email-intake", body).then((r) => r.data),
    action: (id: string, body: any) =>
      api.post(`/email-intake/${id}/action`, body).then((r) => r.data),
    bulkAction: (body: any) =>
      api.post("/email-intake/bulk-action", body).then((r) => r.data),
    bulkDelete: (ids: string[]) =>
      api.delete("/email-intake/bulk", { data: { ids } }).then((r) => r.data),
  },

  // IVR call triage (Phase 5)
  ivr: {
    list: (params: Record<string, any>) =>
      api.get("/ivr/calls", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/ivr/calls/${id}`).then((r) => r.data),
    ingest: (body: any) => api.post("/ivr/calls", body).then((r) => r.data),
    classify: (id: string, body: any) =>
      api.post(`/ivr/calls/${id}/classify`, body).then((r) => r.data),
    convert: (id: string, body: any) =>
      api.post(`/ivr/calls/${id}/convert`, body).then((r) => r.data),
    bulkReassign: (callIds: string[], toUserId: string) =>
      api
        .post("/ivr/calls/bulk-reassign", { callIds, toUserId })
        .then((r) => r.data),
    markJunk: (id: string, body: any) =>
      api.post(`/ivr/calls/${id}/junk`, body).then((r) => r.data),
    markConverted: (id: string, body: any) =>
      api.post(`/ivr/calls/${id}/converted`, body).then((r) => r.data),
    resolveOnCall: (id: string, body: any) =>
      api.post(`/ivr/calls/${id}/resolve-on-call`, body).then((r) => r.data),
    // Outbound Click-to-Call: rings the agent, then dials the caller back.
    clickToCall: (id: string, body?: { destinationNumber?: string }) =>
      api.post(`/ivr/calls/${id}/click-to-call`, body || {}).then((r) => r.data),
  },

  // Leads (admission enquiries)
  leads: {
    list: (params: Record<string, any>) =>
      api.get("/leads", { params }).then((r) => r.data),
    create: (body: any) => api.post("/leads", body).then((r) => r.data),
    update: (id: string, body: any) =>
      api.put(`/leads/${id}`, body).then((r) => r.data),
    retryCrmSync: (id: string) =>
      api.post(`/leads/${id}/retry-crm-sync`).then((r) => r.data),
    remove: (id: string) => api.delete(`/leads/${id}`).then((r) => r.data),
  },

  // Role mapping rules (Phase 6 — onboarding)
  roleMapping: {
    list: (projectId: string) =>
      api
        .get("/role-mapping-rules", { params: { projectId } })
        .then((r) => r.data),
    create: (body: any) =>
      api.post("/role-mapping-rules", body).then((r) => r.data),
    update: (id: string, body: any) =>
      api.put(`/role-mapping-rules/${id}`, body).then((r) => r.data),
    remove: (id: string) =>
      api.delete(`/role-mapping-rules/${id}`).then((r) => r.data),
  },

  // Clusters (school groups)
  clusters: {
    list: () => api.get("/clusters").then((r) => r.data),
    create: (body: any) => api.post("/clusters", body).then((r) => r.data),
    update: (id: string, body: any) =>
      api.put(`/clusters/${id}`, body).then((r) => r.data),
    remove: (id: string) =>
      api.delete(`/clusters/${id}`).then((r) => r.data),
  },

  // Routing master data (per sub-category)
  categoriesForProject: (projectId: string) =>
    api.get(`/categories/project/${projectId}`).then((r) => r.data),
  updateCategory: (categoryId: string, body: any) =>
    api.put(`/categories/${categoryId}`, body).then((r) => r.data),
  getCategorySla: (categoryId: string) =>
    api.get(`/categories/${categoryId}/sla`).then((r) => r.data),
  setCategorySla: (categoryId: string, body: any) =>
    api.put(`/categories/${categoryId}/sla`, body).then((r) => r.data),
  getAssignmentConfig: (categoryId: string) =>
    api.get(`/categories/${categoryId}/assignment-config`).then((r) => r.data),
  setAssignmentConfig: (categoryId: string, body: any) =>
    api
      .put(`/categories/${categoryId}/assignment-config`, body)
      .then((r) => r.data),
  departments: (projectId: string) =>
    api.get("/departments", { params: { projectId } }).then((r) => r.data),

  // Form schemas (admin)
  listForms: (projectId: string) =>
    api
      .get(`${base}/form-schemas`, { params: { projectId } })
      .then((r) => r.data),
  saveForm: (projectId: string, schema: any) =>
    api.post(`${base}/form-schemas`, { projectId, schema }).then((r) => r.data),
  deleteForm: (projectId: string, schemaId: string) =>
    api
      .delete(`${base}/form-schemas/${schemaId}`, { params: { projectId } })
      .then((r) => r.data),
};

/** PSR/ISR status code → label + color (matches SR_PSR_STATUSES on the backend). */
/**
 * Status labels/colours are NOT defined in code — they come from the project's
 * status master (SLA & Escalation) via `useProjectStatuses`.
 */

/** Priority name → chip colors. Priority is free-form master data; match by
 * normalized name, fall back to a neutral gray for anything unmapped. */
export const priorityMeta = (
  p?: string,
): { label: string; color: string; bg: string } => {
  const key = (p || "").trim().toUpperCase();
  const map: Record<string, { color: string; bg: string }> = {
    CRITICAL: { color: "#b91c1c", bg: "#fef2f2" },
    URGENT: { color: "#b91c1c", bg: "#fef2f2" },
    HIGH: { color: "#c2410c", bg: "#fff7ed" },
    MEDIUM: { color: "#b45309", bg: "#fffbeb" },
    NORMAL: { color: "#6b7280", bg: "#f3f4f6" },
    LOW: { color: "#047857", bg: "#ecfdf5" },
  };
  const m = map[key] || { color: "#6b7280", bg: "#f3f4f6" };
  return { label: key ? key.charAt(0) + key.slice(1).toLowerCase() : "—", ...m };
};

/** submissionSource → icon + label for the Source column. */
export const sourceMeta = (
  s?: string,
): { label: string; icon: string } => {
  const key = (s || "").trim().toLowerCase();
  const map: Record<string, { label: string; icon: string }> = {
    online: { label: "Online", icon: "🌐" },
    web: { label: "Web", icon: "🌐" },
    offline: { label: "Offline", icon: "🏢" },
    email: { label: "Email", icon: "📧" },
    ivr: { label: "IVR", icon: "📞" },
    whatsapp: { label: "WhatsApp", icon: "💬" },
    sms: { label: "SMS", icon: "📱" },
    chatbot: { label: "Chatbot", icon: "🤖" },
  };
  return map[key] || { label: s || "—", icon: "•" };
};

/** "5m", "3h", "2d" style compact age from an ISO date. */
export const compactAge = (iso?: string): string => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
};
