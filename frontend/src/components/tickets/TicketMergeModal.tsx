import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import { Modal } from '../shared/Modal';
import { ArrowsPointingInIcon } from '@heroicons/react/24/outline';

interface Ticket {
  _id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority?: string;
  createdAt: string;
}

interface TicketMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  primaryTicket: Ticket;
  onMergeComplete: () => void;
}

export const TicketMergeModal: React.FC<TicketMergeModalProps> = ({
  isOpen,
  onClose,
  primaryTicket,
  onMergeComplete,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTickets, setAvailableTickets] = useState<Ticket[]>([]);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchAvailableTickets();
    }
  }, [isOpen]);

  const fetchAvailableTickets = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_BASE_URL}/tickets?exclude=${primaryTicket._id}&limit=50`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.data.success) {
        setAvailableTickets(response.data.data.tickets || []);
      }
    } catch (err: any) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTicket = (ticketId: string) => {
    setSelectedTickets(prev =>
      prev.includes(ticketId)
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  const handleMerge = async () => {
    if (selectedTickets.length === 0) {
      setError('Please select at least one ticket to merge');
      return;
    }

    if (!window.confirm(
      `Are you sure you want to merge ${selectedTickets.length} ticket(s) into ${primaryTicket.ticketNumber}? This action cannot be undone.`
    )) {
      return;
    }

    setMerging(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_BASE_URL}/tickets/${primaryTicket._id}/merge`,
        {
          ticketIds: selectedTickets,
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        onMergeComplete();
        onClose();
      }
    } catch (err: any) {
      console.error('Error merging tickets:', err);
      setError(err.response?.data?.error || 'Failed to merge tickets');
    } finally {
      setMerging(false);
    }
  };

  const filteredTickets = availableTickets.filter(ticket =>
    ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ticket.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Merge Tickets"
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            disabled={merging}
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={merging || selectedTickets.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            <ArrowsPointingInIcon className="h-5 w-5 mr-2" />
            {merging ? 'Merging...' : `Merge ${selectedTickets.length} Ticket(s)`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Primary Ticket Info */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900 mb-1">
            Primary Ticket (tickets will be merged into this one):
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-blue-900">{primaryTicket.ticketNumber}</p>
              <p className="text-sm text-blue-700">{primaryTicket.title}</p>
            </div>
            <div className="text-right">
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                {primaryTicket.status}
              </span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Tickets to Merge
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticket number or title..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Ticket List */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Tickets to Merge ({selectedTickets.length} selected)
          </label>
          <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500">
                Loading tickets...
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No tickets found
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredTickets.map((ticket) => (
                  <label
                    key={ticket._id}
                    className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTickets.includes(ticket._id)}
                      onChange={() => handleToggleTicket(ticket._id)}
                      className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {ticket.ticketNumber}
                          </p>
                          <p className="text-sm text-gray-600">
                            {ticket.title}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                            {ticket.status}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                            {ticket.priority || 'N/A'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Created: {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Merge Warning */}
        {selectedTickets.length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Warning:</strong> Merging tickets will:
            </p>
            <ul className="text-sm text-yellow-700 mt-1 ml-4 list-disc">
              <li>Combine all comments, attachments, and history into the primary ticket</li>
              <li>Close the merged tickets automatically</li>
              <li>Add a reference note in both tickets</li>
              <li>This action cannot be undone</li>
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TicketMergeModal;
