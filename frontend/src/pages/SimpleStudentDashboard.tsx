import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import StudentLayout from '../components/StudentLayout';
import API_BASE_URL from '../config/api';

interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  pending: number;
  resolved: number;
  closed: number;
}

const SimpleStudentDashboard = () => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams();
  const [stats, setStats] = useState<TicketStats>({
    total: 0,
    open: 0,
    inProgress: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTicketStats();
  }, []);

  const fetchTicketStats = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        navigate('/login');
        return;
      }
      
      // Fetch all student's tickets
      const response = await axios.get(`${API_BASE_URL}/api/tickets/my-tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        const tickets = response.data.data;
        
        // Calculate stats (status values are lowercase in DB)
        const calculatedStats: TicketStats = {
          total: tickets.length,
          open: tickets.filter((t: any) => t.status === 'open').length,
          inProgress: tickets.filter((t: any) => t.status === 'in-progress').length,
          pending: tickets.filter((t: any) => t.status === 'pending').length,
          resolved: tickets.filter((t: any) => t.status === 'resolved').length,
          closed: tickets.filter((t: any) => t.status === 'closed').length,
        };
        
        setStats(calculatedStats);
      }
    } catch (error: any) {
      console.error('Error fetching ticket stats:', error);
      if (error.response?.status === 401) {
        localStorage.removeItem('authToken');
        navigate('/login');
      } else if (error.response?.status === 403) {
        setError('You do not have permission to view tickets. Please contact support.');
      } else {
        setError('Failed to load dashboard statistics');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewMyTickets = () => {
    if (customUrlPath) {
      navigate(`/${customUrlPath}/student/my-tickets`);
    } else {
      // Fallback: extract from URL if useParams didn't work
      const pathParts = window.location.pathname.split('/');
      const urlPath = pathParts[1];
      navigate(`/${urlPath}/student/my-tickets`);
    }
  };

  return (
    <StudentLayout>
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: '600', 
            marginBottom: '8px',
            color: '#1f2937'
          }}>
            Candidate Dashboard
          </h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            View and manage your support tickets
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '24px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* Quick Action Button */}
        <div style={{ marginBottom: '32px' }}>
          <button
            onClick={handleViewMyTickets}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#2563eb'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#3b82f6'}
          >
            📋 View My Tickets
          </button>
        </div>

        {/* Stats Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
            Loading statistics...
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}>
            {/* Total Queries */}
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            }}>
              <div style={{ 
                fontSize: '14px', 
                color: '#6b7280', 
                marginBottom: '8px',
                fontWeight: '500'
              }}>
                Total Queries
              </div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: '700', 
                color: '#1f2937' 
              }}>
                {stats.total}
              </div>
            </div>

            {/* Open Queries */}
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              borderLeft: '4px solid #ef4444'
            }}>
              <div style={{ 
                fontSize: '14px', 
                color: '#6b7280', 
                marginBottom: '8px',
                fontWeight: '500'
              }}>
                Open
              </div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: '700', 
                color: '#ef4444' 
              }}>
                {stats.open}
              </div>
            </div>

            {/* In Progress */}
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              borderLeft: '4px solid #f59e0b'
            }}>
              <div style={{ 
                fontSize: '14px', 
                color: '#6b7280', 
                marginBottom: '8px',
                fontWeight: '500'
              }}>
                In Progress
              </div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: '700', 
                color: '#f59e0b' 
              }}>
                {stats.inProgress}
              </div>
            </div>

            {/* Pending */}
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              borderLeft: '4px solid #8b5cf6'
            }}>
              <div style={{ 
                fontSize: '14px', 
                color: '#6b7280', 
                marginBottom: '8px',
                fontWeight: '500'
              }}>
                Pending
              </div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: '700', 
                color: '#8b5cf6' 
              }}>
                {stats.pending}
              </div>
            </div>

            {/* Resolved */}
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              borderLeft: '4px solid #10b981'
            }}>
              <div style={{ 
                fontSize: '14px', 
                color: '#6b7280', 
                marginBottom: '8px',
                fontWeight: '500'
              }}>
                Resolved
              </div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: '700', 
                color: '#10b981' 
              }}>
                {stats.resolved}
              </div>
            </div>

            {/* Closed */}
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              borderLeft: '4px solid #6b7280'
            }}>
              <div style={{ 
                fontSize: '14px', 
                color: '#6b7280', 
                marginBottom: '8px',
                fontWeight: '500'
              }}>
                Closed
              </div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: '700', 
                color: '#6b7280' 
              }}>
                {stats.closed}
              </div>
            </div>
          </div>
        )}

        {/* Information Card */}
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            fontWeight: '600', 
            marginBottom: '16px',
            color: '#1f2937'
          }}>
            Welcome to Your Support Portal
          </h2>
          <div style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
            <p style={{ marginBottom: '12px' }}>
              You can view and manage all your support tickets from this portal. Here's what you can do:
            </p>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              <li style={{ marginBottom: '8px' }}>View all your submitted tickets and their current status</li>
              <li style={{ marginBottom: '8px' }}>Track the progress of your tickets in real-time</li>
              <li style={{ marginBottom: '8px' }}>Add comments and attachments to your tickets</li>
              <li style={{ marginBottom: '8px' }}>Get notified when your tickets are updated</li>
            </ul>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
};

export default SimpleStudentDashboard;
