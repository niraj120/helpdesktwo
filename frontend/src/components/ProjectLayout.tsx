
import { ReactNode, useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_CONFIG } from '../config/constants';
import { 
  MdMenu, 
  MdLogout, 
  MdDashboard, 
  MdConfirmationNumber, 
  MdBook, 
  MdSettings, 
  MdPeople, 
  MdFactCheck,
  MdArrowBack
} from 'react-icons/md';
import { PermissionProvider } from '../context/PermissionContext';
import { projectPortalMenuConfig, getFilteredMenuItems } from '../config/menuConfig';
import { designSystem } from '../styles/theme';

interface ProjectLayoutProps {
  children: ReactNode;
  logoutRedirectPath?: string;
}

const ProjectLayout = ({ children, logoutRedirectPath }: ProjectLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customUrlPath } = useParams();
  const { i18n } = useTranslation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [projectBranding, setProjectBranding] = useState<any>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  // Load permissions from localStorage or JWT
  useEffect(() => {
    const loadPermissions = () => {
      try {
        const storedPermissions = localStorage.getItem('userPermissions');
        if (storedPermissions) {
          setPermissions(JSON.parse(storedPermissions));
        } else {
          const token = localStorage.getItem('authToken');
          if (token) {
            const parts = token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              const tokenPermissions = payload.role?.permissions || [];
              setPermissions(tokenPermissions);
              localStorage.setItem('userPermissions', JSON.stringify(tokenPermissions));
            }
          }
        }
      } catch (error) {
        console.error('Error loading permissions:', error);
      }
    };

    loadPermissions();
  }, []);

  // Load project branding
  useEffect(() => {
    const fetchProjectBranding = async () => {
      try {
        if (customUrlPath) {
          const response = await fetch(`${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`);
          const branding = await response.json();
          setProjectBranding({
            name: branding.name,
            code: branding.code,
            logo: branding.logo,
            colorTheme: branding.colorTheme || {
              primary: '#667eea',
              secondary: '#764ba2',
              accent: '#3b82f6',
              background: '#ffffff'
            }
          });
        }
      } catch (error) {
        console.error('Error loading project branding:', error);
      }
    };

    fetchProjectBranding();
  }, [customUrlPath]);

  // Apply project color theme
  useEffect(() => {
    if (projectBranding?.colorTheme) {
      const root = document.documentElement;
      root.style.setProperty('--primary-main', projectBranding.colorTheme.primary);
      root.style.setProperty('--primary-dark', projectBranding.colorTheme.secondary);
      root.style.setProperty('--accent-main', projectBranding.colorTheme.accent);
    }
  }, [projectBranding]);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      await fetch(`${API_CONFIG.API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.clear();
      navigate(logoutRedirectPath || `/${customUrlPath}/portal/login`);
    }
  };

  // Get filtered menu items for project portal
  const menuItems = getFilteredMenuItems(
    projectPortalMenuConfig.map(item => ({
      ...item,
      path: item.path ? `/${customUrlPath}/portal/${item.path}` : undefined
    })),
    permissions
  );

  const userName = localStorage.getItem('userName') || 'Project User';
  const userRole = localStorage.getItem('userRole') || 'Agent';

  return (
    <PermissionProvider>
      <div style={{ 
        display: 'flex', 
        minHeight: '100vh',
        fontFamily: designSystem.typography.fontFamily.primary
      }}>
        {/* Project-Specific Sidebar */}
        <div
          style={{
            width: isSidebarCollapsed ? '64px' : '240px',
            backgroundColor: projectBranding?.colorTheme?.primary || '#667eea',
            color: 'white',
            position: 'fixed',
            height: '100vh',
            overflowY: 'auto',
            transition: 'width 0.3s ease',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <MdMenu size={20} />
            </button>
            
            {!isSidebarCollapsed && (
              <>
                {projectBranding?.logo && (
                  <img 
                    src={projectBranding.logo} 
                    alt="Project Logo" 
                    style={{ 
                      width: '32px', 
                      height: '32px', 
                      objectFit: 'contain',
                      borderRadius: '4px'
                    }} 
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontWeight: '600', 
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {projectBranding?.name || 'Project Portal'}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    opacity: 0.8,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {projectBranding?.code}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Navigation Menu */}
          <div style={{ flex: 1, padding: '16px 0' }}>
            {menuItems.map((item, index) => (
              <Link
                key={index}
                to={item.path || '#'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: isSidebarCollapsed ? '12px' : '12px 16px',
                  textDecoration: 'none',
                  color: location.pathname === item.path ? 'white' : 'rgba(255,255,255,0.8)',
                  backgroundColor: location.pathname === item.path ? 'rgba(255,255,255,0.1)' : 'transparent',
                  borderRight: location.pathname === item.path ? '3px solid white' : 'none',
                  gap: '12px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (location.pathname !== item.path) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (location.pathname !== item.path) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div style={{ 
                  fontSize: '18px', 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
                  minWidth: '18px'
                }}>
                  {item.icon}
                </div>
                {!isSidebarCollapsed && (
                  <span style={{ 
                    fontSize: '14px',
                    fontWeight: '500'
                  }}>
                    {item.label}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {/* User Info & Logout */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.1)',
            padding: '16px'
          }}>
            {!isSidebarCollapsed && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ 
                  fontSize: '12px', 
                  opacity: 0.8,
                  marginBottom: '2px'
                }}>
                  {userRole}
                </div>
                <div style={{ 
                  fontSize: '14px',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {userName}
                </div>
              </div>
            )}
            
            <button
              onClick={handleLogout}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '14px',
                width: '100%',
                justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
              }}
            >
              <MdLogout size={16} />
              {!isSidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div style={{
          marginLeft: isSidebarCollapsed ? '64px' : '240px',
          flex: 1,
          transition: 'margin-left 0.3s ease',
          backgroundColor: '#f8fafc',
          minHeight: '100vh'
        }}>
          {/* Project Portal Content */}
          <div style={{ 
            padding: '24px',
            maxWidth: '1200px',
            margin: '0 auto'
          }}>
            {children}
          </div>
        </div>
      </div>
    </PermissionProvider>
  );
};

export default ProjectLayout;