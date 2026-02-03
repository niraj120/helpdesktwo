import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DOMPurify from 'dompurify';
import { API_CONFIG } from '../config/constants';
import {
  BookOpenIcon,
  ArrowLeftIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface KBArticle {
  _id: string;
  projectId: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  publishedAt?: string;
}

interface ProjectBranding {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
}

const KBArticleView: React.FC = () => {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const [article, setArticle] = useState<KBArticle | null>(null);
  const [project, setProject] = useState<ProjectBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  useEffect(() => {
    fetchArticle();
  }, [articleId]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/${articleId}`);
      
      if (response.data.success) {
        setArticle(response.data.data);
        
        // Fetch project branding for styling
        if (response.data.data.projectId) {
          try {
            const projectResponse = await axios.get(
              `${API_CONFIG.API_URL}/projects/${response.data.data.projectId}`
            );
            if (projectResponse.data.success) {
              const proj = projectResponse.data.data;
              setProject({
                name: proj.name,
                primaryColor: proj.primaryColor || '#3b82f6',
                secondaryColor: proj.secondaryColor || '#8b5cf6',
                logoUrl: proj.logoUrl || null,
              });
            }
          } catch (projErr) {
            console.error('Error fetching project:', projErr);
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching article:', err);
      setError(err.response?.data?.message || 'Article not found');
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (isHelpful: boolean) => {
    if (!article || feedbackSubmitted) return;

    try {
      await axios.post(`${API_CONFIG.API_URL}/kb/${article._id}/feedback`, {
        isHelpful,
      });
      
      setArticle({
        ...article,
        helpfulCount: article.helpfulCount + (isHelpful ? 1 : 0),
        notHelpfulCount: article.notHelpfulCount + (isHelpful ? 0 : 1),
      });
      
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error('Error submitting feedback:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading article...</p>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <BookOpenIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Article Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'The article you are looking for does not exist.'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const primaryColor = project?.primaryColor || '#3b82f6';
  const secondaryColor = project?.secondaryColor || '#8b5cf6';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="shadow-md"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {project?.logoUrl && (
                <img
                  src={project.logoUrl}
                  alt={project.name}
                  loading="lazy"
                  className="h-10 w-auto"
                />
              )}
              <div>
                <h1 className="text-xl font-bold text-white">{project?.name || 'Knowledge Base'}</h1>
                <p className="text-white/80 text-sm">Help Article</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          <span>Back</span>
        </button>

        {/* Article Content */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {/* Article Header */}
          <div className="p-8 border-b border-gray-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-3">{article.title}</h1>
                
                {article.category && (
                  <span
                    className="inline-block px-3 py-1 text-sm font-medium rounded-full text-white"
                    style={{ backgroundColor: secondaryColor }}
                  >
                    {article.category}
                  </span>
                )}
              </div>
            </div>

            {/* Meta Info */}
            <div className="flex items-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <ClockIcon className="w-4 h-4" />
                <span>
                  {article.publishedAt
                    ? new Date(article.publishedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'Recently published'}
                </span>
              </div>
              <span>👁️ {article.viewCount} views</span>
              <span>👍 {article.helpfulCount}</span>
              <span>👎 {article.notHelpfulCount}</span>
            </div>
          </div>

          {/* Article Body */}
          <div className="p-8">
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
              className="prose prose-lg max-w-none kb-article-content"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content) }}
              style={{
                fontSize: '16px',
                lineHeight: '1.75',
                color: '#374151',
              }}
            />
          </div>

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="px-8 pb-6">
              <div className="flex flex-wrap gap-2">
                <span className="text-sm font-medium text-gray-700 mr-2">Tags:</span>
                {article.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Feedback Section */}
          <div className="px-8 pb-8 border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Was this article helpful?
            </h3>
            
            {feedbackSubmitted ? (
              <div className="text-green-600 font-medium">
                Thank you for your feedback!
              </div>
            ) : (
              <div className="flex space-x-3">
                <button
                  onClick={() => handleFeedback(true)}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium"
                >
                  <HandThumbUpIcon className="w-5 h-5" />
                  <span>Yes, it was helpful</span>
                </button>
                <button
                  onClick={() => handleFeedback(false)}
                  className="flex items-center space-x-2 px-6 py-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium"
                >
                  <HandThumbDownIcon className="w-5 h-5" />
                  <span>No, it wasn't helpful</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default KBArticleView;
