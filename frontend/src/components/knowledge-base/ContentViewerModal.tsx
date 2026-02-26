import React, { useState, useEffect } from "react";
import { X, FileText, ExternalLink, Code } from "lucide-react";
import axios from "axios";
import { API_CONFIG } from "../../config/constants";

interface ContentViewerModalProps {
  articleId: string;
  onClose: () => void;
}

interface Article {
  _id: string;
  title: string;
  documentType: "pdf" | "link" | "html" | "both";
  pdfUrl?: string;
  externalUrl?: string;
  htmlContent?: string;
}

const ContentViewerModal: React.FC<ContentViewerModalProps> = ({
  articleId,
  onClose,
}) => {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"pdf" | "html">("pdf");

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

  useEffect(() => {
    fetchArticle();
  }, [articleId]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/articles/${articleId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const articleData = response.data.data;
      setArticle(articleData);

      // Set default view mode
      if (articleData.pdfUrl) {
        setViewMode("pdf");
      } else if (articleData.htmlContent) {
        setViewMode("html");
      }
    } catch (error) {
      console.error("Failed to fetch article:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExternalLink = () => {
    if (article?.externalUrl) {
      window.open(article.externalUrl, "_blank", "noopener,noreferrer");
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
            <h2 className="text-xl font-bold text-gray-900 truncate">
              {article.title}
            </h2>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center gap-2 mx-4">
            {hasPDF && (
              <button
                onClick={() => setViewMode("pdf")}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  viewMode === "pdf"
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                PDF
              </button>
            )}
            {hasHTML && (
              <button
                onClick={() => setViewMode("html")}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  viewMode === "html"
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
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
          {viewMode === "pdf" && hasPDF && (
            <iframe
              src={article.pdfUrl}
              className="w-full h-full border-0"
              title={article.title}
            />
          )}

          {viewMode === "html" && hasHTML && (
            <div className="w-full h-full overflow-auto">
              <iframe
                srcDoc={prepareHtmlForViewer(article.htmlContent || "")}
                className="w-full h-full border-0"
                sandbox="allow-same-origin allow-scripts"
                title="Article Content"
              />
            </div>
          )}

          {/* No content message */}
          {((viewMode === "pdf" && !hasPDF) ||
            (viewMode === "html" && !hasHTML)) && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText size={64} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 text-lg">
                  No {viewMode.toUpperCase()} content available
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentViewerModal;
