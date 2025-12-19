import React, { useState, useEffect } from 'react';
import { MdSearch, MdVisibility, MdThumbUp, MdThumbDown, MdAdd } from 'react-icons/md';
import { useNavigate, useLocation } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { API_CONFIG } from '../config/constants';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../constants/permissions';

interface KBArticle {
  _id: string;
  projectId: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  status: 'draft' | 'published' | 'archived';
  displayOrder: number;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  author: { name: string; email: string };
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const KnowledgeBaseViewer: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedArticle, setSelectedArticle] = useState<KBArticle | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  
  const location = useLocation();
  
  // Check if user has create permission
  const canCreate = hasPermission(PERMISSIONS.KB_CREATE);

  // Get projectId from multiple sources
  useEffect(() => {
    const getProjectId = async () => {
      // 1. Try from projectContext (for agents)
      const projectContext = localStorage.getItem('projectContext');
      if (projectContext) {
        const parsed = JSON.parse(projectContext);
        setProjectId(parsed.projectId);
        return;
      }
      
      // 2. Try from URL path (for students: /mhcet/kb)
      const pathParts = location.pathname.split('/');
      const customUrlPath = pathParts[1];
      
      if (customUrlPath && customUrlPath !== 'kb') {
        try {
          const response = await fetch(`${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`);
          const data = await response.json();
          if (data.success && data.data.projectId) {
            setProjectId(data.data.projectId);
          }
        } catch (error) {
          console.error('Error fetching project from URL:', error);
        }
      }
    };
    
    getProjectId();
  }, [location.pathname]);

  useEffect(() => {
    if (projectId) {
      fetchArticles();
    }
  }, [projectId]);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${API_CONFIG.API_URL}/kb/project/${projectId}?status=published`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        }
      );
      const data = await response.json();
      if (data.success) {
        setArticles(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleArticleClick = async (article: KBArticle) => {
    setSelectedArticle(article);
    
    // Increment view count
    try {
      const token = localStorage.getItem('authToken');
      await fetch(`${API_CONFIG.API_URL}/kb/${article._id}/view`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });
    } catch (error) {
      console.error('Error incrementing view count:', error);
    }
  };

  const handleFeedback = async (articleId: string, isHelpful: boolean) => {
    try {
      const token = localStorage.getItem('authToken');
      await fetch(`${API_CONFIG.API_URL}/kb/${articleId}/feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isHelpful }),
        credentials: 'include',
      });
      
      // Update local state
      setArticles(prev => prev.map(article => {
        if (article._id === articleId) {
          return {
            ...article,
            helpfulCount: isHelpful ? article.helpfulCount + 1 : article.helpfulCount,
            notHelpfulCount: !isHelpful ? article.notHelpfulCount + 1 : article.notHelpfulCount,
          };
        }
        return article;
      }));
      
      if (selectedArticle && selectedArticle._id === articleId) {
        setSelectedArticle(prev => prev ? {
          ...prev,
          helpfulCount: isHelpful ? prev.helpfulCount + 1 : prev.helpfulCount,
          notHelpfulCount: !isHelpful ? prev.notHelpfulCount + 1 : prev.notHelpfulCount,
        } : null);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const categories = ['all', ...new Set(articles.map(a => a.category).filter(Boolean))];
  
  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         article.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '400px',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e5e7eb',
          borderTopColor: 'var(--primary-main)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '24px',
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      <div style={{
        marginBottom: '32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '8px'
          }}>
            Knowledge Base
          </h1>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-secondary)'
          }}>
            Browse articles and find answers to common questions
          </p>
        </div>
        
        {canCreate && (
          <button
            onClick={() => navigate('/knowledge-base')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'var(--primary-main)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--primary-dark)';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--primary-main)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            }}
          >
            <MdAdd size={20} /> Create Article
          </button>
        )}
      </div>

      {/* Search and Filter */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{
          flex: '1',
          minWidth: '250px',
          position: 'relative'
        }}>
          <MdSearch style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '20px',
            color: 'var(--text-secondary)'
          }} />
          <input
            type="text"
            placeholder="Search articles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{
            padding: '10px 12px',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            minWidth: '150px'
          }}
        >
          {categories.map(category => (
            <option key={category} value={category}>
              {category === 'all' ? 'All Categories' : category}
            </option>
          ))}
        </select>
      </div>

      {/* Articles Grid/List */}
      {!selectedArticle ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          {filteredArticles.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '40px',
              color: 'var(--text-secondary)'
            }}>
              No articles found
            </div>
          ) : (
            filteredArticles.map(article => (
              <div
                key={article._id}
                onClick={() => handleArticleClick(article)}
                style={{
                  padding: '20px',
                  background: 'white',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                }}
              >
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  marginBottom: '8px'
                }}>
                  {article.title}
                </h3>
                
                {article.category && (
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    background: 'var(--primary-light)',
                    color: 'var(--primary-main)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    marginBottom: '12px'
                  }}>
                    {article.category}
                  </span>
                )}

                <div style={{
                  display: 'flex',
                  gap: '16px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  marginTop: '12px'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MdVisibility /> {article.viewCount}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MdThumbUp /> {article.helpfulCount}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // Article Detail View
        <div>
          <button
            onClick={() => setSelectedArticle(null)}
            style={{
              padding: '8px 16px',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              marginBottom: '20px'
            }}
          >
            ← Back to Articles
          </button>

          <div style={{
            background: 'white',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h1 style={{
              fontSize: '32px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: '16px'
            }}>
              {selectedArticle.title}
            </h1>

            {selectedArticle.category && (
              <span style={{
                display: 'inline-block',
                padding: '6px 16px',
                background: 'var(--primary-light)',
                color: 'var(--primary-main)',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: '500',
                marginBottom: '16px'
              }}>
                {selectedArticle.category}
              </span>
            )}

            <div style={{
              display: 'flex',
              gap: '24px',
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginBottom: '24px',
              paddingBottom: '24px',
              borderBottom: '1px solid var(--border-subtle)'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MdVisibility /> {selectedArticle.viewCount} views
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MdThumbUp /> {selectedArticle.helpfulCount} helpful
              </span>
            </div>

            <div 
              style={{
                fontSize: '16px',
                lineHeight: '1.7',
                color: 'var(--text-primary)',
                marginBottom: '32px'
              }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedArticle.content) }}
            />

            {/* Feedback Section */}
            <div style={{
              marginTop: '32px',
              paddingTop: '32px',
              borderTop: '1px solid var(--border-subtle)'
            }}>
              <p style={{
                fontSize: '16px',
                fontWeight: '500',
                color: 'var(--text-primary)',
                marginBottom: '12px'
              }}>
                Was this article helpful?
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => handleFeedback(selectedArticle._id, true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    background: 'white',
                    border: '2px solid var(--primary-main)',
                    color: 'var(--primary-main)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--primary-main)';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.color = 'var(--primary-main)';
                  }}
                >
                  <MdThumbUp /> Yes
                </button>
                <button
                  onClick={() => handleFeedback(selectedArticle._id, false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    background: 'white',
                    border: '2px solid var(--text-secondary)',
                    color: 'var(--text-secondary)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--text-secondary)';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  <MdThumbDown /> No
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseViewer;
