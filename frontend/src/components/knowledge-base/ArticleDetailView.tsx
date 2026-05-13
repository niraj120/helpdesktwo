import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  ArrowLeft,
  Eye,
  Calendar,
  Tag,
  FileText,
  Download,
} from "lucide-react";
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
  isFeatured: boolean;
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
  showNewTag?: boolean;
}

interface ArticleDetailViewProps {
  articleId: string;
  projectId: string;
  onBack: () => void;
  onSelectArticle?: (articleId: string) => void;
  isStudentPortal?: boolean; // When true, skip token to support public access
  searchQuery?: string;
}

const ArticleDetailView: React.FC<ArticleDetailViewProps> = ({
  articleId,
  projectId,
  onBack,
  onSelectArticle,
  isStudentPortal = false,
  searchQuery = "",
}) => {
  const [article, setArticle] = useState<Article | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [relatedArticles, setRelatedArticles] = useState<RelatedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [iframeUrl, setIframeUrl] = useState<string>("");
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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

  // Prepare HTML content for iframe rendering to preserve CSS styles from PDF converters
  const prepareHtmlForViewer = (
    html: string,
  ): { html: string; matchCount: number } => {
    const escapedQuery = searchQuery.trim();

    const ensureBaseTargetBlank = (content: string): string => {
      if (
        /target\s*=\s*["']_blank["']/i.test(content) &&
        /<base\b/i.test(content)
      ) {
        return content;
      }

      if (/<head\b[^>]*>/i.test(content)) {
        return content.replace(
          /<head\b([^>]*)>/i,
          '<head$1><base target="_blank">',
        );
      }

      if (/<html\b[^>]*>/i.test(content)) {
        return content.replace(
          /<html\b([^>]*)>/i,
          '<html$1><head><base target="_blank"></head>',
        );
      }

      return content;
    };

    const wrapMinimalHtml = (content: string) =>
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base target="_blank">
</head>
<body>${content}</body>
</html>`;

    let normalizedHtml = html;

    // Fidelity-first rendering: keep source HTML as-is whenever possible.
    if (html.includes("<!DOCTYPE") || html.includes("<html")) {
      normalizedHtml = ensureBaseTargetBlank(html);
    } else {
      normalizedHtml = wrapMinimalHtml(html);
    }

    // Do not mutate HTML DOM for highlighting; it can break formatting.
    // Keep match controls hidden until a non-destructive highlighter is added.
    if (!escapedQuery) return { html: normalizedHtml, matchCount: 0 };
    return { html: normalizedHtml, matchCount: 0 };
  };

  useEffect(() => {
    if (!article?.htmlContent) {
      setIframeUrl("");
      setTotalMatches(0);
      setCurrentMatch(1);
      return;
    }

    const prepared = prepareHtmlForViewer(article.htmlContent);
    const blob = new Blob([prepared.html], { type: "text/html" });
    const nextUrl = URL.createObjectURL(blob);

    setIframeUrl(nextUrl);
    setTotalMatches(prepared.matchCount);
    setCurrentMatch(prepared.matchCount > 0 ? 1 : 0);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [article?.htmlContent, searchQuery]);

  const focusMatch = (matchNumber: number) => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc) return;

    iframeDoc
      .querySelectorAll("mark.kb-match-active")
      .forEach((el) => el.classList.remove("kb-match-active"));

    const target = iframeDoc.querySelector(
      `mark[data-kb-match="${matchNumber}"]`,
    );

    if (target) {
      target.classList.add("kb-match-active");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const goToNextMatch = () => {
    if (!totalMatches) return;
    setCurrentMatch((prev) => (prev >= totalMatches ? 1 : prev + 1));
  };

  const goToPreviousMatch = () => {
    if (!totalMatches) return;
    setCurrentMatch((prev) => (prev <= 1 ? totalMatches : prev - 1));
  };

  useEffect(() => {
    if (currentMatch > 0) {
      focusMatch(currentMatch);
    }
  }, [currentMatch, iframeUrl]);

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

  return (
    <div className="max-w-7xl mx-auto p-6">
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
          <div className="flex items-center gap-2">
            {article.showNewTag && (
              <span className="px-3 py-1 bg-green-500 text-white text-sm font-semibold rounded-full animate-pulse">
                NEW
              </span>
            )}
            {article.isFeatured && (
              <span className="inline-flex items-center px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-semibold rounded-full">
                ⭐ Featured
              </span>
            )}
          </div>
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
            {totalMatches > 0 && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="text-sm font-medium text-amber-800">
                  Match {currentMatch} of {totalMatches}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={goToPreviousMatch}
                    className="rounded border border-amber-300 bg-white px-3 py-1 text-sm text-amber-800 hover:bg-amber-100"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={goToNextMatch}
                    className="rounded border border-amber-300 bg-white px-3 py-1 text-sm text-amber-800 hover:bg-amber-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              className="w-full border-0 rounded"
              style={{ minHeight: "600px", height: "600px" }}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              title="Article Content"
              onLoad={(e) => {
                // Auto-adjust iframe height to content
                const iframe = e.target as HTMLIFrameElement;
                try {
                  const height =
                    iframe.contentWindow?.document.body?.scrollHeight;
                  if (height && height > 200) {
                    iframe.style.height = `${height + 50}px`;
                  } else {
                    iframe.style.height = "600px";
                  }
                } catch (err) {
                  // Cross-origin restriction - use default height
                  iframe.style.height = "600px";
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
                onClick={() => {
                  if (onSelectArticle) {
                    onSelectArticle(related._id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold mb-1">{related.documentName}</h3>
                  <div className="flex items-center gap-2">
                    {related.showNewTag && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-500 text-white">
                        NEW
                      </span>
                    )}
                    {related.isFeatured && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-semibold">
                        Featured
                      </span>
                    )}
                  </div>
                </div>
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
