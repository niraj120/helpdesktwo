import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../constants/permissions';
import KBChatbot from './KBChatbot';
import {
  HomeIcon,
  TicketIcon,
  BookOpenIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
  BellIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

interface AgentDashboardProps {
  projectId?: string;
}

const AgentDashboard: React.FC<AgentDashboardProps> = ({ projectId }) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { hasPermission } = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  // Language options
  const languages = [
    { code: 'en', name: 'English', flag: '🇮🇳' },
    { code: 'mr', name: 'मराठी', flag: '🇮🇳' }
  ];

  useEffect(() => {
    // Load user data
    const userEmail = localStorage.getItem('userEmail');
    const userId = localStorage.getItem('userId');
    const userRole = localStorage.getItem('userRole');
    
    setUserData({
      email: userEmail,
      id: userId,
      role: userRole,
      name: userEmail?.split('@')[0] || 'Agent'
    });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    localStorage.removeItem('projectId');
    navigate('/login');
  };

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  // Agent navigation items with permission requirements
  const allNavigationItems = [
    { 
      name: t('dashboard'), 
      icon: HomeIcon, 
      key: 'dashboard',
      description: 'Overview and statistics',
      permission: PERMISSIONS.DASHBOARD_VIEW
    },
    { 
      name: t('myTickets'), 
      icon: TicketIcon, 
      key: 'tickets',
      description: 'View and manage your assigned tickets',
      badge: '5', // TODO: Get from API
      permission: [PERMISSIONS.TICKET_VIEW_ALL, PERMISSIONS.TICKET_VIEW_OWN] // OR logic
    },
    { 
      name: t('knowledgeBase'), 
      icon: BookOpenIcon, 
      key: 'kb',
      description: 'Access help articles and documentation',
      permission: PERMISSIONS.KB_VIEW
    },
    { 
      name: t('myProfile'), 
      icon: UserCircleIcon, 
      key: 'profile',
      description: 'Manage your account settings'
      // No permission requirement - always visible
    },
  ];

  // Filter navigation items based on permissions
  const navigation = allNavigationItems.filter(item => {
    if (!item.permission) return true; // No permission requirement
    
    if (Array.isArray(item.permission)) {
      // OR logic - user needs any one permission
      return item.permission.some(perm => hasPermission(perm));
    }
    
    // Single permission
    return hasPermission(item.permission);
  });

  const renderContent = () => {
    switch (activeModule) {
      case 'dashboard':
        return (
          <div style={{ padding: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {t('welcome')}, {userData?.name}! 👋
            </h1>
            <p style={{ color: '#6B7280', marginBottom: '2rem' }}>
              {t('agentDashboardSubtitle')}
            </p>

            {/* Quick Stats */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: '1.5rem',
              marginBottom: '2rem'
            }}>
              {[
                { label: 'Open Tickets', value: '12', color: '#3B82F6', icon: '🎫' },
                { label: 'In Progress', value: '5', color: '#F59E0B', icon: '⚡' },
                { label: 'Resolved Today', value: '8', color: '#10B981', icon: '✅' },
                { label: 'Avg Response Time', value: '2.5h', color: '#8B5CF6', icon: '⏱️' },
              ].map((stat, idx) => (
                <div key={idx} style={{
                  background: 'white',
                  padding: '1.5rem',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  border: '1px solid #E5E7EB'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '2rem' }}>{stat.icon}</span>
                    <span style={{ fontSize: '2rem', fontWeight: 700, color: stat.color }}>{stat.value}</span>
                  </div>
                  <p style={{ color: '#6B7280', fontSize: '0.875rem' }}>{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Recent Tickets */}
            <div style={{ 
              background: 'white', 
              borderRadius: '12px', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #E5E7EB',
              overflow: 'hidden'
            }}>
              <div style={{ 
                padding: '1.5rem', 
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Recent Tickets</h2>
                <button
                  onClick={() => setActiveModule('tickets')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    cursor: 'pointer'
                  }}
                >
                  View All
                </button>
              </div>
              <div style={{ padding: '1.5rem' }}>
                <p style={{ color: '#6B7280', textAlign: 'center', padding: '2rem' }}>
                  No tickets assigned yet. Check back later!
                </p>
              </div>
            </div>
          </div>
        );
      
      case 'tickets':
        return (
          <div style={{ padding: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '2rem' }}>
              My Tickets
            </h1>
            <div style={{ 
              background: 'white', 
              borderRadius: '12px', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #E5E7EB',
              padding: '2rem',
              textAlign: 'center'
            }}>
              <p style={{ color: '#6B7280' }}>Ticket management coming soon...</p>
            </div>
          </div>
        );

      case 'kb':
        return (
          <div style={{ padding: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '2rem' }}>
              Knowledge Base
            </h1>
            <div style={{ 
              background: 'white', 
              borderRadius: '12px', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #E5E7EB',
              padding: '2rem',
              textAlign: 'center'
            }}>
              <p style={{ color: '#6B7280' }}>Knowledge base articles coming soon...</p>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div style={{ padding: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '2rem' }}>
              My Profile
            </h1>
            <div style={{ 
              background: 'white', 
              borderRadius: '12px', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #E5E7EB',
              padding: '2rem',
              maxWidth: '600px'
            }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Email</label>
                <input 
                  type="text" 
                  value={userData?.email || ''} 
                  disabled 
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    background: '#F9FAFB'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Role</label>
                <input 
                  type="text" 
                  value="Agent (L1)" 
                  disabled 
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    background: '#F9FAFB'
                  }}
                />
              </div>
              <button
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Change Password
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F9FAFB' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? '280px' : '80px',
        background: 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)',
        color: 'white',
        transition: 'width 0.3s ease',
        position: 'fixed',
        height: '100vh',
        overflowY: 'auto',
        zIndex: 40
      }}>
        {/* Logo */}
        <div style={{ 
          padding: '1.5rem', 
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            background: '#3B82F6',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            🎫
          </div>
          {sidebarOpen && (
            <div style={{ overflow: 'hidden' }}>
              <p style={{ fontWeight: 700, fontSize: '1.125rem', margin: 0 }}>SAC Helpdesk</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.7, margin: 0 }}>Agent Portal</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ padding: '1rem' }}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.key;
            
            return (
              <button
                key={item.key}
                onClick={() => setActiveModule(item.key)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  border: isActive ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <Icon style={{ width: '20px', height: '20px', flexShrink: 0 }} />
                {sidebarOpen && (
                  <>
                    <span style={{ flex: 1, textAlign: 'left', fontSize: '0.875rem' }}>{item.name}</span>
                    {item.badge && (
                      <span style={{
                        background: '#EF4444',
                        color: 'white',
                        fontSize: '0.75rem',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        fontWeight: 600
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div style={{ 
          position: 'absolute', 
          bottom: '1rem', 
          left: '1rem', 
          right: '1rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: '1rem'
        }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              justifyContent: sidebarOpen ? 'flex-start' : 'center'
            }}
          >
            <ArrowRightOnRectangleIcon style={{ width: '20px', height: '20px' }} />
            {sidebarOpen && <span style={{ fontSize: '0.875rem' }}>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ 
        marginLeft: sidebarOpen ? '280px' : '80px', 
        flex: 1,
        transition: 'margin-left 0.3s ease'
      }}>
        {/* Top Bar */}
        <header style={{
          background: 'white',
          borderBottom: '1px solid #E5E7EB',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                padding: '0.5rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {sidebarOpen ? (
                <XMarkIcon style={{ width: '24px', height: '24px' }} />
              ) : (
                <Bars3Icon style={{ width: '24px', height: '24px' }} />
              )}
            </button>

            {/* Search Bar */}
            <div style={{ position: 'relative', width: '400px' }}>
              <MagnifyingGlassIcon style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '20px',
                height: '20px',
                color: '#9CA3AF'
              }} />
              <input
                type="text"
                placeholder="Search tickets..."
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 3rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Language Selector */}
            <select
              value={i18n.language}
              onChange={(e) => changeLanguage(e.target.value)}
              style={{
                padding: '0.5rem',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>

            {/* Notifications */}
            <button style={{
              padding: '0.5rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              position: 'relative'
            }}>
              <BellIcon style={{ width: '24px', height: '24px' }} />
              <span style={{
                position: 'absolute',
                top: '0.25rem',
                right: '0.25rem',
                width: '8px',
                height: '8px',
                background: '#EF4444',
                borderRadius: '50%'
              }}></span>
            </button>

            {/* User Menu */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: 'none',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  background: '#3B82F6',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 600
                }}>
                  {userData?.name?.[0]?.toUpperCase() || 'A'}
                </div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  {userData?.name}
                </span>
                <ChevronDownIcon style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div style={{ minHeight: 'calc(100vh - 73px)' }}>
          {renderContent()}
        </div>
      </main>

      {/* KB Chatbot */}
      <KBChatbot />
    </div>
  );
};

export default AgentDashboard;
