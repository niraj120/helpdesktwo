import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  ArrowLeft,
  Eye,
  Calendar,
  Tag,
  FileText,
  Download,
} from "lucide-react";
import DOMPurify from "dompurify";
import { API_CONFIG } from "../../config/constants";

interface Article {
  id: string;
  documentName: string;
  documentType: "pdf" | "html" | "both" | "link";
  description?: string;
  pdfUrl?: string;
  htmlContent?: string;
  externalUrl?: string;
  author?: string;
  publishedAt?: Date;
  viewsCount: number;
  tags: string[];
  showNewTag: boolean;
}

interface Level {
  _id: string;
  levelName: string;
}

interface RelatedArticle {
  _id: string;
  documentName: string;
  documentType: string;
  isFeatured: boolean;
}

interface ArticleDetailViewProps {
  articleId: string;
  projectId: string;
  onBack: () => void;
  isStudentPortal?: boolean; // When true, skip token to support public access
}

const ArticleDetailView: React.FC<ArticleDetailViewProps> = ({
  articleId,
  projectId,
  onBack,
  isStudentPortal = false,
}) => {
  const [article, setArticle] = useState<Article | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [relatedArticles, setRelatedArticles] = useState<RelatedArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArticle();
  }, [articleId, projectId]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      // Build headers - skip token for student portal to avoid expired token errors
      const headers: any = {};
      if (!isStudentPortal && token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/public/articles/${articleId}`,
        {
          headers,
          params: { projectId },
        },
      );
      setArticle(response.data.data.article);
      setLevels(response.data.data.levels || []);
      setRelatedArticles(response.data.data.relatedArticles || []);
    } catch (error: any) {
      console.error("Failed to fetch article:", error);
      // Don't alert - just log the error, the UI will show "Article not found" state
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading article...</div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Article not found</p>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  // Prepare HTML content for iframe rendering to preserve CSS styles from PDF converters
  const prepareHtmlForViewer = (html: string): string => {
    // If HTML already has DOCTYPE or html tag, return as-is
    if (html.includes("<!DOCTYPE") || html.includes("<html")) {
      // Inject viewport meta if not present for better rendering
      if (!html.includes("<meta") || !html.includes("viewport")) {
        return html.replace(
          "<head>",
          '<head><meta name="viewport" content="width=device-width, initial-scale=1.0">',
        );
      }
      return html;
    }
    // Otherwise wrap in a basic HTML document with comprehensive styles
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 20px; margin: 0; line-height: 1.6; color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; vertical-align: top; }
    th { background-color: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background-color: #fafafa; }
    img { max-width: 100%; height: auto; }
    h1, h2, h3, h4, h5, h6 { margin-top: 1em; margin-bottom: 0.5em; color: #222; }
    p { margin: 0.5em 0; }
    ul, ol { padding-left: 2em; }
    a { color: #0066cc; }
    pre, code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }
  </style>
</head>
<body>${html}</body>
</html>`;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-blue-600 hover:underline mb-6"
      >
        <ArrowLeft size={20} />
        Back to Knowledge Base
      </button>

      {/* Article Header */}
      <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <h1 className="text-3xl font-bold flex-1">{article.documentName}</h1>
          {article.showNewTag && (
            <span className="px-3 py-1 bg-green-500 text-white text-sm font-semibold rounded-full animate-pulse">
              NEW
            </span>
          )}
        </div>

        {/* Description */}
        {article.description && (
          <p className="text-gray-700 mb-4 text-lg leading-relaxed border-l-4 border-blue-500 pl-4 italic">
            {article.description}
          </p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
          {article.author && (
            <span className="flex items-center gap-1">
              <strong>By:</strong> {article.author}
            </span>
          )}
          {article.publishedAt && (
            <span className="flex items-center gap-1">
              <Calendar size={16} />
              {new Date(article.publishedAt).toLocaleDateString()}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Eye size={16} />
            {article.viewsCount} views
          </span>
        </div>

        {/* Levels */}
        {levels.length > 0 && (
          <div className="mb-4">
            <span className="text-sm font-medium text-gray-700 mr-2">
              Categories:
            </span>
            {levels.map((level) => (
              <span
                key={level._id}
                className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm mr-2"
              >
                {level.levelName}
              </span>
            ))}
          </div>
        )}

        {/* Tags */}
        {article.tags.length > 0 && (
          <div className="mb-4">
            <span className="text-sm font-medium text-gray-700 mr-2">
              <Tag size={16} className="inline mr-1" />
              Tags:
            </span>
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm mr-2"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* PDF Content */}
      {(article.documentType === "pdf" || article.documentType === "both") &&
        article.pdfUrl && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <FileText size={24} />
                PDF Document
              </h2>
              <a
                href={article.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                <Download size={18} />
                Download PDF
              </a>
            </div>
            <iframe
              src={article.pdfUrl}
              className="w-full h-[600px] border rounded"
              title="PDF Viewer"
            />
          </div>
        )}

      {/* External Link Content */}
      {article.documentType === "link" && article.externalUrl && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="text-center py-8">
            <h2 className="text-xl font-semibold mb-4">External Resource</h2>
            <p className="text-gray-600 mb-6">
              This article links to an external resource. Click the button below
              to access it.
            </p>
            <a
              href={article.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText size={20} />
              Open External Link
            </a>
            <p className="text-sm text-gray-500 mt-4">
              URL: {article.externalUrl}
            </p>
          </div>
        </div>
      )}

      {/* HTML Content */}
      {(article.documentType === "html" || article.documentType === "both") &&
        article.htmlContent && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
            <iframe
              srcDoc={prepareHtmlForViewer(article.htmlContent)}
              className="w-full border-0 rounded"
              style={{ minHeight: "600px", height: "auto" }}
              sandbox="allow-same-origin allow-scripts"
              title="Article Content"
              onLoad={(e) => {
                // Auto-adjust iframe height to content
                const iframe = e.target as HTMLIFrameElement;
                try {
                  const height =
                    iframe.contentWindow?.document.body?.scrollHeight;
                  if (height && height > 200) {
                    iframe.style.height = `${height + 50}px`;
                  }
                } catch (err) {
                  // Cross-origin restriction - use default height
                }
              }}
            />
          </div>
        )}

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Related Articles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {relatedArticles.map((related) => (
              <div
                key={related._id}
                className="border rounded p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => window.location.reload()} // Reload to show new article
              >
                <h3 className="font-semibold mb-1">{related.documentName}</h3>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  {related.documentType}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArticleDetailView;
