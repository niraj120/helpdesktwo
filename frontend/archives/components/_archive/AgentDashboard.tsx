/**
 * ⚠️ POTENTIAL DUPLICATE - VERIFY BEFORE USE
 * 
 * There is another AgentDashboard component at: src/components/AgentDashboard.tsx
 * The components/ version is currently imported in App.tsx (line 5)
 * 
 * TODO: Verify which version is correct and archive the other
 * - components/AgentDashboard.tsx (548 lines) - Currently used
 * - pages/AgentDashboard.tsx (868 lines) - This file
 * 
 * Check: Are both needed for different routes?
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { API_CONFIG } from '../../config/constants';
import {
  HomeIcon,
  TicketIcon,
  BookOpenIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChartBarIcon,
  FunnelIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChatBubbleBottomCenterTextIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
// import AgentOfflineModule from './AgentOfflineModule'; // File not found - archived component

interface ProjectBranding {
  projectId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: {
    name: string;
    code: string;
  };
  projects?: Array<string | { _id: string }>;
}

interface Ticket {
  _id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  createdBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  assignedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface KBArticle {
  _id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  upvotes: number;
  downvotes: number;
  views: number;
  createdAt: string;
  updatedAt: string;
}

interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  pending: number;
  resolved: number;
  closed: number;
  avgResolutionTime: number; // in hours
}

type ActiveModule = 'dashboard' | 'tickets' | 'knowledge-base' | 'offline';

const AgentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<ActiveModule>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [projectBranding, setProjectBranding] = useState<ProjectBranding | null>(null);
  const [loading, setLoading] = useState(true);

  // Ticket Module States
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // KB Module States
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSearchQuery, setKbSearchQuery] = useState('');
  const [kbCategoryFilter, setKbCategoryFilter] = useState<string>('all');

  // Dashboard Stats States
  const [ticketStats, setTicketStats] = useState<TicketStats>({
    total: 0,
    open: 0,
    inProgress: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
    avgResolutionTime: 0,
  });

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      navigate(`/${customUrlPath}/agent/login`);
      return;
    }

    fetchUserData(token);
    fetchProjectBranding();
  }, [customUrlPath, navigate]);

  useEffect(() => {
    if (activeModule === 'tickets' && user) {
      fetchTickets();
    } else if (activeModule === 'knowledge-base') {
      fetchKBArticles();
    } else if (activeModule === 'dashboard' && user) {
      calculateTicketStats();
    }
  }, [activeModule, user]);

  const fetchUserData = async (token: string) => {
    try {
      const response = await axios.get(`${API_CONFIG.API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = response.data.data;

      // Route protection will handle access control based on permissions
      setUser(userData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user data:', error);
      localStorage.removeItem('authToken');
      navigate(`/${customUrlPath}/agent/login`);
    }
  };

  const fetchProjectBranding = async () => {
    try {
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`
      );
      const brandingData = response.data.success ? response.data.data : response.data;
      setProjectBranding(brandingData);
    } catch (error) {
      console.error('Error fetching project branding:', error);
    }
  };

  const fetchTickets = async () => {
    setTicketsLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/agent/assigned`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { projectId: projectBranding?.projectId },
        }
      );
      setTickets(response.data.data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setTicketsLoading(false);
    }
  };

  const calculateTicketStats = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/agent/assigned`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { projectId: projectBranding?.projectId },
        }
      );
      const allTickets = response.data.data || [];

      const stats: TicketStats = {
        total: allTickets.length,
        open: allTickets.filter((t: Ticket) => t.status === 'Open').length,
        inProgress: allTickets.filter((t: Ticket) => t.status === 'In Progress').length,
        pending: allTickets.filter((t: Ticket) => t.status === 'Pending').length,
        resolved: allTickets.filter((t: Ticket) => t.status === 'Resolved').length,
        closed: allTickets.filter((t: Ticket) => t.status === 'Closed').length,
        avgResolutionTime: 0,
      };

      // Calculate average resolution time for resolved tickets
      const resolvedTickets = allTickets.filter(
        (t: Ticket) => t.status === 'Resolved' || t.status === 'Closed'
      );
      if (resolvedTickets.length > 0) {
        const totalTime = resolvedTickets.reduce((sum: number, ticket: Ticket) => {
          const created = new Date(ticket.createdAt).getTime();
          const updated = new Date(ticket.updatedAt).getTime();
          return sum + (updated - created);
        }, 0);
        stats.avgResolutionTime = Math.round(totalTime / resolvedTickets.length / (1000 * 60 * 60)); // Convert to hours
      }

      setTicketStats(stats);
    } catch (error) {
      console.error('Error calculating ticket stats:', error);
    }
  };

  const fetchKBArticles = async () => {
    setKbLoading(true);
    try {
      const response = await axios.get(
        `${API_CONFIG.API_URL}/knowledge-base/project/${projectBranding?.projectId}/articles`
      );
      setKbArticles(response.data.data || []);
    } catch (error) {
      console.error('Error fetching KB articles:', error);
    } finally {
      setKbLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate(`/${customUrlPath}/agent/login`);
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const filteredKBArticles = kbArticles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(kbSearchQuery.toLowerCase()) ||
      article.content.toLowerCase().includes(kbSearchQuery.toLowerCase()) ||
      article.tags.some((tag) => tag.toLowerCase().includes(kbSearchQuery.toLowerCase()));

    const matchesCategory = kbCategoryFilter === 'all' || article.category === kbCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'In Progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Pending':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Resolved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Closed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'High':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getKBCategories = () => {
    const categories = new Set(kbArticles.map((article) => article.category));
    return Array.from(categories);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Sidebar Header */}
        <div
          className="h-20 flex items-center justify-between px-6"
          style={{
            background: projectBranding
              ? `linear-gradient(135deg, ${projectBranding.primaryColor} 0%, ${projectBranding.secondaryColor} 100%)`
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          }}
        >
          <div className="flex items-center space-x-3">
            {projectBranding?.logoUrl && (
              <img
                src={projectBranding.logoUrl}
                alt={projectBranding.name}
                className="h-10 w-10 rounded-lg"
              />
            )}
            <div className="text-white">
              <h1 className="text-lg font-bold">{projectBranding?.name || 'Helpdesk'}</h1>
              <p className="text-xs opacity-90">Agent Portal</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3">
          <button
            onClick={() => {
              setActiveModule('dashboard');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
              activeModule === 'dashboard'
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <HomeIcon className="h-5 w-5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => {
              setActiveModule('tickets');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
              activeModule === 'tickets'
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <TicketIcon className="h-5 w-5" />
            <span>My Tickets</span>
          </button>

          <button
            onClick={() => {
              setActiveModule('knowledge-base');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
              activeModule === 'knowledge-base'
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <BookOpenIcon className="h-5 w-5" />
            <span>Knowledge Base</span>
          </button>

          <button
            onClick={() => {
              setActiveModule('offline');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
              activeModule === 'offline'
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <BuildingOfficeIcon className="h-5 w-5" />
            <span>Offline Support</span>
          </button>
        </nav>

        {/* User Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.role.name}</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Bar */}
        <header className="bg-white shadow-sm h-20 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-600 hover:text-gray-900"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {activeModule === 'dashboard' && 'Dashboard'}
                {activeModule === 'tickets' && 'My Tickets'}
                {activeModule === 'knowledge-base' && 'Knowledge Base'}
                {activeModule === 'offline' && 'Offline Support Center'}
              </h2>
              <p className="text-sm text-gray-600">
                {activeModule === 'dashboard' && 'Overview of your ticket assignments'}
                {activeModule === 'tickets' && 'Tickets assigned to you'}
                {activeModule === 'knowledge-base' && 'Browse help articles and documentation'}
                {activeModule === 'offline' && 'Register students and create tickets for walk-in support'}
              </p>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="p-6">
          {/* Dashboard Module */}
          {activeModule === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Tickets */}
                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <TicketIcon className="h-6 w-6 text-blue-600" />
                    </div>
                    <ChartBarIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">{ticketStats.total}</h3>
                  <p className="text-sm text-gray-600 mt-1">Total Tickets</p>
                </div>

                {/* Open Tickets */}
                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-orange-500">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-orange-100 rounded-lg">
                      <ExclamationCircleIcon className="h-6 w-6 text-orange-600" />
                    </div>
                    <ArrowUpIcon className="h-5 w-5 text-orange-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {ticketStats.open + ticketStats.inProgress + ticketStats.pending}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">Pending Action</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Open: {ticketStats.open} | In Progress: {ticketStats.inProgress} | Pending: {ticketStats.pending}
                  </p>
                </div>

                {/* Resolved Tickets */}
                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <CheckCircleIcon className="h-6 w-6 text-green-600" />
                    </div>
                    <ArrowDownIcon className="h-5 w-5 text-green-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {ticketStats.resolved + ticketStats.closed}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">Resolved Tickets</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Resolved: {ticketStats.resolved} | Closed: {ticketStats.closed}
                  </p>
                </div>

                {/* Average Resolution Time */}
                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-purple-500">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <ClockIcon className="h-6 w-6 text-purple-600" />
                    </div>
                    <ChartBarIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">{ticketStats.avgResolutionTime}h</h3>
                  <p className="text-sm text-gray-600 mt-1">Avg Resolution Time</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setActiveModule('tickets')}
                    className="flex items-center space-x-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-left"
                  >
                    <TicketIcon className="h-6 w-6 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">View All Tickets</p>
                      <p className="text-sm text-gray-600">See all assigned tickets</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveModule('knowledge-base')}
                    className="flex items-center space-x-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors text-left"
                  >
                    <BookOpenIcon className="h-6 w-6 text-purple-600" />
                    <div>
                      <p className="font-medium text-gray-900">Browse Knowledge Base</p>
                      <p className="text-sm text-gray-600">Find help articles</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter('Open');
                      setActiveModule('tickets');
                    }}
                    className="flex items-center space-x-3 p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors text-left"
                  >
                    <ExclamationCircleIcon className="h-6 w-6 text-orange-600" />
                    <div>
                      <p className="font-medium text-gray-900">Open Tickets</p>
                      <p className="text-sm text-gray-600">Filter by open status</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tickets Module */}
          {activeModule === 'tickets' && (
            <div className="space-y-6">
              {/* Search and Filters */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Search */}
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search Tickets
                    </label>
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search by number, title..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <div className="relative">
                      <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                      >
                        <option value="all">All Status</option>
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Pending">Pending</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>

                  {/* Priority Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Priority
                    </label>
                    <div className="relative">
                      <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <select
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                      >
                        <option value="all">All Priority</option>
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tickets List */}
              {ticketsLoading ? (
                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-4">Loading tickets...</p>
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                  <TicketIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Tickets Found</h3>
                  <p className="text-gray-600">
                    {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'You have no tickets assigned yet'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredTickets.map((ticket) => (
                    <div
                      key={ticket._id}
                      className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
                      onClick={() => {
                        // TODO: Open ticket detail
                        console.log('Open ticket:', ticket._id);
                      }}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="text-sm font-mono text-gray-500">
                              #{ticket.ticketNumber}
                            </span>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                                ticket.status
                              )}`}
                            >
                              {ticket.status}
                            </span>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(
                                ticket.priority
                              )}`}
                            >
                              {ticket.priority}
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {ticket.title}
                          </h3>
                          <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                            {ticket.description}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>Category: {ticket.category}</span>
                            <span>•</span>
                            <span>By: {ticket.createdBy.firstName} {ticket.createdBy.lastName}</span>
                            <span>•</span>
                            <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <ChatBubbleBottomCenterTextIcon className="h-6 w-6 text-gray-400" />
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
              {/* Search and Filters */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Search */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search Articles
                    </label>
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search articles, tags..."
                        value={kbSearchQuery}
                        onChange={(e) => setKbSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Category Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <div className="relative">
                      <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <select
                        value={kbCategoryFilter}
                        onChange={(e) => setKbCategoryFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                      >
                        <option value="all">All Categories</option>
                        {getKBCategories().map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Articles List */}
              {kbLoading ? (
                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-4">Loading articles...</p>
                </div>
              ) : filteredKBArticles.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                  <BookOpenIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Articles Found</h3>
                  <p className="text-gray-600">
                    {kbSearchQuery || kbCategoryFilter !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'No articles available yet'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredKBArticles.map((article) => (
                    <div
                      key={article._id}
                      className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mb-3">
                            {article.category}
                          </span>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {article.title}
                          </h3>
                          <p className="text-gray-600 text-sm line-clamp-3 mb-4">
                            {article.content.replace(/<[^>]*>/g, '').substring(0, 150)}...
                          </p>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {article.tags.slice(0, 3).map((tag, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <div className="flex items-center space-x-1">
                              <HandThumbUpIcon className="h-4 w-4" />
                              <span>{article.upvotes}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <HandThumbDownIcon className="h-4 w-4" />
                              <span>{article.downvotes}</span>
                            </div>
                            <span>•</span>
                            <span>{article.views} views</span>
                          </div>
                        </div>
                        <BookOpenIcon className="h-6 w-6 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Offline Support Module */}
          {activeModule === 'offline' && user && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-yellow-800">AgentOfflineModule component is archived and not available</p>
            </div>
            /* <AgentOfflineModule 
              projectId={
                user.projects && user.projects.length > 0 
                  ? (typeof user.projects[0] === 'string' ? user.projects[0] : user.projects[0]._id)
                  : ''
              } 
            /> */
          )}
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
    </div>
  );
};

export default AgentDashboard;
