import React, { useState, useEffect } from 'react';
import { MdSearch, MdVisibility, MdThumbUp, MdThumbDown, MdAdd, MdShare, MdContentCopy, MdClose, MdCheck } from 'react-icons/md';
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
  const [customUrlPath, setCustomUrlPath] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState(false);
  
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
      const urlPath = pathParts[1];
      setCustomUrlPath(urlPath);
      
      if (urlPath && urlPath !== 'kb') {
        try {
          const response = await fetch(`${API_CONFIG.API_URL}/projects/branding/${urlPath}`);
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

  const copyPublicLink = (articleId: string) => {
    // Get the proper custom URL path for the project
    let urlPath = '';
    
    // Check if we're in a project portal context (e.g., /mhcet/portal/kb)
    const pathParts = window.location.pathname.split('/').filter(p => p);
    
    if (pathParts.length > 0 && pathParts[0] !== 'kb') {
      // Use the first path segment as the custom URL path
      urlPath = `/${pathParts[0]}`;
    } else if (customUrlPath && customUrlPath !== 'kb') {
      // Fallback to stored customUrlPath
      urlPath = `/${customUrlPath}`;
    }
    
    const publicUrl = `${window.location.origin}${urlPath}/submit-ticket?kbArticle=${articleId}`;
    
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }).catch(err => {
      console.error('Failed to copy link:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = publicUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
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
                  padding: '24px',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  border: '2px solid var(--border-subtle)',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                  e.currentTarget.style.borderColor = 'var(--primary-main)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }}
              >
                {/* Decorative corner accent */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '80px',
                  height: '80px',
                  background: 'linear-gradient(135deg, var(--primary-main) 0%, var(--primary-light) 100%)',
                  opacity: 0.1,
                  borderRadius: '0 16px 0 100%'
                }} />
                
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginBottom: '12px',
                  lineHeight: '1.4',
                  position: 'relative'
                }}>
                  {article.title}
                </h3>
                
                {article.category && (
                  <span style={{
                    display: 'inline-block',
                    padding: '6px 14px',
                    background: 'linear-gradient(135deg, var(--primary-main) 0%, var(--primary-dark) 100%)',
                    color: 'white',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                    marginBottom: '12px',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                  }}>
                    {article.category}
                  </span>
                )}

                <div style={{
                  display: 'flex',
                  gap: '20px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(0,0,0,0.05)'
                }}>
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    fontWeight: '500'
                  }}>
                    <MdVisibility size={18} style={{ color: 'var(--primary-main)' }} /> 
                    {article.viewCount}
                  </span>
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    fontWeight: '500'
                  }}>
                    <MdThumbUp size={18} style={{ color: '#10b981' }} /> 
                    {article.helpfulCount}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // Article Detail View
        <div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <button
              onClick={() => setSelectedArticle(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: 'white',
                border: '2px solid var(--border-subtle)',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-secondary)';
                e.currentTarget.style.borderColor = 'var(--primary-main)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              ← Back to Articles
            </button>

            <button
              onClick={() => copyPublicLink(selectedArticle._id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: copySuccess ? '#10b981' : 'var(--primary-main)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                if (!copySuccess) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }}
            >
              {copySuccess ? (
                <>
                  <MdCheck size={20} /> Link Copied!
                </>
              ) : (
                <>
                  <MdShare size={20} /> Share Public Link
                </>
              )}
            </button>
          </div>

          <div style={{
            background: 'white',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.1)'
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

            <style>{`
              .kb-article-content ol {
                list-style-type: decimal !important;
                padding-left: 2em !important;
                margin: 1em 0 !important;
                counter-reset: list-0;
              }
              .kb-article-content ul {
                list-style-type: disc !important;
                padding-left: 2em !important;
                margin: 1em 0 !important;
              }
              .kb-article-content ol > li,
              .kb-article-content ul > li {
                display: list-item !important;
                margin-bottom: 0.5em !important;
                line-height: 1.8 !important;
                list-style-position: outside !important;
              }
              .kb-article-content ol > li {
                list-style-type: decimal !important;
              }
              .kb-article-content ul > li {
                list-style-type: disc !important;
              }
              .kb-article-content li.ql-indent-1 { padding-left: 3em; }
              .kb-article-content li.ql-indent-2 { padding-left: 4.5em; }
              .kb-article-content li.ql-indent-3 { padding-left: 6em; }
              .kb-article-content li.ql-indent-4 { padding-left: 7.5em; }
              .kb-article-content li.ql-indent-5 { padding-left: 9em; }
              .kb-article-content h1 { font-size: 2em; font-weight: bold; margin: 1em 0 0.5em; }
              .kb-article-content h2 { font-size: 1.5em; font-weight: bold; margin: 0.83em 0 0.5em; }
              .kb-article-content h3 { font-size: 1.17em; font-weight: bold; margin: 1em 0 0.5em; }
              .kb-article-content h4 { font-size: 1em; font-weight: bold; margin: 1.33em 0 0.5em; }
              .kb-article-content h5 { font-size: 0.83em; font-weight: bold; margin: 1.67em 0 0.5em; }
              .kb-article-content h6 { font-size: 0.67em; font-weight: bold; margin: 2.33em 0 0.5em; }
              .kb-article-content strong { font-weight: 700; }
              .kb-article-content em { font-style: italic; }
              .kb-article-content u { text-decoration: underline; }
              .kb-article-content s { text-decoration: line-through; }
              .kb-article-content blockquote {
                border-left: 4px solid #ccc;
                padding-left: 16px;
                margin: 1em 0;
                color: #666;
              }
              .kb-article-content pre {
                background: #f4f4f4;
                padding: 12px;
                border-radius: 4px;
                overflow-x: auto;
              }
              .kb-article-content code {
                background: #f4f4f4;
                padding: 2px 6px;
                border-radius: 3px;
                font-family: monospace;
              }
              .kb-article-content a {
                color: #3b82f6;
                text-decoration: underline;
              }
              .kb-article-content img {
                max-width: 100%;
                height: auto;
                margin: 1em 0;
              }
            `}</style>

            <div 
              className="kb-article-content"
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
