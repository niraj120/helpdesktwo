import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config/api';

interface User {
  _id: string;
  name: string;
  email: string;
  role: {
    name: string;
    code: string;
    _id: string;
  };
}

interface Ticket {
  _id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  assignedTo?: {
    _id: string;
    name: string;
    email: string;
  };
  createdBy: {
    _id: string;
    name: string;
  };
  createdAt: string;
}

interface Agent {
  _id: string;
  name: string;
  email: string;
  role: {
    code: string;
    name: string;
  };
}

interface TicketsModuleProps {
  user: User | null;
  permissions: string[]; // Array of permission codes like ['TICKET_VIEW_ALL', 'TICKET_ASSIGN']
}

export const TicketsModule: React.FC<TicketsModuleProps> = ({ user, permissions }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);

  // Check permissions
  const hasPermission = (code: string) => permissions.includes(code);
  const canViewAll = hasPermission('TICKET_VIEW_ALL');
  const canViewOwn = hasPermission('TICKET_VIEW_OWN');
  const canCreate = hasPermission('TICKET_CREATE');
  const canEdit = hasPermission('TICKET_EDIT');
  const canAssign = hasPermission('TICKET_ASSIGN');
  const canDelete = hasPermission('TICKET_DELETE');
  const canBulkUpdate = hasPermission('TICKET_BULK_UPDATE');
  const canChangeStatus = hasPermission('TICKET_CHANGE_STATUS');
  const canChangePriority = hasPermission('TICKET_CHANGE_PRIORITY');

  useEffect(() => {
    fetchTickets();
    if (canAssign) {
      fetchAgents();
    }
  }, []);

  const fetchTickets = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const endpoint = canViewAll ? '/tickets' : '/tickets/my-tickets';
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data.data || data.tickets || []);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/users?role=AGENT`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const agentUsers = (data.data || []).filter((u: any) => 
          u.role?.code === 'AGENT' || u.role?.name?.toLowerCase() === 'agent'
        );
        setAgents(agentUsers);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const handleSelectTicket = (ticketId: string) => {
    const newSelected = new Set(selectedTickets);
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId);
    } else {
      newSelected.add(ticketId);
    }
    setSelectedTickets(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTickets.size === tickets.length) {
      setSelectedTickets(new Set());
    } else {
      setSelectedTickets(new Set(tickets.map(t => t._id)));
    }
  };

  const handleAssignTicket = async (ticketId?: string) => {
    if (!selectedAgent) {
      alert('Please select an agent');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const ticketIds = ticketId ? [ticketId] : Array.from(selectedTickets);

      for (const id of ticketIds) {
        await fetch(`${API_BASE_URL}/tickets/${id}/assign`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ assignedTo: selectedAgent })
        });
      }

      alert(`Successfully assigned ${ticketIds.length} ticket(s)`);
      setShowAssignModal(false);
      setSelectedTickets(new Set());
      setSelectedAgent('');
      fetchTickets();
    } catch (error) {
      console.error('Error assigning tickets:', error);
      alert('Error assigning tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAssign = () => {
    if (selectedTickets.size === 0) {
      alert('Please select tickets to assign');
      return;
    }
    setShowAssignModal(true);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Queries</h2>
          <p className="text-sm text-gray-500 mt-1">
            {canViewAll ? 'All Queries' : 'My Queries'}
          </p>
        </div>
        <div className="flex gap-3">
          {canBulkUpdate && (
            <button
              onClick={() => setBulkMode(!bulkMode)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                bulkMode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {bulkMode ? 'Exit Bulk Mode' : 'Bulk Actions'}
            </button>
          )}
          {canCreate && (
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              + Create Ticket
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {bulkMode && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedTickets.size === tickets.length && tickets.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">
                Select All ({selectedTickets.size} selected)
              </span>
            </label>
          </div>
          
          {selectedTickets.size > 0 && (
            <div className="flex gap-2">
              {canAssign && (
                <button
                  onClick={handleBulkAssign}
                  className="px-4 py-2 bg-white text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
                >
                  Assign to Agent
                </button>
              )}
              {canChangeStatus && (
                <button className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                  Change Status
                </button>
              )}
              {canChangePriority && (
                <button className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                  Change Priority
                </button>
              )}
              {canDelete && (
                <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm">
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tickets Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {bulkMode && (
                <th className="px-6 py-3 w-12"></th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ticket #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned To
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              {canAssign && !bulkMode && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={bulkMode ? 8 : 7} className="px-6 py-8 text-center text-gray-500">
                  No tickets found
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr key={ticket._id} className="hover:bg-gray-50">
                  {bulkMode && (
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedTickets.has(ticket._id)}
                        onChange={() => handleSelectTicket(ticket._id)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                    #{ticket.ticketNumber}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {ticket.title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      ticket.status === 'Open' ? 'bg-green-100 text-green-800' :
                      ticket.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                      ticket.status === 'Resolved' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      ticket.priority === 'High' ? 'bg-red-100 text-red-800' :
                      ticket.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {ticket.assignedTo?.name || (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </td>
                  {canAssign && !bulkMode && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => {
                          setSelectedTickets(new Set([ticket._id]));
                          setShowAssignModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        Assign
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Assign Ticket{selectedTickets.size > 1 ? 's' : ''}
              </h3>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedAgent('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Assigning {selectedTickets.size} ticket{selectedTickets.size > 1 ? 's' : ''} to an agent
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Select an agent --</option>
                {agents.map((agent) => (
                  <option key={agent._id} value={agent._id}>
                    {agent.name} ({agent.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedAgent('');
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={() => handleAssignTicket()}
                disabled={!selectedAgent || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {loading ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
