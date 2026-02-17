import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { FileText, Search, Eye, Table as TableIcon, Sparkles, LayoutGrid, BookOpen, TrendingUp } from 'lucide-react';
import ArticleDetailView from './ArticleDetailView';
import KBTableViewer from './KBTableViewer';
import { API_CONFIG } from '../../config/constants';

interface KBLevel {
  id: string;
  levelName: string;
  levelOrder: number;
  levelIcon?: string;
  articles: KBArticle[];
  tables: KBTable[];
}

interface KBTable {
  _id: string;
  tableName: string;
  description?: string;
  status: string;
  displayStyle?: 'table' | 'tiles';
  dataSource?: 'manual' | 'articles';
}

interface KBArticle {
  id: string;
  documentName: string;
  documentType: 'pdf' | 'html' | 'both' | 'link';
  pdfUrl?: string;
  htmlContent?: string;
  externalUrl?: string;
  description?: string;
  showNewTag?: boolean;
  isFeatured: boolean;
  author?: string;
  publishedAt?: Date;
  viewsCount: number;
  tags: string[];
}

interface KnowledgeBaseViewerProps {
  projectId: string;
  showControls?: boolean; // Hide toggle buttons for regular users
}

const KnowledgeBaseViewer: React.FC<KnowledgeBaseViewerProps> = ({ projectId, showControls = false }) => {
  const { t } = useTranslation();
  const [levels, setLevels] = useState<KBLevel[]>([]);
  const [activeLevel, setActiveLevel] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'articles' | 'tables' | 'all'>('all');

  useEffect(() => {
    if (projectId) {
      fetchKnowledgeBase();
    }
  }, [projectId]);

  const fetchKnowledgeBase = async () => {
    if (!projectId) {
      console.log('KnowledgeBaseViewer: No projectId provided, skipping fetch');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      // Build headers - only include auth if token exists (supports public access)
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      console.log('KnowledgeBaseViewer: Fetching KB with projectId:', projectId);
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/public/articles`,
        {
          headers,
          params: { projectId },
        }
      );
      const fetchedLevels = response.data.data.levels || [];
      setLevels(fetchedLevels);
      if (fetchedLevels.length > 0) {
        setActiveLevel(fetchedLevels[0].id);
      }
    } catch (error: any) {
      console.error('Failed to fetch knowledge base:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchKnowledgeBase();
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      // Build headers - only include auth if token exists (supports public access)
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/public/articles/search`,
        {
          headers,
          params: { q: searchQuery, projectId },
        }
      );
      
      if (response.data.success) {
        const searchResults = response.data.data || [];
        
        // Group search results by level
        const levelMap = new Map<string, KBLevel>();
        
        searchResults.forEach((article: any) => {
          article.levels?.forEach((level: any) => {
            const levelId = level._id || level.id;
            if (!levelMap.has(levelId)) {
              levelMap.set(levelId, {
                id: levelId,
                levelName: level.levelName,
                levelOrder: level.levelOrder || 0,
                levelIcon: level.levelIcon,
                articles: [],
                tables: [],
              });
            }
            
            const existingLevel = levelMap.get(levelId)!;
            if (!existingLevel.articles.find(a => a.id === article._id)) {
              existingLevel.articles.push({
                id: article._id,
                documentName: article.documentName,
                documentType: article.documentType,
                pdfUrl: article.pdfUrl,
                htmlContent: article.htmlContent,
                externalUrl: article.externalUrl,
                description: article.description,
                showNewTag: article.showNewTag,
                isFeatured: article.isFeatured,
                author: article.author,
                publishedAt: article.publishedAt,
                viewsCount: article.viewsCount,
                tags: article.tags || [],
              });
            }
          });
        });
        
        const searchedLevels = Array.from(levelMap.values()).sort((a, b) => a.levelOrder - b.levelOrder);
        setLevels(searchedLevels);
        if (searchedLevels.length > 0) {
          setActiveLevel(searchedLevels[0].id);
        }
      }
    } catch (error: any) {
      console.error('Failed to search:', error);
      alert('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (selectedArticle) {
    return (
      <ArticleDetailView
        articleId={selectedArticle}
        projectId={projectId}
        onBack={() => setSelectedArticle(null)}
      />
    );
  }

  if (selectedTable) {
    return (
      <KBTableViewer
        tableId={selectedTable}
        onClose={() => setSelectedTable(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t('loadingArticles')}</div>
      </div>
    );
  }

  const currentLevel = levels.find((l) => l.id === activeLevel);

  // Check if any table in this level uses article data source (auto-populated from KB articles)
  // If so, we hide article cards since articles are shown in the table instead
  const hasArticleDataSourceTable = currentLevel?.tables?.some(t => t.dataSource === 'articles');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      {/* Hero Section */}
      <div className="mb-8 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl shadow-2xl p-8 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
            <Sparkles size={32} className="text-white" />
          </div>
          <h2 className="text-4xl font-extrabold">{t('knowledgeBaseTitle')}</h2>
        </div>
        <p className="text-blue-100 text-lg">
          {t('discoverKnowledgeBase')}
        </p>
      </div>

      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative bg-white rounded-2xl shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300">
          <div className="absolute left-6 top-1/2 -translate-y-1/2">
            <Search size={24} className="text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('searchForArticles')}
            className="w-full pl-16 pr-32 py-5 text-lg rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20"
          />
          <button
            onClick={handleSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 flex items-center gap-2 font-semibold shadow-md hover:shadow-lg transition-all duration-300"
          >
            <Search size={20} />
            {t('search')}
          </button>
        </div>
      </div>

      {/* View Mode Toggle - Only show for admins */}
      {showControls && (
        <div className="mb-8 bg-white rounded-2xl shadow-md p-2 inline-flex gap-2">
          <button
            onClick={() => setViewMode('all')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
              viewMode === 'all'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid size={20} />
            {t('all')}
          </button>
          <button
            onClick={() => setViewMode('articles')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
              viewMode === 'articles'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <BookOpen size={20} />
            {t('articles')}
          </button>
          <button
            onClick={() => setViewMode('tables')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
              viewMode === 'tables'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <TableIcon size={20} />
            {t('tables')}
          </button>
        </div>
      )}

      {levels.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">
            {t('noArticlesAvailable')}
          </p>
        </div>
      ) : (
        <>
          {/* Level Tabs */}
          <div className="mb-8">
            <div className="flex flex-wrap gap-3">
              {levels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setActiveLevel(level.id)}
                  className={`group px-8 py-4 rounded-2xl font-bold text-sm transition-all duration-300 ${
                    activeLevel === level.id
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl scale-105'
                      : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg hover:scale-105'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {level.levelIcon && (
                      <span className="text-2xl">{level.levelIcon}</span>
                    )}
                    <span className="text-base">{level.levelName}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${
                      activeLevel === level.id 
                        ? 'bg-white/30 text-white backdrop-blur-sm' 
                        : 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 group-hover:from-blue-200 group-hover:to-indigo-200'
                    }`}>
                      {/* If table uses article data source, show article count; otherwise show articles + manual tables */}
                      {level.tables?.some(t => t.dataSource === 'articles')
                        ? (level.articles?.length || 0)
                        : (level.articles?.length || 0) + (level.tables?.length || 0)
                      }
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Content - Article Cards */}
          {/* Hide article cards if a table with dataSource='articles' exists (articles shown in table instead) */}
          {currentLevel && !hasArticleDataSourceTable && (viewMode === 'all' || viewMode === 'articles') && (
            currentLevel.articles.length === 0 && viewMode === 'articles' ? (
              <div className="text-center py-12 bg-white rounded-lg shadow mb-6">
                <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">
                  No articles available in this category.
                </p>
              </div>
            ) : currentLevel.articles.length > 0 && (
              <>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <FileText size={24} />
                  Articles ({currentLevel.articles.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                  {currentLevel.articles.map((article) => (
                    <div
                      key={article.id}
                      className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-5 cursor-pointer"
                      onClick={() => setSelectedArticle(article.id)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-lg line-clamp-2 flex-1">
                          {article.documentName}
                        </h3>
                        <div className="flex items-center gap-2 ml-2">
                          {article.showNewTag && (
                            <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-500 text-white animate-pulse">
                              NEW
                            </span>
                          )}
                          {article.isFeatured && (
                            <span className="text-yellow-500 text-xl">⭐</span>
                          )}
                        </div>
                      </div>

                      {/* Description preview */}
                      {article.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {article.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          {article.documentType}
                        </span>
                        {article.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Eye size={16} />
                          {article.viewsCount} views
                        </span>
                        {article.author && <span>{article.author}</span>}
                      </div>

                      <div className="mt-4 text-blue-600 font-medium text-sm">
                        Read more →
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          )}

          {/* Tables */}
          {currentLevel && (viewMode === 'all' || viewMode === 'tables') && (
            currentLevel.tables && currentLevel.tables.length === 0 && viewMode === 'tables' ? (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <TableIcon size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">
                  No tables available in this category.
                </p>
              </div>
            ) : currentLevel.tables && currentLevel.tables.length > 0 && (
              <div className="space-y-6">
                {currentLevel.tables.map((table) => (
                  <div key={table._id}>
                    <KBTableViewer tableId={table._id} levelId={currentLevel.id} showHeader={false} autoPopulate={true} />
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};

export default KnowledgeBaseViewer;
