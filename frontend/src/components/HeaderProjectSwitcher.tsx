import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  MdBusiness, 
  MdExpandMore, 
  MdStar, 
  MdStarBorder, 
  MdHistory,
  MdSearch,
  MdViewModule,
  MdClose
} from 'react-icons/md';
import { useProjectContext } from '../contexts/ProjectContext';

interface Project {
  _id: string;
  name: string;
  code: string;
  branding?: {
    logo?: string;
    colorTheme?: {
      primary?: string;
    };
    customUrlPath?: string;
  };
  status: string;
}

export const HeaderProjectSwitcher: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentProjectId,
    viewMode,
    userProjects,
    recentProjects,
    favoriteProjects,
    toggleFavorite,
    switchProject,
    setViewMode,
    getCurrentProject
  } = useProjectContext();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  console.log('🎨 HeaderProjectSwitcher: userProjects from context:', userProjects);
  console.log('🎨 HeaderProjectSwitcher: userProjects.length:', userProjects.length);

  // Get current project and user role
  const currentProject = getCurrentProject();
  const userRoleName = localStorage.getItem('userRoleName') || localStorage.getItem('userRole') || 'User';
  
  console.log('🎨 HeaderProjectSwitcher: currentProject:', currentProject);
  console.log('🎨 HeaderProjectSwitcher: userRoleName:', userRoleName);

  // Helper for translations
  const getText = (en: string, hi: string, mr: string): string => {
    if (i18n.language === 'hi') return hi;
    if (i18n.language === 'mr') return mr;
    return en;
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Filter projects by search
  const filteredProjects = userProjects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Organize projects into sections
  const favoriteProjectsList = filteredProjects.filter(p => favoriteProjects.includes(p._id));
  const recentProjectsList = filteredProjects.filter(p => 
    recentProjects.includes(p._id) && !favoriteProjects.includes(p._id)
  );
  const otherProjectsList = filteredProjects.filter(p => 
    !favoriteProjects.includes(p._id) && !recentProjects.includes(p._id)
  );

  const handleProjectSelect = async (projectId: string) => {
    const project = userProjects.find(p => p._id === projectId);
    if (!project) return;

    setIsOpen(false);
    setSearchQuery('');

    // Use the enhanced switchProject with reload option
    const currentPath = location.pathname;
    const isInPortal = currentPath.includes('/portal/');
    
    await switchProject(projectId, {
      reload: true,
      navigate: true,
      preserveRoute: isInPortal // Preserve current route if already in portal
    });
  };

  const handleUnifiedView = () => {
    setViewMode('unified');
    setIsOpen(false);
    setSearchQuery('');
    navigate('/dashboard');
  };

  // Don't render if user is Super Admin - they have access to all projects
  const userRoleFromStorage = localStorage.getItem('userRoleName') || localStorage.getItem('userRole') || '';
  if (userRoleFromStorage === 'Super Admin' || userRoleFromStorage === 'SUPER_ADMIN') {
    console.log('🚫 HeaderProjectSwitcher: Super Admin detected - hiding project switcher');
    return null;
  }

  // Don't render if user has no projects assigned
  if (userProjects.length === 0) {
    console.log('🚫 HeaderProjectSwitcher: No projects assigned - hiding project switcher');
    return null;
  }
  
  // Note: We still show the switcher even with 1 project to allow viewing "All Projects" mode

  // Render project item
  const renderProjectItem = (project: Project, showStar: boolean = true) => {
    const isFavorite = favoriteProjects.includes(project._id);
    const isRecent = recentProjects.includes(project._id);
    const isCurrent = currentProjectId === project._id;
    const primaryColor = project.branding?.colorTheme?.primary || '#667eea';

    return (
      <div
        key={project._id}
        onClick={() => handleProjectSelect(project._id)}
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer',
          borderRadius: '8px',
          backgroundColor: isCurrent ? '#f3f4f6' : 'transparent',
          position: 'relative',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => {
          if (!isCurrent) e.currentTarget.style.backgroundColor = '#f9fafb';
        }}
        onMouseLeave={(e) => {
          if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {/* Project Logo/Icon */}
        {project.branding?.logo ? (
          <img
            src={project.branding.logo}
            alt={project.name}
            loading="lazy"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              objectFit: 'contain',
              flexShrink: 0
            }}
          />
        ) : (
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '16px',
              fontWeight: '700',
              flexShrink: 0
            }}
          >
            {project.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Project Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {project.name}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>{project.code}</span>
            {isRecent && !isFavorite && (
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '8px',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                fontWeight: '600'
              }}>
                {getText('Recent', 'हाल का', 'अलीकडील')}
              </span>
            )}
          </div>
        </div>

        {/* Favorite Star */}
        {showStar && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(project._id);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: isFavorite ? '#fbbf24' : '#d1d5db',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center'
            }}
            title={isFavorite 
              ? getText('Remove from favorites', 'पसंदीदा से हटाएं', 'आवडीतून काढा')
              : getText('Add to favorites', 'पसंदीदा में जोड़ें', 'आवडीमध्ये जोडा')
            }
          >
            {isFavorite ? <MdStar /> : <MdStarBorder />}
          </button>
        )}

        {/* Current indicator */}
        {isCurrent && (
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: primaryColor,
              flexShrink: 0
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          color: '#1f2937',
          transition: 'all 0.2s',
          outline: 'none'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#d1d5db';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#e5e7eb';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Current Project Icon */}
        {viewMode === 'unified' ? (
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            <MdViewModule size={18} />
          </div>
        ) : currentProject?.branding?.logo ? (
          <img
            src={currentProject.branding.logo}
            alt={currentProject.name}
            loading="lazy"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              objectFit: 'contain'
            }}
          />
        ) : (
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: `linear-gradient(135deg, ${currentProject?.branding?.colorTheme?.primary || '#667eea'} 0%, ${currentProject?.branding?.colorTheme?.primary || '#667eea'}dd 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '14px',
            fontWeight: '700'
          }}>
            {currentProject?.name.charAt(0).toUpperCase() || 'P'}
          </div>
        )}

        {/* Project Name & Role */}
        <div style={{ textAlign: 'left' }}>
          <div style={{ 
            fontSize: '13px', 
            fontWeight: '600',
            maxWidth: '180px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {viewMode === 'unified' 
              ? getText('All Projects', 'सभी प्रकल्प', 'सर्व प्रकल्प')
              : currentProject?.name || getText('Select Project', 'प्रकल्प चुनें', 'प्रकल्प निवडा')
            }
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>
            {userRoleName}
          </div>
        </div>

        <MdExpandMore 
          size={20} 
          style={{ 
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
          }} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '380px',
            maxHeight: '600px',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#1f2937',
                margin: 0
              }}>
                {getText('Switch Project', 'प्रकल्प बदलें', 'प्रकल्प बदला')}
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#6b7280',
                  display: 'flex'
                }}
              >
                <MdClose size={20} />
              </button>
            </div>

            {/* Search Bar */}
            {userProjects.length > 3 && (
              <div style={{ position: 'relative' }}>
                <MdSearch
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af'
                  }}
                />
                <input
                  type="text"
                  placeholder={getText('Search projects...', 'प्रकल्प खोजें...', 'प्रकल्प शोधा...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
            )}
          </div>

          {/* Project List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px'
          }}>
            {/* Unified View Option */}
            {userProjects.length > 1 && (
              <>
                <div
                  onClick={handleUnifiedView}
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    border: '2px dashed #667eea',
                    marginBottom: '12px',
                    backgroundColor: viewMode === 'unified' ? '#f3f4f6' : 'transparent',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (viewMode !== 'unified') e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    if (viewMode !== 'unified') e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '20px'
                  }}>
                    <MdViewModule />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#667eea' }}>
                      {getText('View All Projects', 'सभी प्रकल्प देखें', 'सर्व प्रकल्प पहा')}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {getText('Unified dashboard', 'एकीकृत डैशबोर्ड', 'एकत्रित डॅशबोर्ड')}
                    </div>
                  </div>
                  {viewMode === 'unified' && (
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#667eea'
                    }} />
                  )}
                </div>
                <div style={{
                  height: '1px',
                  background: '#e5e7eb',
                  margin: '8px 0'
                }} />
              </>
            )}

            {/* Favorites Section */}
            {favoriteProjectsList.length > 0 && (
              <>
                <div style={{
                  padding: '8px 16px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <MdStar size={14} color="#fbbf24" />
                  {getText('Favorites', 'पसंदीदा', 'आवडीचे')}
                </div>
                {favoriteProjectsList.map(project => renderProjectItem(project))}
                <div style={{
                  height: '1px',
                  background: '#e5e7eb',
                  margin: '8px 0'
                }} />
              </>
            )}

            {/* Recent Section */}
            {recentProjectsList.length > 0 && (
              <>
                <div style={{
                  padding: '8px 16px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <MdHistory size={14} />
                  {getText('Recent', 'हाल का', 'अलीकडील')}
                </div>
                {recentProjectsList.map(project => renderProjectItem(project))}
                <div style={{
                  height: '1px',
                  background: '#e5e7eb',
                  margin: '8px 0'
                }} />
              </>
            )}

            {/* All Projects Section */}
            {otherProjectsList.length > 0 && (
              <>
                <div style={{
                  padding: '8px 16px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {getText('All Projects', 'सभी प्रकल्प', 'सर्व प्रकल्प')}
                </div>
                {otherProjectsList.map(project => renderProjectItem(project))}
              </>
            )}

            {/* No Results */}
            {filteredProjects.length === 0 && (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '13px'
              }}>
                {getText('No projects found', 'कोई प्रकल्प नहीं मिला', 'प्रकल्प सापडले नाहीत')}
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            fontSize: '12px',
            color: '#6b7280',
            textAlign: 'center'
          }}>
            {getText(
              `${userProjects.length} project${userProjects.length !== 1 ? 's' : ''} accessible`,
              `${userProjects.length} प्रकल्प उपलब्ध`,
              `${userProjects.length} प्रकल्प उपलब्ध`
            )}
          </div>
        </div>
      )}
    </div>
  );
};
