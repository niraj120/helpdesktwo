import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MdSettings, MdArrowForward } from 'react-icons/md';
import { API_CONFIG } from '../config/constants';

interface Project {
  _id: string;
  name: string;
  code: string;
  description?: string;
  branding?: {
    logo?: string;
    customUrlPath?: string;
  };
}

const TicketConfigurationPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        console.error('No auth token found');
        navigate('/login');
        return;
      }

      const response = await fetch(`${API_CONFIG.API_URL}/projects?limit=100`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error('Unauthorized - redirecting to login');
          localStorage.removeItem('authToken');
          navigate('/login');
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Projects data:', data);
      
      // Handle different response structures
      let projectsList = [];
      // Check for nested structure: data.data.projects (current API response)
      if (data.data && Array.isArray(data.data.projects)) {
        projectsList = data.data.projects;
      } else if (Array.isArray(data.projects)) {
        projectsList = data.projects;
      } else if (Array.isArray(data.data)) {
        projectsList = data.data;
      } else if (Array.isArray(data)) {
        projectsList = data;
      }
      
      console.log('Projects list:', projectsList);
      setProjects(projectsList);
    } catch (error) {
      console.error('Error fetching projects:', error);
      alert('Failed to load projects. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConfigureProject = (projectId: string) => {
    navigate(`/ticket-config/settings/${projectId}`);
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: '600', 
            color: 'var(--text-primary)',
            marginBottom: '8px' 
          }}>
            Query Configuration
          </h1>
          <p style={{ 
            fontSize: '14px', 
            color: 'var(--text-secondary)' 
          }}>
            Select a project to configure its ticket settings
          </p>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: '24px' }}>
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '12px 16px',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
            {searchTerm ? 'No projects found matching your search' : 'No projects available'}
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
            gap: '20px' 
          }}>
            {filteredProjects.map((project) => (
              <div
                key={project._id}
                style={{
                  background: 'white',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '24px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
                onClick={() => handleConfigureProject(project._id)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                  {project.branding?.logo ? (
                    <img 
                      src={project.branding.logo} 
                      alt={project.name}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        objectFit: 'contain',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        background: 'var(--primary-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MdSettings style={{ fontSize: '24px', color: 'var(--primary-main)' }} />
                    </div>
                  )}
                  
                  <div style={{ flex: 1 }}>
                    <h3 style={{ 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: 'var(--text-primary)',
                      marginBottom: '4px' 
                    }}>
                      {project.name}
                    </h3>
                    <p style={{ 
                      fontSize: '13px', 
                      color: 'var(--text-secondary)',
                      fontWeight: '500'
                    }}>
                      {project.code}
                    </p>
                  </div>
                </div>

                {project.description && (
                  <p style={{ 
                    fontSize: '14px', 
                    color: 'var(--text-secondary)',
                    marginBottom: '16px',
                    lineHeight: '1.5'
                  }}>
                    {project.description.length > 100 
                      ? `${project.description.substring(0, 100)}...` 
                      : project.description}
                  </p>
                )}

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ 
                    fontSize: '14px', 
                    color: 'var(--primary-main)',
                    fontWeight: '500'
                  }}>
                    Configure Tickets
                  </span>
                  <MdArrowForward style={{ 
                    fontSize: '20px', 
                    color: 'var(--primary-main)' 
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TicketConfigurationPage;
