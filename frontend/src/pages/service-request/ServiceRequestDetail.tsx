import React from "react";
import { useLocation } from "react-router-dom";
import AgentTicketDetail from "../AgentTicketDetail";

/**
 * PSR/ISR detail must use the same ticket-detail experience as normal queries.
 *
 * Keep this route as a wrapper instead of a redirect:
 * - /service-requests/:id remains guarded by SR permissions.
 * - /tickets/:id remains guarded by normal ticket permissions.
 * - Both render the same detail UI, including SR progress, Linked ISR, PSL Call,
 *   replies, notes, history, audit, and the right-side query panels.
 */
const ServiceRequestDetail: React.FC = () => {
  const location = useLocation();
  const isProjectPortal = location.pathname.includes("/portal/");

  return <AgentTicketDetail wrapWithLayout={!isProjectPortal} />;
};

export default ServiceRequestDetail;
