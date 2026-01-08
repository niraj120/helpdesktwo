import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import API_BASE_URL from '../config/api';
import { usePermissionContext } from '../context/PermissionContext';
import { 
  NoSymbolIcon, 
  MagnifyingGlassIcon, 
  PlusIcon,
  TrashIcon,
  CheckCircleIcon 
} from '@heroicons/react/24/outline';

interface BlockedEmail {
  _id: string;
  email: string;
  reason: string;
  blockedBy: {
    firstName: string;
    lastName: string;
  };
  blockedAt: string;
  isActive: boolean;
}

const BlockedEmailRecipients: React.FC = () => {
  const { hasPermission } = usePermissionContext();
  const [blockedEmails, setBlockedEmails] = useState<BlockedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canManage = hasPermission('AUDIT_MANAGE_BLOCKED_EMAILS');

  useEffect(() => {
    fetchBlockedEmails();
  }, []);

  const fetchBlockedEmails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE_URL}/api/blocked-emails`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setBlockedEmails(response.data.data);
      }
    } catch (err: any) {
      console.error('Error fetching blocked emails:', err);
      setError(err.response?.data?.error || 'Failed to load blocked emails');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBlockedEmail = async () => {
    if (!newEmail) {
      setError('Email address is required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_BASE_URL}/api/blocked-emails`,
        {
          email: newEmail,
          reason: newReason || 'Blocked by administrator'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        fetchBlockedEmails();
        setShowAddModal(false);
        setNewEmail('');
        setNewReason('');
      }
    } catch (err: any) {
      console.error('Error adding blocked email:', err);
      setError(err.response?.data?.error || 'Failed to block email');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnblock = async (emailId: string) => {
    if (!window.confirm('Are you sure you want to unblock this email address?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.delete(
        `${API_BASE_URL}/api/blocked-emails/${emailId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        fetchBlockedEmails();
      }
    } catch (err: any) {
      console.error('Error unblocking email:', err);
      setError(err.response?.data?.error || 'Failed to unblock email');
    }
  };

  const filteredEmails = blockedEmails.filter(email =>
    email.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.reason.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <p>Loading blocked emails...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <ModuleHeader 
          title="Blocked Email Recipients"
          subtitle="Manage email addresses that are blocked from receiving system notifications"
        />

        {error && (
          <div style={{
            background: '#FEE2E2',
            border: '1px solid #EF4444',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '24px',
            color: '#991B1B'
          }}>
            {error}
          </div>
        )}

        {/* Search and Add */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <MagnifyingGlassIcon style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '20px',
                height: '20px',
                color: '#9CA3AF'
              }} />
              <input
                type="text"
                placeholder="Search by email or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 40px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
            </div>
            {canManage && (
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#B91C1C'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#DC2626'}
              >
                <PlusIcon style={{ width: '16px', height: '16px' }} />
                Block Email
              </button>
            )}
          </div>
        </div>

        {/* Blocked Emails Table */}
        {filteredEmails.length === 0 ? (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <NoSymbolIcon style={{ width: '48px', height: '48px', color: '#9CA3AF', margin: '0 auto 16px' }} />
            <p style={{ color: '#6B7280', fontSize: '16px' }}>
              {searchQuery ? 'No blocked emails found matching your search' : 'No blocked emails yet'}
            </p>
          </div>
        ) : (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#F9FAFB' }}>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                    Email Address
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                    Reason
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                    Blocked By
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                    Blocked At
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                    Status
                  </th>
                  {canManage && (
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredEmails.map((email) => (
                  <tr
                    key={email._id}
                    style={{ borderBottom: '1px solid #E5E7EB', transition: 'background-color 0.15s' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: 500 }}>
                      {email.email}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280' }}>
                      {email.reason}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280' }}>
                      {email.blockedBy.firstName} {email.blockedBy.lastName}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280' }}>
                      {new Date(email.blockedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: email.isActive ? '#FEE2E2' : '#D1FAE5',
                        color: email.isActive ? '#DC2626' : '#059669',
                      }}>
                        {email.isActive ? 'Blocked' : 'Unblocked'}
                      </span>
                    </td>
                    {canManage && (
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {email.isActive && (
                          <button
                            onClick={() => handleUnblock(email._id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 12px',
                              background: '#059669',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#047857'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#059669'}
                          >
                            <CheckCircleIcon style={{ width: '14px', height: '14px' }} />
                            Unblock
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '16px', textAlign: 'right', fontSize: '14px', color: '#6B7280' }}>
          Showing {filteredEmails.length} of {blockedEmails.length} blocked email(s)
        </div>
      </div>

      {/* Add Blocked Email Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '500px',
              maxWidth: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>
              Block Email Address
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                Email Address *
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@example.com"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                Reason
              </label>
              <textarea
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Why is this email being blocked?"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewEmail('');
                  setNewReason('');
                  setError('');
                }}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddBlockedEmail}
                disabled={submitting}
                style={{
                  padding: '10px 20px',
                  background: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Blocking...' : 'Block Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default BlockedEmailRecipients;
