import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

/**
 * SR detail is consolidated into the standard ticket detail page
 * (AgentTicketDetail), which now renders the SR lifecycle panel for PSR/ISR
 * tickets (audit Step E). This route redirects to keep old links working.
 */
const ServiceRequestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    if (id) navigate(`/tickets/${id}`, { replace: true });
  }, [id, navigate]);
  return null;
};

export default ServiceRequestDetail;
