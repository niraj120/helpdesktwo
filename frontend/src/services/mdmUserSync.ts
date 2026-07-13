import { api } from "../utils/api";

/** MDM → User sync (refresh active/inactive + profile). Perm: USER_IMPORT. */
export const mdmUserSyncApi = {
  all: () => api.post("/mdm-sync/all").then((r) => r.data),
  source: (sourceId: string) =>
    api.post(`/mdm-sync/source/${sourceId}`).then((r) => r.data),
  user: (userId: string) =>
    api.post(`/mdm-sync/user/${userId}`).then((r) => r.data),
};
