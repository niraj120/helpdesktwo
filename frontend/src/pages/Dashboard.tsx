import { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { API_CONFIG } from '../config/constants';

interface TicketStats {
  total: number;
  pending: number;
  resolved: number;
  recentActivity: Array<{
    ticketId: string;
    title: string;
    status: string;
    updatedAt: string;
  }>;
}

const Dashboard = () => {
  const [userData, setUserData] = useState({
    email: '',
    role: '',
    firstName: '',
    lastName: ''
  });

  const [ticketStats, setTicketStats] = useState<TicketStats>({
    total: 0,
    pending: 0,
    resolved: 0,
    recentActivity: []
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get user data from localStorage
    const email = localStorage.getItem('userEmail') || '';
    const role = localStorage.getItem('userRole') || '';
    const firstName = localStorage.getItem('userFirstName') || '';
    const lastName = localStorage.getItem('userLastName') || '';

    setUserData({ email, role, firstName, lastName });

    // Fetch ticket statistics
    fetchTicketStats();
  }, []);

  const fetchTicketStats = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/tickets/dashboard-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTicketStats(data);
      }
    } catch (error) {
      console.error('Error fetching ticket stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#111827' }}>
          Dashboard
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
          Overview of your work
        </p>

        {/* Stats Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '24px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total Queries</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
              {loading ? '-' : ticketStats.total}
            </p>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Pending</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>
              {loading ? '-' : ticketStats.pending}
            </p>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Resolved</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
              {loading ? '-' : ticketStats.resolved}
            </p>
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
            Recent Activity
          </h2>
          {loading ? (
            <p style={{ color: '#6b7280' }}>Loading...</p>
          ) : ticketStats.recentActivity.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {ticketStats.recentActivity.map((activity) => (
                <div
                  key={activity.ticketId}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#111827', marginBottom: '4px' }}>
                    {activity.title}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6b7280' }}>
                    <span>Ticket #{activity.ticketId.slice(-6)}</span>
                    <span>•</span>
                    <span>{activity.status}</span>
                    <span>•</span>
                    <span>{new Date(activity.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#6b7280' }}>No recent activity</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
