import React, { useState, useEffect } from 'react';
import { X, FileText, ExternalLink, Code } from 'lucide-react';
import axios from 'axios';
import { API_CONFIG } from '../../config/constants';

interface ContentViewerModalProps {
  articleId: string;
  onClose: () => void;
}

interface Article {
  _id: string;
  title: string;
  documentType: 'pdf' | 'link' | 'html' | 'both';
  pdfUrl?: string;
  externalUrl?: string;
  htmlContent?: string;
}

const ContentViewerModal: React.FC<ContentViewerModalProps> = ({ articleId, onClose }) => {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'pdf' | 'html'>('pdf');

  useEffect(() => {
    fetchArticle();
  }, [articleId]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/articles/${articleId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const articleData = response.data.data;
      setArticle(articleData);
      
      // Set default view mode
      if (articleData.pdfUrl) {
        setViewMode('pdf');
      } else if (articleData.htmlContent) {
        setViewMode('html');
      }
    } catch (error) {
      console.error('Failed to fetch article:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExternalLink = () => {
    if (article?.externalUrl) {
      window.open(article.externalUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading content...</p>
        </div>
      </div>
    );
  }

  if (!article) {
    return null;
  }

  const hasPDF = !!article.pdfUrl;
  const hasHTML = !!article.htmlContent;
  const hasExternal = !!article.externalUrl;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3 flex-1">
            <FileText className="text-blue-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900 truncate">{article.title}</h2>
          </div>
          
          {/* View Mode Tabs */}
          <div className="flex items-center gap-2 mx-4">
            {hasPDF && (
              <button
                onClick={() => setViewMode('pdf')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  viewMode === 'pdf'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                PDF
              </button>
            )}
            {hasHTML && (
              <button
                onClick={() => setViewMode('html')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  viewMode === 'html'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                Content
              </button>
            )}
            {hasExternal && (
              <button
                onClick={handleExternalLink}
                className="px-4 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition-all duration-200 shadow-md flex items-center gap-2"
              >
                <ExternalLink size={16} />
                External Link
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden bg-gray-50">
          {viewMode === 'pdf' && hasPDF && (
            <iframe
              src={article.pdfUrl}
              className="w-full h-full border-0"
              title={article.title}
            />
          )}
          
          {viewMode === 'html' && hasHTML && (
            <div className="w-full h-full overflow-auto">
              <div className="max-w-4xl mx-auto px-8 py-8">
                <style>{`
                  .kb-content {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
                    font-size: 16px;
                    line-height: 1.8;
                    color: #1f2937;
                  }
                  .kb-content p {
                    margin-bottom: 1em;
                  }
                  .kb-content a {
                    color: #2563eb;
                    text-decoration: underline;
                    transition: color 0.2s ease;
                  }
                  .kb-content a:hover {
                    color: #1d4ed8;
                    text-decoration: underline;
                  }
                  .kb-content h1, .kb-content h2, .kb-content h3, .kb-content h4 {
                    font-weight: 600;
                    margin-top: 1.5em;
                    margin-bottom: 0.75em;
                    color: #111827;
                  }
                  .kb-content h1 { font-size: 2em; }
                  .kb-content h2 { font-size: 1.5em; }
                  .kb-content h3 { font-size: 1.25em; }
                  .kb-content ul, .kb-content ol {
                    margin-left: 1.5em;
                    margin-bottom: 1em;
                  }
                  .kb-content li {
                    margin-bottom: 0.5em;
                  }
                  .kb-content strong, .kb-content b {
                    font-weight: 600;
                    color: #111827;
                  }
                  .kb-content img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                    margin: 1em 0;
                  }
                  .kb-content code {
                    background-color: #f3f4f6;
                    padding: 0.2em 0.4em;
                    border-radius: 4px;
                    font-family: 'Courier New', monospace;
                    font-size: 0.9em;
                  }
                  .kb-content blockquote {
                    border-left: 4px solid #3b82f6;
                    padding-left: 1em;
                    margin: 1em 0;
                    color: #4b5563;
                    font-style: italic;
                  }
                `}</style>
                <div 
                  className="kb-content"
                  dangerouslySetInnerHTML={{ __html: article.htmlContent || '' }}
                />
              </div>
            </div>
          )}

          {/* No content message */}
          {((viewMode === 'pdf' && !hasPDF) || (viewMode === 'html' && !hasHTML)) && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText size={64} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 text-lg">No {viewMode.toUpperCase()} content available</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentViewerModal;
