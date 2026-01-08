import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import DOMPurify from 'dompurify';
import { API_CONFIG } from '../config/constants';
import {
  HomeIcon,
  TicketIcon,
  BookOpenIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  UserIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

interface Ticket {
  _id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'critical';
  category: string;
  createdAt: string;
  updatedAt: string;
  submissionSource?: 'online' | 'offline';
  createdBy?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  metadata?: {
    studentName?: string;
    studentEmail?: string;
    studentPhone?: string;
  };
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: {
    name: string;
    code: string;
  };
}

interface KBArticle {
  _id: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
}

interface ProjectBranding {
  projectId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
}

const ProjectAgentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams();
  const [activeModule, setActiveModule] = useState<'dashboard' | 'tickets' | 'knowledge-base'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketTab, setTicketTab] = useState<'online' | 'offline'>('online');
  const [loading, setLoading] = useState(true);
  const [projectBranding, setProjectBranding] = useState<ProjectBranding | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // KB states
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [kbCategories, setKbCategories] = useState<string[]>([]);
  const [kbSelectedCategory, setKbSelectedCategory] = useState<string>('all');
  const [kbSearchQuery, setKbSearchQuery] = useState('');
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

  // Stats
  const [stats, setStats] = useState({
    openTickets: 0,
    inProgressTickets: 0,
    resolvedToday: 0,
    avgResponseTime: '0h',
  });

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    
    if (!token) {
      navigate(`/${customUrlPath}/agent`);
      return;
    }

    fetchData();
  }, [customUrlPath, navigate]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      // Fetch user info
      const userRes = await axios.get(`${API_CONFIG.API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(userRes.data.data);

      // Fetch project branding
      const brandingRes = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`
      );
      const brandingData = brandingRes.data.success ? brandingRes.data.data : brandingRes.data;
      setProjectBranding(brandingData);

      // Fetch assigned tickets
      const ticketsRes = await axios.get(
        `${API_CONFIG.API_URL}/tickets/agent/assigned`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { projectId: brandingData.projectId },
        }
      );
      setTickets(ticketsRes.data.data || []);

      // Calculate stats
      const open = ticketsRes.data.data?.filter((t: Ticket) => t.status === 'open').length || 0;
      const inProgress = ticketsRes.data.data?.filter((t: Ticket) => t.status === 'in-progress').length || 0;
      const today = new Date().toDateString();
      const resolvedToday = ticketsRes.data.data?.filter(
        (t: Ticket) => t.status === 'resolved' && new Date(t.updatedAt).toDateString() === today
      ).length || 0;

      setStats({
        openTickets: open,
        inProgressTickets: inProgress,
        resolvedToday,
        avgResponseTime: '2.5h',
      });

      // Fetch KB articles
      const kbRes = await axios.get(
        `${API_CONFIG.API_URL}/kb/project/${brandingData.projectId}`
      );
      const articles = kbRes.data.data || kbRes.data;
      setKbArticles(Array.isArray(articles) ? articles : []);

      // Extract unique categories
      const categories = Array.from(
        new Set(
          articles
            .filter((article: KBArticle) => article.category)
            .map((article: KBArticle) => article.category)
        )
      ) as string[];
      setKbCategories(categories);

      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      if (error.response?.status === 401) {
        localStorage.removeItem('authToken');
        navigate(`/${customUrlPath}/agent`);
      }
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate(`/${customUrlPath}/agent`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
      case 'urgent':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const toggleArticle = (articleId: string) => {
    setExpandedArticles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(articleId)) {
        newSet.delete(articleId);
      } else {
        newSet.add(articleId);
      }
      return newSet;
    });
  };

  const getFilteredKbArticles = () => {
    let filtered = kbArticles;

    if (kbSelectedCategory !== 'all') {
      filtered = filtered.filter((article) => article.category === kbSelectedCategory);
    }

    if (kbSearchQuery.trim()) {
      const query = kbSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (article) =>
          article.title.toLowerCase().includes(query) ||
          article.content.toLowerCase().includes(query) ||
          article.category?.toLowerCase().includes(query) ||
          article.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return filtered;
  };

  const getFilteredTickets = () => {
    // Filter by tab (online/offline) - show all tickets, don't exclude resolved/closed from list
    let filteredTickets = tickets.filter(ticket => {
      const ticketSource = ticket.submissionSource || 'online';
      return ticketSource === ticketTab;
    });

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredTickets = filteredTickets.filter(
        (ticket) =>
          ticket.ticketNumber.toLowerCase().includes(query) ||
          ticket.title.toLowerCase().includes(query) ||
          ticket.description.toLowerCase().includes(query) ||
          ticket.category.toLowerCase().includes(query) ||
          ticket.metadata?.studentName?.toLowerCase().includes(query) ||
          ticket.metadata?.studentEmail?.toLowerCase().includes(query)
      );
    }

    return filteredTickets;
  };

  const getTicketCountsByTab = () => {
    return {
      online: tickets.filter(t => {
        const source = t.submissionSource || 'online';
        const status = String(t.status || '').toLowerCase();
        return source === 'online' && status !== 'resolved' && status !== 'closed';
      }).length,
      offline: tickets.filter(t => {
        const source = t.submissionSource || 'online';
        const status = String(t.status || '').toLowerCase();
        return source === 'offline' && status !== 'resolved' && status !== 'closed';
      }).length,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header */}
      <header
        className="fixed top-0 left-0 right-0 h-16 shadow-md z-30"
        style={{
          background: projectBranding
            ? `linear-gradient(135deg, ${projectBranding.primaryColor} 0%, ${projectBranding.secondaryColor} 100%)`
            : 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
        }}
      >
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-white hover:bg-white/10 p-2 rounded-lg transition-colors lg:hidden"
            >
              {sidebarOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
            {projectBranding?.logoUrl && (
              <img
                src={projectBranding.logoUrl}
                alt={projectBranding.name}
                className="h-10 w-auto"
              />
            )}
            <h1 className="text-xl font-bold text-white hidden md:block">
              {projectBranding?.name || 'Agent Portal'}
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-white">
              <UserIcon className="h-5 w-5" />
              <span className="text-sm font-medium hidden sm:inline">
                {user?.firstName} {user?.lastName}
              </span>
              <span className="text-xs opacity-75 hidden md:inline">({user?.role.name})</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transition-transform duration-300 z-20 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
        style={{
          background: projectBranding
            ? `linear-gradient(180deg, ${projectBranding.primaryColor} 0%, ${projectBranding.secondaryColor} 100%)`
            : 'linear-gradient(180deg, #3b82f6 0%, #1e40af 100%)',
        }}
      >
        <nav className="p-4 space-y-2">
          <button
            onClick={() => setActiveModule('dashboard')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeModule === 'dashboard'
                ? 'bg-white/20 text-white font-semibold'
                : 'text-white/80 hover:bg-white/10'
            }`}
          >
            <HomeIcon className="h-5 w-5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveModule('tickets')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeModule === 'tickets'
                ? 'bg-white/20 text-white font-semibold'
                : 'text-white/80 hover:bg-white/10'
            }`}
          >
            <TicketIcon className="h-5 w-5" />
            <span>My Tickets</span>
          </button>

          <button
            onClick={() => setActiveModule('knowledge-base')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeModule === 'knowledge-base'
                ? 'bg-white/20 text-white font-semibold'
                : 'text-white/80 hover:bg-white/10'
            }`}
          >
            <BookOpenIcon className="h-5 w-5" />
            <span>Knowledge Base</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="pt-16 lg:ml-64 transition-all duration-300">
        <div className="p-6 lg:p-8">
          {/* Dashboard Module */}
          {activeModule === 'dashboard' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">
                  Welcome, {user?.firstName}! 👋
                </h2>
                <p className="text-gray-600 mt-1">Here's an overview of your assigned tickets</p>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <TicketIcon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stats.openTickets}</p>
                      <p className="text-sm text-gray-600">Open Tickets</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-yellow-100 rounded-lg">
                      <ChartBarIcon className="h-6 w-6 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stats.inProgressTickets}</p>
                      <p className="text-sm text-gray-600">In Progress</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <TicketIcon className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stats.resolvedToday}</p>
                      <p className="text-sm text-gray-600">Resolved Today</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <ClockIcon className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stats.avgResponseTime}</p>
                      <p className="text-sm text-gray-600">Avg Response Time</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Tickets */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">Recent Tickets</h3>
                  <button
                    onClick={() => setActiveModule('tickets')}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    View All
                  </button>
                </div>

                {tickets.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No tickets assigned yet</p>
                ) : (
                  <div className="space-y-3">
                    {tickets.slice(0, 5).map((ticket) => (
                      <div
                        key={ticket._id}
                        className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-mono text-sm text-gray-600">
                                {ticket.ticketNumber}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                  ticket.status
                                )}`}
                              >
                                {ticket.status.toUpperCase()}
                              </span>
                              <span className={`text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                                {ticket.priority.toUpperCase()}
                              </span>
                            </div>
                            <h4 className="font-semibold text-gray-900 mb-1">{ticket.title}</h4>
                            <p className="text-sm text-gray-600 line-clamp-1">{ticket.description}</p>
                            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                              <span>Category: {ticket.category}</span>
                              {ticket.metadata?.studentName && (
                                <span>Student: {ticket.metadata.studentName}</span>
                              )}
                              <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tickets Module */}
          {activeModule === 'tickets' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-gray-900">My Tickets</h2>
                <div className="flex items-center space-x-2 bg-white rounded-lg px-4 py-2 shadow-sm">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search tickets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="outline-none text-sm w-64"
                  />
                </div>
              </div>

              {/* Online/Offline Tabs */}
              <div className="bg-white rounded-xl shadow-sm p-2">
                <div className="flex space-x-2">
                  <button
                    onClick={() => setTicketTab('online')}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      ticketTab === 'online'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Online Tickets ({getTicketCountsByTab().online})
                  </button>
                  <button
                    onClick={() => setTicketTab('offline')}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      ticketTab === 'offline'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Offline Tickets ({getTicketCountsByTab().offline})
                  </button>
                </div>
              </div>

              {getFilteredTickets().length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                  <TicketIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No {ticketTab} tickets found</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {getFilteredTickets().map((ticket) => (
                    <div
                      key={ticket._id}
                      className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {ticket.ticketNumber}
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                ticket.status
                              )}`}
                            >
                              {ticket.status.replace('-', ' ').toUpperCase()}
                            </span>
                            <span className={`text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                              {ticket.priority.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-gray-900 font-medium mb-1">{ticket.title}</p>
                        </div>
                      </div>

                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">{ticket.description}</p>

                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-4 text-gray-500">
                          <span>Category: {ticket.category}</span>
                          {ticket.metadata?.studentName && (
                            <span>Student: {ticket.metadata.studentName}</span>
                          )}
                          {ticket.metadata?.studentEmail && (
                            <span className="text-blue-600">{ticket.metadata.studentEmail}</span>
                          )}
                        </div>
                        <span className="text-gray-500">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Knowledge Base Module */}
          {activeModule === 'knowledge-base' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Knowledge Base</h2>
                <p className="text-gray-600 mt-1">Browse articles and find answers</p>
              </div>

              {/* Search and Filters */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search articles..."
                      value={kbSearchQuery}
                      onChange={(e) => setKbSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <select
                    value={kbSelectedCategory}
                    onChange={(e) => setKbSelectedCategory(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Categories</option>
                    {kbCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Articles */}
              <div className="space-y-4">
                {getFilteredKbArticles().length === 0 ? (
                  <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                    <BookOpenIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No articles found</p>
                  </div>
                ) : (
                  getFilteredKbArticles().map((article) => (
                    <div key={article._id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                      <button
                        onClick={() => toggleArticle(article._id)}
                        className="w-full p-6 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              {article.title}
                            </h3>
                            <div className="flex items-center space-x-3 text-sm text-gray-600">
                              {article.category && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                  {article.category}
                                </span>
                              )}
                              <span>👁️ {article.viewCount} views</span>
                            </div>
                          </div>
                          <span className="text-gray-400">
                            {expandedArticles.has(article._id) ? '−' : '+'}
                          </span>
                        </div>
                      </button>

                      {expandedArticles.has(article._id) && (
                        <div className="px-6 pb-6 border-t border-gray-200">
                          <div
                            className="prose max-w-none mt-4"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content) }}
                          />
                          {article.tags && article.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                              {article.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default ProjectAgentDashboard;
