import { useLocation } from "react-router-dom";
import { useProjectContext } from "../contexts/ProjectContext";

/**
 * Which project a screen may act on.
 *
 * In the project portal the URL already names the project
 * (`/{customUrlPath}/portal/...`), so a screen opened there is pinned to that
 * project: no cross-project picker, no way to configure a neighbouring tenant
 * by switching a dropdown. In the main system the caller still chooses.
 *
 * Frontend-only — it removes the choice from the UI. The server still has to
 * authorize the project id it is handed (see requireProjectAccess).
 */
export const useProjectScope = () => {
  const { pathname } = useLocation();
  const { currentProjectId } = useProjectContext();
  const isProjectPortal = pathname.includes("/portal/");

  return {
    isProjectPortal,
    /** The project the portal pinned us to, or null in the main system. */
    lockedProjectId: isProjectPortal ? currentProjectId || "" : null,
  };
};

export default useProjectScope;
