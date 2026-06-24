/**
 * Service Request (PSR/ISR) — frontend API client. Phase 3.
 * Thin typed wrapper over the shared `api` axios instance.
 */
import { api } from "../utils/api";

export interface SrListParams {
  projectId?: string;
  interactionType?: string; // "PSR" | "ISR" | "all"
  status?: string;
  assignedTo?: string;
  search?: string;
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

  studentLookup: (q: string, projectId?: string) =>
    api
      .get(`${base}/student-lookup`, { params: { q, projectId } })
      .then((r) => r.data),
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
  parentClose: (id: string, body: any) =>
    api.post(`${base}/${id}/parent-close`, body).then((r) => r.data),
  pslCall: (id: string, body: any) =>
    api.post(`${base}/${id}/psl-call`, body).then((r) => r.data),

  // Per-project SR config (enable + WIP limits)
  getConfig: (projectId: string) =>
    api.get(`${base}/config`, { params: { projectId } }).then((r) => r.data),
  updateConfig: (projectId: string, patch: any) =>
    api.put(`${base}/config`, { projectId, ...patch }).then((r) => r.data),

  // Email triage inbox (Phase 4)
  emailIntake: {
    list: (params: Record<string, any>) =>
      api.get("/email-intake", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/email-intake/${id}`).then((r) => r.data),
    ingest: (body: any) => api.post("/email-intake", body).then((r) => r.data),
    action: (id: string, body: any) =>
      api.post(`/email-intake/${id}/action`, body).then((r) => r.data),
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
    resolveOnCall: (id: string, body: any) =>
      api.post(`/ivr/calls/${id}/resolve-on-call`, body).then((r) => r.data),
  },

  // Leads (admission enquiries)
  leads: {
    list: (params: Record<string, any>) =>
      api.get("/leads", { params }).then((r) => r.data),
    create: (body: any) => api.post("/leads", body).then((r) => r.data),
    update: (id: string, body: any) =>
      api.put(`/leads/${id}`, body).then((r) => r.data),
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
export const SR_STATUS_META: Record<
  number,
  { label: string; color: string; bg: string }
> = {
  1: { label: "Open", color: "#1d4ed8", bg: "#eff6ff" },
  2: { label: "Work In Progress", color: "#b45309", bg: "#fffbeb" },
  3: { label: "On Hold", color: "#6b7280", bg: "#f3f4f6" },
  4: { label: "Resolved", color: "#047857", bg: "#ecfdf5" },
  5: { label: "Closed", color: "#374151", bg: "#f3f4f6" },
  6: { label: "Re-open", color: "#b91c1c", bg: "#fef2f2" },
  7: { label: "Re-Opened WIP", color: "#c2410c", bg: "#fff7ed" },
};
