import { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { API_CONFIG } from '../config/constants';

interface ProjectDashboardStats {
  totalTickets: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  withinSLA: number;
  outsideSLA: number;
}

interface ProjectDashboardProps {
  wrapWithLayout?: boolean;
}

const ProjectDashboard = ({ wrapWithLayout = true }: ProjectDashboardProps) => {
  const [stats, setStats] = useState<ProjectDashboardStats>({
    totalTickets: 0,
    highPriority: 0,
    mediumPriority: 0,
    lowPriority: 0,
    withinSLA: 0,
    outsideSLA: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjectDashboardStats();
  }, []);

  const fetchProjectDashboardStats = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      // Try to get projectId from multiple sources
      let projectId = localStorage.getItem('projectId');
      
      // If not found, try projectContext (used by portal routes)
      if (!projectId) {
        const projectContext = localStorage.getItem('projectContext');
        if (projectContext) {
          try {
            const context = JSON.parse(projectContext);
            projectId = context.projectId;
          } catch (e) {
            console.error('Failed to parse projectContext:', e);
          }
        }
      }
      
      if (!projectId) {
        setError('Project information not found');
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${API_CONFIG.API_URL}/tickets/project-dashboard-stats?projectId=${projectId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        } else {
          setError(data.error || 'Failed to load dashboard statistics');
        }
      } else {
        setError('Failed to load dashboard statistics');
      }
    } catch (err) {
      console.error('Error fetching project dashboard stats:', err);
      setError('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const cards = [
    {
      title: 'Total Queries',
      value: stats.totalTickets,
      icon: '🎫',
      bgColor: '#EFF6FF',
      textColor: '#1E40AF',
      borderColor: '#3B82F6',
    },
    {
      title: 'High Priority',
      value: stats.highPriority,
      icon: '🔴',
      bgColor: '#FEF2F2',
      textColor: '#991B1B',
      borderColor: '#EF4444',
    },
    {
      title: 'Medium Priority',
      value: stats.mediumPriority,
      icon: '🟡',
      bgColor: '#FFFBEB',
      textColor: '#92400E',
      borderColor: '#F59E0B',
    },
    {
      title: 'Low Priority',
      value: stats.lowPriority,
      icon: '🟢',
      bgColor: '#F0FDF4',
      textColor: '#14532D',
      borderColor: '#22C55E',
    },
    {
      title: 'Within SLA',
      value: stats.withinSLA,
      icon: '✅',
      bgColor: '#ECFDF5',
      textColor: '#065F46',
      borderColor: '#10B981',
    },
    {
      title: 'Outside SLA',
      value: stats.outsideSLA,
      icon: '⚠️',
      bgColor: '#FEF3C7',
      textColor: '#78350F',
      borderColor: '#F59E0B',
    },
  ];

  const dashboardContent = (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          marginBottom: '8px',
          color: '#111827'
        }}>
          Project Dashboard
        </h1>
        <p style={{ fontSize: '14px', color: '#6B7280' }}>
          Overview of queries for your project
        </p>
      </div>

      {/* Stats Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {cards.map((card, index) => (
          <div
            key={index}
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              border: `2px solid ${card.borderColor}20`,
              transition: 'all 0.3s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
            }}
          >
            {/* Icon */}
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: card.bgColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              marginBottom: '16px'
            }}>
              {card.icon}
            </div>

            {/* Title */}
            <p style={{
              fontSize: '14px',
              color: '#6B7280',
              marginBottom: '8px',
              fontWeight: '500'
            }}>
              {card.title}
            </p>

            {/* Value */}
            <p style={{
              fontSize: '36px',
              fontWeight: '700',
              color: card.textColor,
              lineHeight: '1'
            }}>
              {loading ? (
                <span style={{ color: '#9CA3AF' }}>-</span>
              ) : (
                card.value
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Additional Info */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        border: '1px solid #E5E7EB'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px',
          background: '#F9FAFB',
          borderRadius: '8px'
        }}>
          <span style={{ fontSize: '20px' }}>ℹ️</span>
          <p style={{ fontSize: '14px', color: '#6B7280', margin: 0 }}>
            Dashboard statistics are updated in real-time and show data based on your access permissions.
            {' '}
            {stats.totalTickets === 0 && !loading && 'No queries found for this project yet.'}
          </p>
        </div>
      </div>
    </div>
  );

  if (error && !error.includes('Not Found')) {
    const errorContent = (
      <div style={{ padding: '20px' }}>
        <div style={{
          background: '#FEE2E2',
          border: '1px solid #EF4444',
          borderRadius: '8px',
          padding: '16px',
          color: '#991B1B'
        }}>
          {error}
        </div>
      </div>
    );
    
    return wrapWithLayout ? <DashboardLayout>{errorContent}</DashboardLayout> : errorContent;
  }

  return wrapWithLayout ? <DashboardLayout>{dashboardContent}</DashboardLayout> : dashboardContent;
};

export default ProjectDashboard;
