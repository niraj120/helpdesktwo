import React, { useState, useEffect } from 'react';
import { MdSearch, MdExpandMore, MdExpandLess, MdThumbUp, MdThumbDown, MdQuestionAnswer, MdCategory, MdHelpOutline } from 'react-icons/md';
import { useLocation } from 'react-router-dom';
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
  const [projectId, setProjectId] = useState<string | null>(null);
  
  const location = useLocation();

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
      
      // 2. Try from URL path (for students: /mhcet/student/faq)
      const pathParts = location.pathname.split('/');
      const customUrlPath = pathParts[1];
      
      if (customUrlPath && customUrlPath !== 'faq') {
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      {/* Hero Header */}
      <div className="relative mb-8 sm:mb-12 text-center">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-orange-500/10 rounded-3xl transform -skew-y-1" />
        <div className="relative py-8 sm:py-12 px-4">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg mb-4 sm:mb-6">
            <MdQuestionAnswer className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 bg-clip-text text-transparent mb-2 sm:mb-3">
            Frequently Asked Questions
          </h1>
          <p className="text-gray-500 text-sm sm:text-base md:text-lg max-w-md mx-auto">
            Find quick answers to common questions. Can't find what you're looking for? Contact our support team.
          </p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="flex-1 relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <MdSearch className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <input
            type="text"
            placeholder="Search FAQs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 sm:pl-14 pr-4 py-3 sm:py-4 bg-white border-2 border-gray-200 rounded-xl sm:rounded-2xl text-sm sm:text-base focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all shadow-sm hover:shadow-md"
          />
        </div>

        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <MdCategory className="w-5 h-5" />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full sm:w-auto pl-11 pr-10 py-3 sm:py-4 bg-white border-2 border-gray-200 rounded-xl sm:rounded-2xl text-sm sm:text-base focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all shadow-sm hover:shadow-md cursor-pointer appearance-none min-w-[180px]"
          >
            {categories.map(category => (
              <option key={category} value={category}>
                {category === 'all' ? 'All Categories' : category}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <MdExpandMore className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Results count */}
      {searchTerm && (
        <p className="text-sm text-gray-500 mb-4">
          Found {filteredFAQs.length} result{filteredFAQs.length !== 1 ? 's' : ''} for "{searchTerm}"
        </p>
      )}

      {/* FAQ List */}
      {filteredFAQs.length === 0 ? (
        <div className="text-center py-12 sm:py-16 bg-gray-50 rounded-2xl sm:rounded-3xl border-2 border-dashed border-gray-200">
          <MdHelpOutline className="w-16 h-16 sm:w-20 sm:h-20 text-gray-300 mx-auto mb-4" />
          <p className="text-lg sm:text-xl font-semibold text-gray-600 mb-2">No FAQs found</p>
          <p className="text-sm sm:text-base text-gray-400">Try adjusting your search or filter criteria</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {filteredFAQs.map((faq, index) => {
            const isExpanded = expandedFAQ === faq._id;
            
            return (
              <div
                key={faq._id}
                className={`group bg-white rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 ${
                  isExpanded 
                    ? 'shadow-xl ring-2 ring-purple-500/20' 
                    : 'shadow-sm hover:shadow-lg border border-gray-100 hover:border-purple-200'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Question Header */}
                <div
                  onClick={() => handleFAQClick(faq._id)}
                  className={`p-4 sm:p-6 cursor-pointer flex items-start gap-3 sm:gap-4 transition-all ${
                    isExpanded 
                      ? 'bg-gradient-to-r from-purple-50 to-pink-50' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Question Number */}
                  <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center text-sm sm:text-base font-bold transition-all ${
                    isExpanded
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                      : 'bg-gray-100 text-gray-500 group-hover:bg-purple-100 group-hover:text-purple-600'
                  }`}>
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-base sm:text-lg font-semibold leading-snug transition-colors ${
                      isExpanded ? 'text-purple-700' : 'text-gray-800 group-hover:text-purple-600'
                    }`}>
                      {faq.question}
                    </h3>
                    {faq.category && (
                      <span className={`inline-flex items-center mt-2 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        isExpanded
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {faq.category}
                      </span>
                    )}
                  </div>
                  
                  <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${
                    isExpanded
                      ? 'bg-purple-500 text-white rotate-180'
                      : 'bg-gray-100 text-gray-500 group-hover:bg-purple-100 group-hover:text-purple-600'
                  }`}>
                    <MdExpandMore className="w-5 h-5 sm:w-6 sm:h-6 transition-transform" />
                  </div>
                </div>

                {/* Answer Content */}
                <div className={`overflow-hidden transition-all duration-300 ${
                  isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  <div className="p-4 sm:p-6 pt-0 sm:pt-0 pl-14 sm:pl-20 border-t border-gray-100">
                    <div className="prose prose-sm sm:prose max-w-none text-gray-600 leading-relaxed whitespace-pre-wrap">
                      {faq.answer}
                    </div>

                    {/* Feedback Section */}
                    <div className="mt-6 pt-5 border-t border-gray-100">
                      <p className="text-sm font-medium text-gray-500 mb-3">
                        Was this answer helpful?
                      </p>
                      <div className="flex flex-wrap gap-2 sm:gap-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleFeedback(faq._id, true); }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white border-2 border-green-500 text-green-600 rounded-lg sm:rounded-xl text-sm font-medium hover:bg-green-500 hover:text-white transition-all shadow-sm hover:shadow-md"
                        >
                          <MdThumbUp className="w-4 h-4" />
                          <span>Yes</span>
                          <span className="text-xs opacity-70">({faq.helpfulCount})</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleFeedback(faq._id, false); }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-300 text-gray-600 rounded-lg sm:rounded-xl text-sm font-medium hover:bg-gray-500 hover:border-gray-500 hover:text-white transition-all shadow-sm hover:shadow-md"
                        >
                          <MdThumbDown className="w-4 h-4" />
                          <span>No</span>
                          <span className="text-xs opacity-70">({faq.notHelpfulCount})</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Stats Footer */}
      {faqs.length > 0 && (
        <div className="mt-8 sm:mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-sm text-gray-500">
            <MdQuestionAnswer className="w-4 h-4" />
            <span>{faqs.length} FAQ{faqs.length !== 1 ? 's' : ''} available</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FAQViewer;
