import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import DOMPurify from 'dompurify';
import { API_CONFIG } from '../config/constants';
import { PERMISSIONS } from '../constants/permissions';
import { usePermissions } from '../hooks/usePermissions';
import { LanguageToggle } from '../components/LanguageToggle';
import {
  HomeIcon,
  TicketIcon,
  MapPinIcon,
  BookOpenIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PhoneIcon,
  EnvelopeIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  ArrowLeftIcon,
  PaperClipIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

interface Ticket {
  _id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  createdAt: string;
  updatedAt: string;
  assignedTo?: {
    firstName: string;
    lastName: string;
  };
  attachments?: Array<{
    filename: string;
    path: string;
    mimetype: string;
    size: number;
  }>;
  threads?: Array<{
    _id: string;
    message: string;
    createdBy: {
      firstName: string;
      lastName: string;
      email: string;
      role: { name: string };
    };
    attachments?: Array<{
      filename: string;
      path: string;
      mimetype: string;
      size: number;
    }>;
    createdAt: string;
  }>;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface OnlineFormField {
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'email' | 'phone' | 'url' | 'textarea' | 'dropdown' | 'multiselect' | 'radio' | 'checkbox' | 'file';
  required: boolean;
  placeholder: string;
  options?: string[];
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
  allowMultiple?: boolean;
}

interface OfflineCenter {
  _id?: string;
  centerName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  workingHours: string;
  latitude?: number;
  longitude?: number;
  features?: string[];
  mapLink?: string;
  googleMapLink?: string;
}

interface TicketSubmissionSettings {
  mode: 'online' | 'offline' | 'both';
  enableOnlineForm: boolean;
  enableOfflineCenter: boolean;
  onlineFormFields: OnlineFormField[];
  offlineCenters: OfflineCenter[];
  welcomeMessage?: string;
  successMessage?: string;
  announcement?: string;
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

const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams();
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();
  const [activeModule, setActiveModule] = useState<'dashboard' | 'submit-ticket' | 'find-center' | 'knowledge-base' | 'ticket-detail'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Initialize projectBranding from sessionStorage immediately to prevent flickering
  const [projectBranding, setProjectBranding] = useState<any>(() => {
    const cachedBrandingKey = `branding_${customUrlPath}`;
    const cachedData = sessionStorage.getItem(cachedBrandingKey);
    return cachedData ? JSON.parse(cachedData) : null;
  });
  
  // Ticket submission states
  const [ticketSettings, setTicketSettings] = useState<TicketSubmissionSettings | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fieldFiles, setFieldFiles] = useState<Record<string, File[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Find center states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'state' | 'city' | 'pincode'>('all');
  const [filteredCenters, setFilteredCenters] = useState<OfflineCenter[]>([]);
  
  // Knowledge Base states
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [kbCategories, setKbCategories] = useState<string[]>([]);
  const [kbSelectedCategory, setKbSelectedCategory] = useState<string>('all');
  const [kbSearchQuery, setKbSearchQuery] = useState('');
  const [selectedKbArticle, setSelectedKbArticle] = useState<KBArticle | null>(null);
  const [articleVotes, setArticleVotes] = useState<Record<string, 'helpful' | 'not-helpful' | null>>({});

  // Ticket Detail states
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loadingTicketDetail, setLoadingTicketDetail] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [closingTicket, setClosingTicket] = useState(false);
  const [allowStudentToCloseTicket, setAllowStudentToCloseTicket] = useState(false);

  // Load KB votes from localStorage
  useEffect(() => {
    const savedVotes = localStorage.getItem('kb_article_votes');
    if (savedVotes) {
      try {
        setArticleVotes(JSON.parse(savedVotes));
      } catch (error) {
        console.error('Error loading KB votes:', error);
      }
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    console.log('🔑 Token from localStorage:', token ? 'EXISTS' : 'MISSING');
    
    if (!token) {
      console.log('❌ No token found, redirecting to student portal');
      navigate(`/${customUrlPath}/submit-ticket`);
      return;
    }

    // Decode JWT to get user info
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('📦 Decoded token payload:', payload);
      
      setUser({
        id: payload.userId,
        email: payload.email,
        firstName: payload.firstName || 'Candidate',
        lastName: payload.lastName || '',
      });
    } catch (error) {
      console.error('❌ Failed to decode token:', error);
      localStorage.removeItem('authToken');
      navigate(`/${customUrlPath}/submit-ticket`);
      return;
    }

    fetchData();
  }, [customUrlPath, navigate]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('authToken');
      console.log('🔄 Fetching data with token:', token ? 'YES' : 'NO');
      
      if (!token) {
        console.error('❌ No token found in fetchData');
        setLoading(false);
        navigate(`/${customUrlPath}/submit-ticket`);
        return;
      }
      
      // Try to get cached branding from sessionStorage first
      const cachedBrandingKey = `branding_${customUrlPath}`;
      const cachedBrandingData = sessionStorage.getItem(cachedBrandingKey);
      
      let branding;
      if (cachedBrandingData) {
        console.log('📦 Using cached branding data');
        branding = JSON.parse(cachedBrandingData);
        setProjectBranding(branding);
      } else {
        // Fetch project branding
        console.log('🌐 Fetching branding data from API');
        const brandingRes = await axios.get(
          `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`
        );
        const brandingData = brandingRes.data.success ? brandingRes.data.data : brandingRes.data;
        
        // Parse colorTheme if it's a string
        let colorTheme = brandingData.branding?.colorTheme;
        if (typeof colorTheme === 'string') {
          // Parse string like "@{primary=#49bc8f; secondary=#64748b; accent=#3b82f6; background=#ffffff}"
          const parsed: any = {};
          const matches = colorTheme.match(/(\w+)=#([a-zA-Z0-9]+)/g);
          if (matches) {
            matches.forEach((match: string) => {
              const [key, value] = match.split('=');
              parsed[key] = '#' + value;
            });
            colorTheme = parsed;
          }
        }
        
        // Add parsed colors to branding
        branding = {
          ...brandingData,
          branding: {
            ...brandingData.branding,
            colorTheme,
          },
          primaryColor: colorTheme?.primary || '#49bc8f',
          secondaryColor: colorTheme?.secondary || '#64748b',
        };
        
        // Cache the branding data
        sessionStorage.setItem(cachedBrandingKey, JSON.stringify(branding));
        setProjectBranding(branding);
      }

      // Fetch ticket settings for submit ticket and find center
      const settingsRes = await axios.get(
        `${API_CONFIG.API_URL}/projects/${branding.projectId}/ticket-settings`
      );
      const settings = settingsRes.data.success ? settingsRes.data.data : settingsRes.data;
      
      // Filter out student profile fields (Name, Email, Phone) since student is already logged in
      const excludeFields = ['name', 'email', 'phone', 'mobile', 'mobile number', 'phone number', 'student name', 'student email', 'contact number', 'email address', 'full name', 'priority'];
      if (settings.onlineFormFields && settings.onlineFormFields.length > 0) {
        settings.onlineFormFields = settings.onlineFormFields.filter(
          (field: any) => !excludeFields.includes(field.fieldName.toLowerCase())
        );
      }
      
      setTicketSettings(settings);
      
      // Initialize filtered centers
      if (settings.offlineCenters) {
        setFilteredCenters(settings.offlineCenters);
      }

      // Fetch KB articles
      try {
        const articlesRes = await axios.get(
          `${API_CONFIG.API_URL}/kb/project/${branding.projectId}`
        );
        setKbArticles(articlesRes.data.data || []);

        // Fetch KB categories
        const categoriesRes = await axios.get(
          `${API_CONFIG.API_URL}/kb/project/${branding.projectId}/categories`
        );
        setKbCategories(categoriesRes.data.data || []);
      } catch (kbError) {
        console.error('KB not available:', kbError);
      }

      // Fetch student's tickets
      console.log('🎫 Fetching tickets with Authorization header...');
      console.log('📦 Project ID:', branding.projectId);
      const ticketsRes = await axios.get(
        `${API_CONFIG.API_URL}/tickets/my-tickets?projectId=${branding.projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log('✅ Tickets fetched:', ticketsRes.data.data?.length || 0);
      setTickets(ticketsRes.data.data || []);
      
      setLoading(false);
    } catch (error: any) {
      console.error('❌ Error fetching data:', error.response?.data || error.message);
      console.error('❌ Error status:', error.response?.status);
      
      // If token is invalid, clear it and redirect to student portal
      if (error.response?.status === 401) {
        console.log('🔒 Token invalid (401), clearing and redirecting to student portal');
        localStorage.removeItem('authToken');
        // Show a message if it's a token version mismatch
        if (error.response?.data?.code === 'TOKEN_VERSION_MISMATCH') {
          alert('Your permissions have been updated. Please log in again.');
        }
        // Redirect to student portal submit-ticket page (which has login button)
        window.location.href = `/${customUrlPath}/submit-ticket`;
        return;
      }
      
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    // Clear cached branding data on logout
    sessionStorage.removeItem(`branding_${customUrlPath}`);
    navigate(`/${customUrlPath}/submit-ticket`);
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

  // Filter centers based on search
  useEffect(() => {
    if (!ticketSettings?.offlineCenters) return;
    
    let filtered = ticketSettings.offlineCenters;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((center) => {
        if (filterType === 'state') {
          return center.state.toLowerCase().includes(query);
        } else if (filterType === 'city') {
          return center.city.toLowerCase().includes(query);
        } else if (filterType === 'pincode') {
          return center.pincode.includes(query);
        } else {
          return (
            center.centerName.toLowerCase().includes(query) ||
            center.city.toLowerCase().includes(query) ||
            center.state.toLowerCase().includes(query) ||
            center.pincode.includes(query)
          );
        }
      });
    }
    
    setFilteredCenters(filtered);
  }, [searchQuery, filterType, ticketSettings]);

  // Handle form input changes
  const handleInputChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  // Handle file uploads for form fields
  const handleFieldFileChange = (fieldName: string, files: FileList | null, field: OnlineFormField) => {
    if (!files) return;
    
    const fileArray = Array.from(files);
    const maxSize = (field.maxFileSizeMB || 10) * 1024 * 1024;
    
    // Validate file size
    for (const file of fileArray) {
      if (file.size > maxSize) {
        setSubmitError(`File "${file.name}" exceeds maximum size of ${field.maxFileSizeMB || 10}MB`);
        return;
      }
    }
    
    // Validate file types
    if (field.allowedFileTypes && field.allowedFileTypes.length > 0) {
      for (const file of fileArray) {
        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!field.allowedFileTypes.includes(fileExt)) {
          setSubmitError(`File "${file.name}" type not allowed. Allowed: ${field.allowedFileTypes.join(', ')}`);
          return;
        }
      }
    }
    
    setFieldFiles((prev) => ({
      ...prev,
      [fieldName]: field.allowMultiple ? [...(prev[fieldName] || []), ...fileArray] : fileArray,
    }));
  };

  // Remove uploaded file
  const removeFieldFile = (fieldName: string, index: number) => {
    setFieldFiles((prev) => ({
      ...prev,
      [fieldName]: prev[fieldName].filter((_, i) => i !== index),
    }));
  };

  // Submit ticket form
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const formDataToSend = new FormData();
      
      // Add metadata
      formDataToSend.append('projectId', projectBranding.projectId);
      formDataToSend.append('customUrlPath', customUrlPath || '');
      
      // Add form fields
      Object.keys(formData).forEach((key) => {
        const value = formData[key];
        if (Array.isArray(value)) {
          formDataToSend.append(key, JSON.stringify(value));
        } else {
          formDataToSend.append(key, value);
        }
      });

      // Add files
      Object.keys(fieldFiles).forEach((fieldName) => {
        fieldFiles[fieldName].forEach((file) => {
          formDataToSend.append('attachments', file);
        });
      });

      await axios.post(`${API_CONFIG.API_URL}/tickets/student-submit`, formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSubmitSuccess(true);
      setFormData({});
      setFieldFiles({});
      
      // Refresh tickets list
      fetchData();
      
      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      setSubmitError(error.response?.data?.message || 'Failed to submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Render form field based on type
  const renderFormField = (field: OnlineFormField) => {
    const value = formData[field.fieldName] || '';
    const commonClasses = 'w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none';

    switch (field.fieldType) {
      case 'textarea':
        return (
          <textarea
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            rows={4}
            className={`${commonClasses} focus:ring-2`}
            style={{ ['--tw-ring-color' as any]: projectBranding?.primaryColor }}
          />
        );
      case 'dropdown':
        return (
          <select
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            className={`${commonClasses} focus:ring-2`}
            style={{ ['--tw-ring-color' as any]: projectBranding?.primaryColor }}
          >
            <option value="">{field.placeholder}</option>
            {field.options?.map((option, idx) => (
              <option key={idx} value={option}>{option}</option>
            ))}
          </select>
        );
      case 'file':
        return (
          <div>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <DocumentArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <label className="cursor-pointer">
                <span className="text-sm font-medium hover:underline" style={{ color: projectBranding?.primaryColor }}>
                  Choose files
                </span>
                <input
                  type="file"
                  multiple={field.allowMultiple}
                  onChange={(e) => handleFieldFileChange(field.fieldName, e.target.files, field)}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Max size: {field.maxFileSizeMB || 10} MB
                {(field.allowedFileTypes || []).length > 0 && ` | Allowed: ${field.allowedFileTypes?.join(', ')}`}
              </p>
            </div>
            {fieldFiles[field.fieldName] && fieldFiles[field.fieldName].length > 0 && (
              <ul className="mt-4 space-y-2">
                {fieldFiles[field.fieldName].map((file, idx) => (
                  <li key={idx} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                    <span className="text-sm text-gray-700">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFieldFile(field.fieldName, idx)}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      default:
        return (
          <input
            type={field.fieldType}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            className={`${commonClasses} focus:ring-2`}
            style={{ ['--tw-ring-color' as any]: projectBranding?.primaryColor }}
          />
        );
    }
  };

  // Knowledge Base functions
  const handleKbArticleClick = async (article: KBArticle) => {
    setSelectedKbArticle(article);
    
    // Increment view count
    try {
      await axios.post(`${API_CONFIG.API_URL}/kb/${article._id}/view`);
      
      // Update local state
      setKbArticles((prev) =>
        prev.map((a) =>
          a._id === article._id
            ? { ...a, viewCount: a.viewCount + 1 }
            : a
        )
      );
    } catch (error) {
      console.error('Error incrementing view count:', error);
    }
  };

  const handleKbFeedback = async (articleId: string, helpful: boolean) => {
    try {
      const currentVote = articleVotes[articleId];
      const newVoteType: 'helpful' | 'not-helpful' = helpful ? 'helpful' : 'not-helpful';

      // If clicking the same vote, remove it (toggle off)
      if (currentVote === newVoteType) {
        const updatedVotes: Record<string, 'helpful' | 'not-helpful' | null> = { ...articleVotes };
        delete updatedVotes[articleId];
        setArticleVotes(updatedVotes);
        localStorage.setItem('kb_article_votes', JSON.stringify(updatedVotes));

        // Update counts (decrement the vote)
        setKbArticles((prev) =>
          prev.map((article) =>
            article._id === articleId
              ? {
                  ...article,
                  helpfulCount: helpful ? Math.max(0, article.helpfulCount - 1) : article.helpfulCount,
                  notHelpfulCount: !helpful ? Math.max(0, article.notHelpfulCount - 1) : article.notHelpfulCount,
                }
              : article
          )
        );
        
        // Update selected article if it's the same
        if (selectedKbArticle && selectedKbArticle._id === articleId) {
          setSelectedKbArticle((prev) => prev ? {
            ...prev,
            helpfulCount: helpful ? Math.max(0, prev.helpfulCount - 1) : prev.helpfulCount,
            notHelpfulCount: !helpful ? Math.max(0, prev.notHelpfulCount - 1) : prev.notHelpfulCount,
          } : null);
        }
        return;
      }

      // If user already voted differently, prevent changing vote
      if (currentVote && currentVote !== newVoteType) {
        alert('You have already voted on this article. You can only remove your vote by clicking the same button again.');
        return;
      }

      // Submit new vote
      await axios.post(`${API_CONFIG.API_URL}/kb/${articleId}/feedback`, { helpful });

      // Save vote to localStorage
      const updatedVotes: Record<string, 'helpful' | 'not-helpful' | null> = { ...articleVotes, [articleId]: newVoteType };
      setArticleVotes(updatedVotes);
      localStorage.setItem('kb_article_votes', JSON.stringify(updatedVotes));

      // Update counts
      setKbArticles((prev) =>
        prev.map((article) =>
          article._id === articleId
            ? {
                ...article,
                helpfulCount: helpful ? article.helpfulCount + 1 : article.helpfulCount,
                notHelpfulCount: !helpful ? article.notHelpfulCount + 1 : article.notHelpfulCount,
              }
            : article
        )
      );
      
      // Update selected article if it's the same
      if (selectedKbArticle && selectedKbArticle._id === articleId) {
        setSelectedKbArticle((prev) => prev ? {
          ...prev,
          helpfulCount: helpful ? prev.helpfulCount + 1 : prev.helpfulCount,
          notHelpfulCount: !helpful ? prev.notHelpfulCount + 1 : prev.notHelpfulCount,
        } : null);
      }
    } catch (error) {
      console.error('Error submitting KB feedback:', error);
    }
  };

  const getFilteredKbArticles = () => {
    let filtered = kbArticles;

    // Filter by category
    if (kbSelectedCategory !== 'all') {
      filtered = filtered.filter((article) => article.category === kbSelectedCategory);
    }

    // Filter by search query
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

  // Ticket Detail Functions
  const fetchTicketDetail = async (ticketId: string) => {
    setLoadingTicketDetail(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/tickets/${ticketId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedTicket(response.data.data);
    } catch (error: any) {
      console.error('Error fetching ticket detail:', error);
      alert(error.response?.data?.message || 'Failed to fetch ticket details');
      setActiveModule('dashboard');
    } finally {
      setLoadingTicketDetail(false);
    }
  };

  const handleReplyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReplyFiles(Array.from(e.target.files));
    }
  };

  const removeReplyFile = (index: number) => {
    setReplyFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() && replyFiles.length === 0) return;

    setSubmittingReply(true);
    setReplyError(null);
    setReplySuccess(false);

    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('message', replyMessage);

      replyFiles.forEach((file) => {
        formData.append('attachments', file);
      });

      await axios.post(
        `${API_CONFIG.API_URL}/tickets/${selectedTicketId}/reply`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      setReplySuccess(true);
      setReplyMessage('');
      setReplyFiles([]);

      // Refresh ticket data
      if (selectedTicketId) {
        await fetchTicketDetail(selectedTicketId);
      }

      // Scroll to bottom
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (error: any) {
      setReplyError(error.response?.data?.message || 'Failed to submit reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!confirm("Are you sure you want to close this ticket? You won't be able to reopen it.")) {
      return;
    }

    setClosingTicket(true);
    try {
      const token = localStorage.getItem('authToken');
      await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${selectedTicketId}/close`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Ticket closed successfully');
      
      // Refresh ticket data
      if (selectedTicketId) {
        await fetchTicketDetail(selectedTicketId);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to close ticket');
    } finally {
      setClosingTicket(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // Load ticket detail when module changes
  useEffect(() => {
    if (activeModule === 'ticket-detail' && selectedTicketId) {
      fetchTicketDetail(selectedTicketId);
    }
  }, [activeModule, selectedTicketId]);

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
          {/* Left: Menu Toggle + Logo */}
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-white hover:bg-white/10 p-2 rounded-lg transition-colors lg:hidden"
            >
              {sidebarOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>
            {projectBranding?.logoUrl && (
              <img
                src={projectBranding.logoUrl}
                alt={projectBranding.name}
                className="h-10 w-auto"
              />
            )}
            <h1 className="text-xl font-bold text-white hidden sm:block">
              {projectBranding?.name || 'Candidate Portal'}
            </h1>
          </div>

          {/* Right: User Info */}
          <div className="flex items-center space-x-4">
            <LanguageToggle />
            <div className="text-right hidden sm:block">
              <p className="text-white font-medium text-sm">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-white/70 text-xs">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              <span className="hidden sm:inline">{t('logout')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed top-16 left-0 bottom-0 w-64 bg-white border-r border-gray-200 shadow-lg transition-transform duration-300 z-20 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <nav className="p-4 space-y-2">
          {/* Dashboard - Always visible for logged-in users */}
          <button
            onClick={() => setActiveModule('dashboard')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeModule === 'dashboard'
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <HomeIcon className="h-5 w-5" />
            <span>{t('dashboard')}</span>
          </button>

          {/* Submit Ticket - Requires TICKET_CREATE or TICKET_VIEW_OWN permission */}
          {(hasPermission(PERMISSIONS.TICKET_CREATE) || 
            hasPermission(PERMISSIONS.TICKET_VIEW_OWN) || 
            hasPermission(PERMISSIONS.OFFLINE_TICKET_CREATE)) && (
            <button
              onClick={() => setActiveModule('submit-ticket')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                activeModule === 'submit-ticket'
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <TicketIcon className="h-5 w-5" />
              <span>{t('submitTicket')}</span>
            </button>
          )}

          {/* Find Center - Requires OFFLINE_MODULE_ACCESS permission */}
          {hasPermission(PERMISSIONS.OFFLINE_MODULE_ACCESS) && (
            <button
              onClick={() => setActiveModule('find-center')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                activeModule === 'find-center'
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <MapPinIcon className="h-5 w-5" />
              <span>Find Center</span>
            </button>
          )}

          {/* Knowledge Base - Requires KB_VIEW permission */}
          {hasPermission(PERMISSIONS.KB_VIEW) && (
            <button
              onClick={() => setActiveModule('knowledge-base')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                activeModule === 'knowledge-base'
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <BookOpenIcon className="h-5 w-5" />
              <span>Knowledge Base</span>
            </button>
          )}
        </nav>
      </aside>

      {/* Main Content */}
      <main
        className={`pt-16 transition-all duration-300 ${
          sidebarOpen ? 'lg:pl-64' : 'pl-0'
        }`}
      >
        <div className="p-6">
          {/* Dashboard Module */}
          <div style={{ display: activeModule === 'dashboard' ? 'block' : 'none' }}>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('myTickets')}</h2>
              
              {tickets.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                  <TicketIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {t('noTicketsYet')}
                  </h3>
                  <p className="text-gray-500 mb-6">
                    {t('noTicketsMessage')}
                  </p>
                  <button
                    onClick={() => setActiveModule('submit-ticket')}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Submit Your First Ticket
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {tickets.map((ticket) => (
                    <div
                      key={ticket._id}
                      className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setSelectedTicketId(ticket._id);
                        setActiveModule('ticket-detail');
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {ticket.ticketNumber}
                          </h3>
                          <p className="text-gray-600">{ticket.title}</p>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
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
                      </div>
                      
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                        {ticket.description}
                      </p>
                      
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>Category: {ticket.category}</span>
                        <span>
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      
                      {ticket.assignedTo && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-sm text-gray-600">
                            Assigned to:{' '}
                            <span className="font-medium">
                              {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit Ticket Module */}
          <div style={{ display: activeModule === 'submit-ticket' ? 'block' : 'none' }}>
            {ticketSettings && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Submit New Query</h2>
              
              {/* Success Message */}
              {submitSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6 flex items-start space-x-4">
                  <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold text-green-900 mb-1">
                      Query Submitted Successfully!
                    </h3>
                    <p className="text-green-700">
                      {ticketSettings.successMessage || 'Your query has been submitted. Our team will get back to you soon.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 flex items-start space-x-4">
                  <ExclamationCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold text-red-900 mb-1">Submission Error</h3>
                    <p className="text-red-700">{submitError}</p>
                  </div>
                </div>
              )}
              
              <div className="bg-white rounded-xl shadow-md p-8">
                <form onSubmit={handleSubmitTicket} className="space-y-6">
                  {ticketSettings.onlineFormFields.map((field) => (
                    <div key={field.fieldName}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.fieldName}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {renderFormField(field)}
                    </div>
                  ))}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-6 rounded-lg text-white font-semibold shadow-md hover:shadow-lg transform hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: `linear-gradient(135deg, ${projectBranding.primaryColor} 0%, ${projectBranding.secondaryColor} 100%)`,
                    }}
                  >
                    {submitting ? 'Submitting...' : 'Submit Query'}
                  </button>
                </form>
              </div>
            </div>
            )}
          </div>

          {/* Find Center Module */}
          <div style={{ display: activeModule === 'find-center' ? 'block' : 'none' }}>
            {ticketSettings && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Find Nearest Center</h2>
              
              <div className="bg-white rounded-xl shadow-md p-8">
                {/* Filter Buttons */}
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setFilterType('all');
                      setSearchQuery('');
                    }}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      filterType === 'all' ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{ backgroundColor: filterType === 'all' ? projectBranding.primaryColor : undefined }}
                  >
                    All Centers
                  </button>
                  <button
                    onClick={() => {
                      setFilterType('state');
                      setSearchQuery('');
                    }}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      filterType === 'state' ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{ backgroundColor: filterType === 'state' ? projectBranding.primaryColor : undefined }}
                  >
                    By State
                  </button>
                  <button
                    onClick={() => {
                      setFilterType('city');
                      setSearchQuery('');
                    }}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      filterType === 'city' ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{ backgroundColor: filterType === 'city' ? projectBranding.primaryColor : undefined }}
                  >
                    By City
                  </button>
                  <button
                    onClick={() => {
                      setFilterType('pincode');
                      setSearchQuery('');
                    }}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      filterType === 'pincode' ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{ backgroundColor: filterType === 'pincode' ? projectBranding.primaryColor : undefined }}
                  >
                    By Pincode
                  </button>
                </div>

                {/* Search */}
                <div className="mb-6">
                  <input
                    type="text"
                    placeholder={
                      filterType === 'state'
                        ? 'Search by state...'
                        : filterType === 'city'
                        ? 'Search by city...'
                        : filterType === 'pincode'
                        ? 'Search by pincode...'
                        : 'Search by city, state, or pincode...'
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:outline-none"
                    style={{ ['--tw-ring-color' as any]: projectBranding?.primaryColor }}
                  />
                </div>

                {/* Centers List */}
                <div className="space-y-6">
                  {filteredCenters.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No centers found</p>
                  ) : (
                    filteredCenters.map((center, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">{center.centerName}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-start space-x-3">
                            <MapPinIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-gray-700">Address</p>
                              <p className="text-sm text-gray-600">
                                {center.address}, {center.city}, {center.state} - {center.pincode}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-3">
                            <PhoneIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-gray-700">Phone</p>
                              <p className="text-sm text-gray-600">{center.phone}</p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-3">
                            <EnvelopeIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-gray-700">Email</p>
                              <p className="text-sm text-gray-600">{center.email}</p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-3">
                            <ClockIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-gray-700">Working Hours</p>
                              <p className="text-sm text-gray-600">{center.workingHours}</p>
                            </div>
                          </div>
                        </div>

                        {/* Features */}
                        {center.features && center.features.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <p className="text-sm font-medium text-gray-700 mb-2">Available Features</p>
                            <div className="flex flex-wrap gap-2">
                              {center.features.map((feature, featureIdx) => (
                                <span key={featureIdx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {feature}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Get Directions Button */}
                        <div className="mt-4">
                          <button
                            onClick={() => {
                              let mapUrl = center.mapLink || center.googleMapLink;
                              if (!mapUrl && center.latitude && center.longitude) {
                                mapUrl = `https://www.google.com/maps?q=${center.latitude},${center.longitude}`;
                              } else if (!mapUrl) {
                                mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  `${center.address}, ${center.city}, ${center.state} ${center.pincode}`
                                )}`;
                              }
                              window.open(mapUrl, '_blank');
                            }}
                            className="w-full py-3 px-4 rounded-lg text-white font-semibold shadow hover:shadow-lg transition-all"
                            style={{
                              background: `linear-gradient(135deg, ${projectBranding?.primaryColor} 0%, ${projectBranding?.secondaryColor} 100%)`,
                            }}
                          >
                            🗺️ Get Directions
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Knowledge Base Module */}
          <div style={{ display: activeModule === 'knowledge-base' ? 'block' : 'none' }}>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Knowledge Base</h2>
              
              {/* Search and Filter */}
              <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Search */}
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search articles..."
                      value={kbSearchQuery}
                      onChange={(e) => setKbSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Category Filter */}
                  <div>
                    <select
                      value={kbSelectedCategory}
                      onChange={(e) => setKbSelectedCategory(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              </div>

              {/* Articles Grid or Detail View */}
              {!selectedKbArticle ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {getFilteredKbArticles().length === 0 ? (
                    <div className="col-span-full bg-white rounded-xl shadow-sm p-12 text-center">
                      <BookOpenIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">
                        {kbSearchQuery || kbSelectedCategory !== 'all'
                          ? 'No articles found matching your search.'
                          : 'No articles available yet.'}
                      </p>
                    </div>
                  ) : (
                    getFilteredKbArticles().map((article) => (
                      <div
                        key={article._id}
                        onClick={() => handleKbArticleClick(article)}
                        className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer hover:-translate-y-1 p-6 border border-gray-100"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-3 line-clamp-2">
                          {article.title}
                        </h3>

                        {article.category && (
                          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full mb-4">
                            {article.category}
                          </span>
                        )}

                        <div className="flex items-center space-x-4 text-sm text-gray-500 mt-4">
                          <span className="flex items-center space-x-1">
                            <EyeIcon className="h-4 w-4" />
                            <span>{article.viewCount}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <HandThumbUpIcon className="h-4 w-4" />
                            <span>{article.helpfulCount}</span>
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                /* Article Detail View */
                <div>
                  <button
                    onClick={() => setSelectedKbArticle(null)}
                    className="mb-6 flex items-center space-x-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <ArrowLeftIcon className="h-4 w-4" />
                    <span>Back to Articles</span>
                  </button>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">
                      {selectedKbArticle.title}
                    </h1>

                    <div className="flex items-center space-x-6 text-sm text-gray-500 mb-6 pb-6 border-b border-gray-200">
                      {selectedKbArticle.category && (
                        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                          {selectedKbArticle.category}
                        </span>
                      )}
                      <span className="flex items-center space-x-1">
                        <EyeIcon className="h-4 w-4" />
                        <span>{selectedKbArticle.viewCount} views</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <HandThumbUpIcon className="h-4 w-4" />
                        <span>{selectedKbArticle.helpfulCount} helpful</span>
                      </span>
                    </div>

                    <div
                      className="prose prose-blue max-w-none mb-8 text-gray-700 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedKbArticle.content) }}
                    />

                    {/* Feedback Section */}
                    <div className="mt-8 pt-8 border-t border-gray-200">
                      <p className="text-base font-semibold text-gray-900 mb-4">
                        Was this article helpful?
                      </p>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleKbFeedback(selectedKbArticle._id, true)}
                          className={`flex items-center space-x-2 px-6 py-3 text-sm font-medium rounded-lg transition-all ${
                            articleVotes[selectedKbArticle._id] === 'helpful'
                              ? 'bg-green-600 text-white shadow-lg'
                              : 'bg-white text-green-600 border-2 border-green-600 hover:bg-green-50'
                          }`}
                          title={articleVotes[selectedKbArticle._id] === 'helpful' ? 'Click to remove your vote' : 'Mark as helpful'}
                        >
                          <HandThumbUpIcon className="h-5 w-5" />
                          <span>Yes</span>
                        </button>
                        <button
                          onClick={() => handleKbFeedback(selectedKbArticle._id, false)}
                          className={`flex items-center space-x-2 px-6 py-3 text-sm font-medium rounded-lg transition-all ${
                            articleVotes[selectedKbArticle._id] === 'not-helpful'
                              ? 'bg-red-600 text-white shadow-lg'
                              : 'bg-white text-red-600 border-2 border-red-600 hover:bg-red-50'
                          }`}
                          title={articleVotes[selectedKbArticle._id] === 'not-helpful' ? 'Click to remove your vote' : 'Mark as not helpful'}
                        >
                          <HandThumbDownIcon className="h-5 w-5" />
                          <span>No</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Ticket Detail Module */}
          <div style={{ display: activeModule === 'ticket-detail' ? 'block' : 'none' }}>
            <div className="space-y-6">
              {/* Header with Back Button */}
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => {
                    setActiveModule('dashboard');
                    setSelectedTicket(null);
                    setSelectedTicketId(null);
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                  <span>Back to My Tickets</span>
                </button>
              </div>

              {loadingTicketDetail ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : selectedTicket ? (
                <>
                  {/* Success/Error Messages */}
                  {replySuccess && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start space-x-3">
                      <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-green-900">Reply sent successfully!</h3>
                      </div>
                    </div>
                  )}

                  {replyError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
                      <ExclamationCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-red-900">Error</h3>
                        <p className="text-sm text-red-700">{replyError}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Ticket Info */}
                      <div className="bg-white rounded-xl shadow-sm p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="text-sm text-gray-500 mb-1">{selectedTicket.ticketNumber}</p>
                            <h2 className="text-2xl font-bold text-gray-900">{selectedTicket.title}</h2>
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                selectedTicket.status
                              )}`}
                            >
                              {selectedTicket.status.replace('-', ' ').toUpperCase()}
                            </span>
                            <span className={`text-xs font-medium ${getPriorityColor(selectedTicket.priority)}`}>
                              {selectedTicket.priority.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <div className="prose max-w-none">
                          <p className="text-gray-700 whitespace-pre-wrap">{selectedTicket.description}</p>
                        </div>

                        {/* Original Attachments */}
                        {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h3 className="text-sm font-medium text-gray-700 mb-2">Attachments:</h3>
                            <div className="space-y-2">
                              {selectedTicket.attachments.map((file, idx) => (
                                <a
                                  key={idx}
                                  href={`${API_CONFIG.BASE_URL}{file.path}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-700"
                                >
                                  <PaperClipIcon className="h-4 w-4" />
                                  <span>{file.filename}</span>
                                  <span className="text-gray-400">({formatFileSize(file.size)})</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Threads/Replies */}
                      {selectedTicket.threads && selectedTicket.threads.length > 0 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-gray-900">Conversation</h3>
                          {selectedTicket.threads.map((thread) => (
                            <div key={thread._id} className="bg-white rounded-xl shadow-sm p-6">
                              <div className="flex items-start space-x-3">
                                <div className="flex-shrink-0">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                                    {thread.createdBy.firstName.charAt(0)}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {thread.createdBy.firstName} {thread.createdBy.lastName}
                                        <span className="ml-2 text-xs text-gray-500">
                                          ({thread.createdBy.role.name})
                                        </span>
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {new Date(thread.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                  </div>
                                  <p className="text-gray-700 whitespace-pre-wrap">{thread.message}</p>

                                  {/* Thread Attachments */}
                                  {thread.attachments && thread.attachments.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                      {thread.attachments.map((file, idx) => (
                                        <a
                                          key={idx}
                                          href={`${API_CONFIG.BASE_URL}{file.path}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-700"
                                        >
                                          <PaperClipIcon className="h-4 w-4" />
                                          <span>{file.filename}</span>
                                          <span className="text-gray-400">({formatFileSize(file.size)})</span>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply Form (only if ticket is not closed) */}
                      {selectedTicket.status !== 'closed' && (
                        <div className="bg-white rounded-xl shadow-sm p-6">
                          <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Reply</h3>
                          <form onSubmit={handleReplySubmit} className="space-y-4">
                            <div>
                              <textarea
                                value={replyMessage}
                                onChange={(e) => setReplyMessage(e.target.value)}
                                placeholder="Type your message..."
                                rows={4}
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                              />
                            </div>

                            {/* File Upload */}
                            <div>
                              <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                                <DocumentArrowUpIcon className="h-6 w-6 text-gray-400 mr-2" />
                                <span className="text-sm text-gray-600">Attach files (optional)</span>
                                <input
                                  type="file"
                                  multiple
                                  onChange={handleReplyFileChange}
                                  className="hidden"
                                />
                              </label>

                              {/* Selected Files */}
                              {replyFiles.length > 0 && (
                                <ul className="mt-3 space-y-2">
                                  {replyFiles.map((file, idx) => (
                                    <li
                                      key={idx}
                                      className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                                    >
                                      <span className="text-sm text-gray-700">{file.name}</span>
                                      <button
                                        type="button"
                                        onClick={() => removeReplyFile(idx)}
                                        className="text-red-600 hover:text-red-700"
                                      >
                                        <XMarkIcon className="h-5 w-5" />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <button
                              type="submit"
                              disabled={submittingReply}
                              className="w-full py-3 px-6 rounded-lg text-white font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{
                                background: projectBranding
                                  ? `linear-gradient(135deg, ${projectBranding.primaryColor} 0%, ${projectBranding.secondaryColor} 100%)`
                                  : 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                              }}
                            >
                              {submittingReply ? 'Sending...' : 'Send Reply'}
                            </button>
                          </form>
                        </div>
                      )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                      {/* Ticket Details */}
                      <div className="bg-white rounded-xl shadow-sm p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Query Information</h3>
                        <dl className="space-y-3">
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Category</dt>
                            <dd className="text-sm text-gray-900 mt-1">{selectedTicket.category}</dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Created</dt>
                            <dd className="text-sm text-gray-900 mt-1">
                              {new Date(selectedTicket.createdAt).toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                            <dd className="text-sm text-gray-900 mt-1">
                              {new Date(selectedTicket.updatedAt).toLocaleString()}
                            </dd>
                          </div>
                          {selectedTicket.assignedTo && (
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Assigned To</dt>
                              <dd className="text-sm text-gray-900 mt-1">
                                {selectedTicket.assignedTo.firstName} {selectedTicket.assignedTo.lastName}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>

                      {/* Close Ticket Button */}
                      {allowStudentToCloseTicket && selectedTicket.status !== 'closed' && (
                        <div className="bg-white rounded-xl shadow-sm p-6">
                          <h3 className="text-lg font-semibold text-gray-900 mb-3">Actions</h3>
                          <button
                            onClick={handleCloseTicket}
                            disabled={closingTicket}
                            className="w-full py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {closingTicket ? 'Closing...' : 'Close Ticket'}
                          </button>
                          <p className="text-xs text-gray-500 mt-2">
                            Once closed, you won't be able to reopen this ticket.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600">Ticket not found</p>
                </div>
              )}
            </div>
          </div>
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

export default StudentDashboard;
