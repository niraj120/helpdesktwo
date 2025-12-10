import { ReactNode, useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MdMenu, MdLogout, MdDashboard, MdConfirmationNumber, MdBook, MdPerson, MdAdd, MdLocationOn } from 'react-icons/md';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import { API_CONFIG } from '../config/constants';
import { PERMISSIONS } from '../constants/permissions';
import { usePermissions } from '../hooks/usePermissions';

interface StudentLayoutProps {
  children: ReactNode;
}

interface User {
  firstName: string;
  lastName: string;
  email: string;
}

interface ProjectBranding {
  logo?: string;
  colorTheme?: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  headerText?: string;
  footerText?: string;
}

const StudentLayout = ({ children }: StudentLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [branding, setBranding] = useState<ProjectBranding | null>(null);
  const { hasPermission, getAllPermissions } = usePermissions();

  // Debug: Log permissions on mount
  useEffect(() => {
    const perms = getAllPermissions();
    console.log('📋 Student permissions loaded:', perms);
    console.log('📋 Permission count:', perms.length);
  }, [getAllPermissions]);

  // Extract customUrlPath from current location
  const customUrlPath = useMemo(() => {
    const pathParts = location.pathname.split('/');
    return pathParts[1]; // First segment after /
  }, [location.pathname]);

  // Fetch project branding
  useEffect(() => {
    const fetchBranding = async () => {
      if (customUrlPath) {
        try {
          const response = await axios.get(`${API_BASE_URL}/projects/branding/${customUrlPath}`);
          if (response.data.success) {
            setBranding(response.data.data.branding);
          }
        } catch (error) {
          console.error('Error fetching project branding:', error);
        }
      }
    };
    fetchBranding();
  }, [customUrlPath]);

  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const response = await axios.get(`${API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.data.success) {
            setUser(response.data.data);
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };
    fetchUserData();
  }, []);

  const primaryColor = branding?.colorTheme?.primary || '#3b82f6';
  const secondaryColor = branding?.colorTheme?.secondary || '#64748b';

  const handleLogout = async () => {
    const token = localStorage.getItem('authToken');
    
    // Try to call logout endpoint, but don't wait for it
    if (token) {
      fetch(`${API_CONFIG.API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }).catch(() => {
        // Ignore errors - we'll clear localStorage anyway
      });
    }
    
    // Clear all auth-related data immediately
    localStorage.clear();
    
    // Force full page reload to the submit ticket page
    window.location.href = `/${customUrlPath}/submit-ticket`;
  };

  const menuItems = [
    {
      path: `/${customUrlPath}/student/dashboard`,
      icon: <MdDashboard />,
      label: 'Dashboard',
      permission: null, // Always visible
    },
    {
      path: `/${customUrlPath}/student/my-tickets`,
      icon: <MdConfirmationNumber />,
      label: 'My Queries',
      permission: PERMISSIONS.TICKET_VIEW_OWN,
    },
    {
      path: `/${customUrlPath}/submit-ticket`,
      icon: <MdAdd />,
      label: 'Submit Query',
      permission: PERMISSIONS.TICKET_CREATE,
    },
    {
      path: `/${customUrlPath}/kb`,
      icon: <MdBook />,
      label: 'Knowledge Base',
      permission: PERMISSIONS.KB_VIEW,
    },
    {
      path: `/${customUrlPath}/find-center`,
      icon: <MdLocationOn />,
      label: 'Find Center',
      permission: PERMISSIONS.OFFLINE_MODULE_ACCESS,
    },
  ];

  // Filter menu items based on permissions
  const visibleMenuItems = menuItems.filter(item => 
    !item.permission || hasPermission(item.permission)
  );

  const isActive = (path: string) => {
    return location.pathname.includes(path);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? '260px' : '80px',
          background: 'white',
          borderRight: '1px solid #e5e7eb',
          transition: 'width 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          height: '100vh',
          zIndex: 1000,
        }}
      >
        {/* Logo/Header */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarOpen ? 'space-between' : 'center',
            flexDirection: sidebarOpen ? 'row' : 'column',
            gap: sidebarOpen ? '0' : '12px',
          }}
        >
          {branding?.logo && (
            <img 
              src={branding.logo} 
              alt="Logo" 
              style={{ 
                height: sidebarOpen ? '40px' : '32px',
                width: 'auto',
                objectFit: 'contain'
              }} 
            />
          )}
          {sidebarOpen && !branding?.logo && (
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: primaryColor, margin: 0 }}>
              {branding?.headerText || 'Candidate Portal'}
            </h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <MdMenu style={{ fontSize: '24px', color: '#6b7280' }} />
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
          {visibleMenuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                marginBottom: '4px',
                borderRadius: '8px',
                textDecoration: 'none',
                transition: 'all 0.2s',
                background: isActive(item.path) ? primaryColor : 'transparent',
                color: isActive(item.path) ? 'white' : '#6b7280',
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.color = primaryColor;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#6b7280';
                }
              }}
            >
              <span style={{ fontSize: '20px', display: 'flex', alignItems: 'center' }}>
                {item.icon}
              </span>
              {sidebarOpen && (
                <span style={{ fontSize: '14px', fontWeight: '500' }}>{item.label}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* Logout Button */}
        <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#6b7280',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fee2e2';
              e.currentTarget.style.color = '#dc2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            <MdLogout style={{ fontSize: '20px' }} />
            {sidebarOpen && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        style={{
          marginLeft: sidebarOpen ? '260px' : '80px',
          flex: 1,
          transition: 'margin-left 0.3s ease',
          minHeight: '100vh',
        }}
      >
        {/* Top Bar */}
        <header
          style={{
            background: 'white',
            borderBottom: '1px solid #e5e7eb',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: '600', color: primaryColor }}>
            {branding?.headerText || 'Candidate Support Portal'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {user && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                padding: '8px 16px',
                background: '#f3f4f6',
                borderRadius: '8px'
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600'
                }}>
                  {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                    {user.firstName} {user.lastName}
                  </span>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {user.email}
                  </span>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div style={{ padding: '24px' }}>{children}</div>
      </main>
    </div>
  );
};

export default StudentLayout;
