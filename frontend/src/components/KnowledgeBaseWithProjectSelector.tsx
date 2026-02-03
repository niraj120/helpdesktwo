import React, { useState, useEffect } from 'react';
import { useProjectContext } from '../contexts/ProjectContext';
import { useKnowledgeBase } from '../hooks/useProjectData';
import { ProjectBadge } from './ProjectBadge';
import { 
  MdSearch, 
  MdBook, 
  MdFolder,
  MdStar,
  MdArrowBack
} from 'react-icons/md';

/**
 * KnowledgeBaseWithProjectSelector Component
 * 
 * Handles Knowledge Base in both Single and Unified modes:
 * - Single Mode: Shows KB for current project only
 * - Unified Mode: Shows project selector, then KB for selected project
 * 
 * KB is always project-specific (recommended approach)
 */

interface Article {
  _id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  featured: boolean;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export const KnowledgeBaseWithProjectSelector: React.FC = () => {
  const { viewMode, currentProjectId, userProjects, switchProject } = useProjectContext();
  const [selectedProjectForKB, setSelectedProjectForKB] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);

  // In single mode, use currentProjectId
  // In unified mode, use selectedProjectForKB
  const projectIdForFetch = viewMode === 'single' ? currentProjectId : selectedProjectForKB;

  const { data, loading, error, refetch } = useKnowledgeBase({
    search: searchQuery,
    category: selectedCategory,
    featured: showFeaturedOnly
  });

  const articles = data?.articles || [];
  const categories = data?.categories || [];

  // Reset KB project selection when switching between modes
  useEffect(() => {
    if (viewMode === 'single') {
      setSelectedProjectForKB(null);
    }
  }, [viewMode]);

  // Single Mode - Show KB directly
  if (viewMode === 'single') {
    if (!currentProjectId) {
      return (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <p style={{ color: '#6b7280' }}>Please select a project to view its Knowledge Base</p>
        </div>
      );
    }

    return (
      <div style={{ padding: '24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <MdBook size={28} />
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
              Knowledge Base
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ProjectBadge projectId={currentProjectId} variant="full" size="small" />
          </div>
        </div>

        {/* Search and Filters */}
        <div style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <MdSearch 
              size={20} 
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search articles..."
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            >
              <option value="">All Categories</option>
              {categories.map((cat: string) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <button
              onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                backgroundColor: showFeaturedOnly ? '#667eea' : '#fff',
                color: showFeaturedOnly ? '#fff' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <MdStar size={16} />
              Featured Only
            </button>
          </div>
        </div>

        {/* Articles List */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            Loading articles...
          </div>
        )}

        {error && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '20px',
            color: '#dc2626'
          }}>
            Error loading articles: {error}
          </div>
        )}

        {!loading && !error && articles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            No articles found
          </div>
        )}

        {!loading && !error && articles.length > 0 && (
          <div style={{ display: 'grid', gap: '16px' }}>
            {articles.map((article: Article) => (
              <div
                key={article._id}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = '#667eea';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      {article.featured && (
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          backgroundColor: '#fef3c7',
                          color: '#f59e0b',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          <MdStar size={12} />
                          Featured
                        </span>
                      )}
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: '#e0e7ff',
                        color: '#667eea',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        {article.category}
                      </span>
                    </div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600' }}>
                      {article.title}
                    </h3>
                    <p style={{ 
                      margin: 0, 
                      color: '#6b7280', 
                      fontSize: '14px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {article.content}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {article.tags?.map((tag: string) => (
                    <span
                      key={tag}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: '#f3f4f6',
                        color: '#6b7280',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Unified Mode - Show project selector first
  if (viewMode === 'unified') {
    // No project selected yet - show selector
    if (!selectedProjectForKB) {
      return (
        <div style={{ padding: '24px' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <MdBook size={48} color="#667eea" style={{ marginBottom: '16px' }} />
              <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: '600' }}>
                Knowledge Base
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                Select a project to view its Knowledge Base articles
              </p>
            </div>

            <div style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>
                Choose a Project
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {userProjects.map(project => (
                  <button
                    key={project._id}
                    onClick={() => setSelectedProjectForKB(project._id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px',
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#667eea';
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.backgroundColor = '#fff';
                    }}
                  >
                    <ProjectBadge 
                      projectId={project._id} 
                      variant="initials"
                      size="medium"
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                        {project.name}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>
                        {project.code}
                      </div>
                    </div>
                    <div style={{ color: '#667eea' }}>→</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Project selected - show KB with back button
    const selectedProject = userProjects.find(p => p._id === selectedProjectForKB);

    return (
      <div style={{ padding: '24px' }}>
        {/* Header with Back Button */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setSelectedProjectForKB(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              marginBottom: '16px'
            }}
          >
            <MdArrowBack size={18} />
            Back to Projects
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <MdBook size={28} />
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
              Knowledge Base
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ProjectBadge projectId={selectedProjectForKB} variant="full" size="small" />
          </div>
        </div>

        {/* Same KB content as single mode (reuse the code) */}
        <div style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <MdSearch 
              size={20} 
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search articles..."
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            >
              <option value="">All Categories</option>
              {categories.map((cat: string) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <button
              onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                backgroundColor: showFeaturedOnly ? '#667eea' : '#fff',
                color: showFeaturedOnly ? '#fff' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <MdStar size={16} />
              Featured Only
            </button>
          </div>
        </div>

        {/* Articles List */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            Loading articles...
          </div>
        )}

        {error && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '20px',
            color: '#dc2626'
          }}>
            Error loading articles: {error}
          </div>
        )}

        {!loading && !error && articles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            No articles found for {selectedProject?.name}
          </div>
        )}

        {!loading && !error && articles.length > 0 && (
          <div style={{ display: 'grid', gap: '16px' }}>
            {articles.map((article: Article) => (
              <div
                key={article._id}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = '#667eea';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      {article.featured && (
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          backgroundColor: '#fef3c7',
                          color: '#f59e0b',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          <MdStar size={12} />
                          Featured
                        </span>
                      )}
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: '#e0e7ff',
                        color: '#667eea',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        {article.category}
                      </span>
                    </div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600' }}>
                      {article.title}
                    </h3>
                    <p style={{ 
                      margin: 0, 
                      color: '#6b7280', 
                      fontSize: '14px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {article.content}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {article.tags?.map((tag: string) => (
                    <span
                      key={tag}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: '#f3f4f6',
                        color: '#6b7280',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default KnowledgeBaseWithProjectSelector;
