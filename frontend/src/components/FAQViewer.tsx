import React, { useState, useEffect } from 'react';
import { MdSearch, MdExpandMore, MdExpandLess, MdThumbUp, MdThumbDown } from 'react-icons/md';
import { API_CONFIG } from '../config/constants';

interface FAQ {
  _id: string;
  projectId: string;
  question: string;
  answer: string;
  category?: string;
  tags?: string[];
  status: 'active' | 'inactive';
  displayOrder: number;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
}

const FAQViewer: React.FC = () => {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  // Get project context from localStorage
  const projectContext = localStorage.getItem('projectContext');
  const projectId = projectContext ? JSON.parse(projectContext).projectId : null;

  useEffect(() => {
    if (projectId) {
      fetchFAQs();
    }
  }, [projectId]);

  const fetchFAQs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${API_CONFIG.API_URL}/faq/project/${projectId}?status=active`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        }
      );
      const data = await response.json();
      if (data.success) {
        setFaqs(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching FAQs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFAQClick = async (faqId: string) => {
    if (expandedFAQ === faqId) {
      setExpandedFAQ(null);
    } else {
      setExpandedFAQ(faqId);
      
      // Increment view count
      try {
        const token = localStorage.getItem('authToken');
        await fetch(`${API_CONFIG.API_URL}/faq/${faqId}/view`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        });
      } catch (error) {
        console.error('Error incrementing view count:', error);
      }
    }
  };

  const handleFeedback = async (faqId: string, isHelpful: boolean) => {
    try {
      const token = localStorage.getItem('authToken');
      await fetch(`${API_CONFIG.API_URL}/faq/${faqId}/feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isHelpful }),
        credentials: 'include',
      });
      
      // Update local state
      setFaqs(prev => prev.map(faq => {
        if (faq._id === faqId) {
          return {
            ...faq,
            helpfulCount: isHelpful ? faq.helpfulCount + 1 : faq.helpfulCount,
            notHelpfulCount: !isHelpful ? faq.notHelpfulCount + 1 : faq.notHelpfulCount,
          };
        }
        return faq;
      }));
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const categories = ['all', ...new Set(faqs.map(f => f.category).filter(Boolean))];
  
  const filteredFAQs = faqs.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
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
      maxWidth: '900px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        marginBottom: '32px',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: '700',
          color: 'var(--text-primary)',
          marginBottom: '12px'
        }}>
          Frequently Asked Questions
        </h1>
        <p style={{
          fontSize: '16px',
          color: 'var(--text-secondary)'
        }}>
          Find answers to common questions
        </p>
      </div>

      {/* Search and Filter */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '32px',
        flexWrap: 'wrap'
      }}>
        <div style={{
          flex: '1',
          minWidth: '250px',
          position: 'relative'
        }}>
          <MdSearch style={{
            position: 'absolute',
            left: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '22px',
            color: 'var(--text-secondary)'
          }} />
          <input
            type="text"
            placeholder="Search FAQs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '14px 16px 14px 48px',
              border: '2px solid var(--border-subtle)',
              borderRadius: '12px',
              fontSize: '15px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--primary-main)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{
            padding: '14px 16px',
            border: '2px solid var(--border-subtle)',
            borderRadius: '12px',
            fontSize: '15px',
            outline: 'none',
            minWidth: '180px',
            cursor: 'pointer',
          }}
        >
          {categories.map(category => (
            <option key={category} value={category}>
              {category === 'all' ? 'All Categories' : category}
            </option>
          ))}
        </select>
      </div>

      {/* FAQ List */}
      {filteredFAQs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-secondary)'
        }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>No FAQs found</p>
          <p style={{ fontSize: '14px' }}>Try adjusting your search or filter</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredFAQs.map(faq => {
            const isExpanded = expandedFAQ === faq._id;
            
            return (
              <div
                key={faq._id}
                style={{
                  background: 'white',
                  border: '2px solid var(--border-subtle)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  transition: 'all 0.3s',
                  boxShadow: isExpanded ? '0 8px 24px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.05)',
                }}
              >
                {/* Question Header */}
                <div
                  onClick={() => handleFAQClick(faq._id)}
                  style={{
                    padding: '20px 24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    background: isExpanded ? 'var(--primary-light)' : 'white',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) e.currentTarget.style.background = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) e.currentTarget.style.background = 'white';
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                      marginBottom: faq.category ? '8px' : '0',
                    }}>
                      {faq.question}
                    </div>
                    {faq.category && (
                      <span style={{
                        fontSize: '12px',
                        color: 'var(--primary-main)',
                        fontWeight: '500',
                        padding: '4px 10px',
                        background: 'var(--primary-light)',
                        borderRadius: '12px',
                      }}>
                        {faq.category}
                      </span>
                    )}
                  </div>
                  {isExpanded ? (
                    <MdExpandLess size={28} color="var(--primary-main)" />
                  ) : (
                    <MdExpandMore size={28} color="var(--text-secondary)" />
                  )}
                </div>

                {/* Answer Content */}
                {isExpanded && (
                  <div style={{
                    padding: '24px',
                    borderTop: '1px solid var(--border-subtle)',
                    animation: 'fadeIn 0.3s ease-in',
                  }}>
                    <div style={{
                      fontSize: '15px',
                      lineHeight: '1.7',
                      color: 'var(--text-primary)',
                      marginBottom: '24px',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {faq.answer}
                    </div>

                    {/* Feedback Section */}
                    <div style={{
                      marginTop: '24px',
                      paddingTop: '20px',
                      borderTop: '1px solid var(--border-subtle)',
                    }}>
                      <p style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: 'var(--text-secondary)',
                        marginBottom: '12px'
                      }}>
                        Was this answer helpful?
                      </p>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          onClick={() => handleFeedback(faq._id, true)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
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
                          <MdThumbUp /> Yes ({faq.helpfulCount})
                        </button>
                        <button
                          onClick={() => handleFeedback(faq._id, false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            background: 'white',
                            border: '2px solid #6b7280',
                            color: '#6b7280',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#6b7280';
                            e.currentTarget.style.color = 'white';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'white';
                            e.currentTarget.style.color = '#6b7280';
                          }}
                        >
                          <MdThumbDown /> No ({faq.notHelpfulCount})
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FAQViewer;
