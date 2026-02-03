import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, Eye, FileText, Calendar } from 'lucide-react';
import KBArticleForm from './KBArticleForm';
import { API_CONFIG } from '../../config/constants';

interface KBArticle {
  _id: string;
  documentName: string;
  documentType: 'pdf' | 'html' | 'both';
  status: 'active' | 'inactive';
  publishedDate?: Date;
  scheduledPublishDate?: Date;
  isFeatured: boolean;
  showNewTag: boolean;
  description?: string;
  viewsCount: number;
  tags: string[];
  levels: { _id: string; levelName: string }[];
  createdBy?: { name: string };
}

interface KBArticleManagementProps {
  projectId: string;
}

const KBArticleManagement: React.FC<KBArticleManagementProps> = ({ projectId }) => {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KBArticle | null>(null);
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    levelId: '',
    search: '',
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchArticles();
  }, [projectId, filters, page]);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/articles`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            projectId,
            status: filters.status !== 'all' ? filters.status : undefined,
            levelId: filters.levelId || undefined,
            search: filters.search || undefined,
            page,
            limit: 20,
          },
        }
      );
      setArticles(response.data.data.articles || []);
      setTotalPages(response.data.data.pagination.totalPages || 1);
    } catch (error: any) {
      console.error('Failed to fetch KB articles:', error);
      alert(error.response?.data?.message || 'Failed to fetch articles');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (articleId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this article? This will also delete any associated PDFs.'
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(
        `${API_CONFIG.API_URL}/kb/articles/${articleId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchArticles();
    } catch (error: any) {
      console.error('Failed to delete article:', error);
      alert(error.response?.data?.message || 'Failed to delete article');
    }
  };

  const handleEdit = async (article: KBArticle) => {
    try {
      setIsLoadingArticle(true);
      setShowForm(true); // Show form with loading state
      // Fetch full article details including levels
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/articles/${article._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Fetched article for editing:', response.data.data);
      setEditingArticle(response.data.data);
    } catch (error) {
      console.error('Failed to fetch article details:', error);
      alert('Failed to load article details');
      setShowForm(false);
    } finally {
      setIsLoadingArticle(false);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingArticle(null);
    fetchArticles();
  };

  if (showForm) {
    // Show loading state while fetching article for edit
    if (isLoadingArticle) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading article...</p>
          </div>
        </div>
      );
    }
    
    return (
      <KBArticleForm
        key={editingArticle?._id || 'new'} // Force remount when editing different articles
        projectId={projectId}
        article={editingArticle}
        onClose={handleFormClose}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Knowledge Base Articles</h2>
          <p className="text-gray-600 mt-1">
            Manage documents, PDFs, and HTML content
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Article
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search articles..."
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchArticles}
              className="w-full bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Articles Grid */}
      {loading ? (
        <div className="text-center py-8">Loading articles...</div>
      ) : articles.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">
            No articles found. Create your first article to get started.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article) => (
              <div
                key={article._id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-lg line-clamp-2 flex-1">
                      {article.documentName}
                    </h3>
                    <div className="flex items-center gap-2 ml-2">
                      {article.showNewTag && (
                        <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-500 text-white">
                          NEW
                        </span>
                      )}
                      {article.isFeatured && (
                        <span className="text-yellow-500">⭐</span>
                      )}
                    </div>
                  </div>

                  {/* Description preview */}
                  {article.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2 italic">
                      {article.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mb-3">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        article.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {article.status}
                    </span>
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      {article.documentType}
                    </span>
                  </div>

                  {article.levels && article.levels.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">Levels:</p>
                      <div className="flex flex-wrap gap-1">
                        {article.levels.map((level) => (
                          <span
                            key={level._id}
                            className="px-2 py-1 text-xs bg-gray-100 rounded"
                          >
                            {level.levelName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {article.scheduledPublishDate && (
                    <div className="flex items-center gap-1 text-xs text-gray-600 mb-3">
                      <Calendar size={14} />
                      Publish:{' '}
                      {new Date(article.scheduledPublishDate).toLocaleDateString()}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Eye size={14} />
                      {article.viewsCount} views
                    </span>
                    {article.createdBy && (
                      <span>by {article.createdBy.name}</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(article)}
                      className="flex-1 flex items-center justify-center gap-1 bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700"
                    >
                      <Edit2 size={16} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(article._id)}
                      className="flex items-center justify-center gap-1 bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-4 py-2 border rounded hover:bg-gray-100 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
                className="px-4 py-2 border rounded hover:bg-gray-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default KBArticleManagement;
