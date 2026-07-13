import { api } from "../utils/api";

/** IVR Agent Management API client (gated by IVR_AGENT_MANAGE). */
export const ivrAgentApi = {
  getDigits: (projectId: string) =>
    api.get("/ivr-agents/digits", { params: { projectId } }).then((r) => r.data),
  setDigits: (projectId: string, digits: { code: string; label: string }[]) =>
    api.put("/ivr-agents/digits", { projectId, digits }).then((r) => r.data),

  list: (projectId: string) =>
    api.get("/ivr-agents", { params: { projectId } }).then((r) => r.data),
  setMapping: (
    userId: string,
    body: { projectId: string; digits: string[]; active: boolean },
  ) => api.put(`/ivr-agents/${userId}`, body).then((r) => r.data),

  setAvailability: (
    userId: string,
    body: { projectId: string; available: boolean; unavailableUntil?: string | null },
  ) => api.put(`/ivr-agents/${userId}/availability`, body).then((r) => r.data),

  addLeave: (
    userId: string,
    body: { projectId: string; fromDate: string; toDate: string; reason?: string },
  ) => api.post(`/ivr-agents/${userId}/leaves`, body).then((r) => r.data),
  removeLeave: (leaveId: string) =>
    api.delete(`/ivr-agents/leaves/${leaveId}`).then((r) => r.data),
};
