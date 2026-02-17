import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import ViewModeSelector from '../components/ViewModeSelector';
import { API_CONFIG } from '../config/constants';

type ViewMode = 'self' | 'team' | 'hierarchy' | 'all';

interface ProjectDashboardStats {
  totalTickets: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  withinSLA: number;
  outsideSLA: number;
  pendingWithinSLA?: number;
  pendingOutsideSLA?: number;
}

interface ProjectDashboardProps {
  wrapWithLayout?: boolean;
}

const ProjectDashboard = ({ wrapWithLayout = true }: ProjectDashboardProps) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('self');
  const [stats, setStats] = useState<ProjectDashboardStats>({
    totalTickets: 0,
    highPriority: 0,
    mediumPriority: 0,
    lowPriority: 0,
    withinSLA: 1,
    outsideSLA: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjectDashboardStats(viewMode);
  }, [viewMode]); // Re-fetch when view mode changes

  const handleViewModeChange = (newMode: ViewMode) => {
    console.log('📊 ProjectDashboard: Switching view mode from', viewMode, 'to', newMode);
    setViewMode(newMode);
  };

  const fetchProjectDashboardStats = async (currentViewMode: ViewMode) => {
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

      console.log('📊 ProjectDashboard: Fetching stats with viewMode:', currentViewMode, 'projectId:', projectId);

      const response = await fetch(
        `${API_CONFIG.API_URL}/tickets/project-dashboard-stats?projectId=${projectId}&viewMode=${currentViewMode}`,
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
      title: 'Closed Within SLA',
      value: stats.withinSLA,
      icon: '✅',
      bgColor: '#ECFDF5',
      textColor: '#065F46',
      borderColor: '#10B981',
    },
    {
      title: 'Closed Outside SLA',
      value: stats.outsideSLA,
      icon: '⚠️',
      bgColor: '#FEF3C7',
      textColor: '#78350F',
      borderColor: '#F59E0B',
    },
    {
      title: 'Pending Within SLA',
      value: stats.pendingWithinSLA || 0,
      icon: '⏳',
      bgColor: '#EFF6FF',
      textColor: '#1E3A8A',
      borderColor: '#3B82F6',
    },
    {
      title: 'Pending Outside SLA',
      value: stats.pendingOutsideSLA || 0,
      icon: '🔥',
      bgColor: '#FEF2F2',
      textColor: '#7F1D1D',
      borderColor: '#DC2626',
    },
  ];

  const dashboardContent = (
    <div style={{ padding: '20px' }}>
      {/* Header with View Mode Selector */}
      <div style={{ position: 'relative' }}>
        <ModuleHeader
          title="Dashboard"
          subtitle={`Overview of ${viewMode === 'self' ? 'your' : viewMode === 'team' ? "your team's" : viewMode === 'hierarchy' ? "your hierarchy's" : 'all'} queries`}
        />
        
        {/* View Mode Selector - positioned in header area */}
        <div style={{ 
          position: 'absolute', 
          top: '32px', 
          right: '40px',
          zIndex: 10
        }}>
          <ViewModeSelector
            value={viewMode}
            onChange={handleViewModeChange}
            disabled={loading}
          />
        </div>
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
            {t('dashboardUpdatedRealtime')}
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
