import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import { API_CONFIG } from '../config/constants';
import {
  ArrowLeftIcon,
  PaperClipIcon,
  PaperAirplaneIcon,
  UserIcon,
  ClockIcon,
  TagIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowUpIcon,
} from '@heroicons/react/24/outline';

interface Ticket {
  _id: string;
  ticketNumber: string;
  title: string;
  subject?: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
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
  metadata?: {
    studentName?: string;
    studentEmail?: string;
    studentPhone?: string;
    projectId?: string;
  };
  tags?: string[];
  threads?: Thread[];
  internalNotes?: InternalNote[];
  attachments?: Attachment[];
  escalationHistory?: EscalationRecord[];
}

interface Thread {
  _id?: string;
  message: string;
  createdBy: {
    _id?: string;
    firstName: string;
    lastName: string;
    email: string;
    role?: string;
  };
  createdAt: string;
  attachments?: Array<{
    filename: string;
    originalName: string;
    path: string;
    mimetype: string;
    size: number;
  }>;
  isSystemMessage?: boolean;
}

interface InternalNote {
  _id: string;
  note: string;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

interface Attachment {
  filename: string;
  path: string;
  size: number;
  uploadedAt: string;
}

interface EscalationRecord {
  _id: string;
  escalatedTo: {
    firstName: string;
    lastName: string;
    email: string;
  };
  escalatedBy: {
    firstName: string;
    lastName: string;
  };
  reason: string;
  escalatedAt: string;
}

interface Category {
  _id: string;
  name: string;
}

interface EscalationContact {
  _id: string;
  name: string;
  email: string;
  role: string;
  priority: string;
}

interface ProjectConfiguration {
  ticketSubmissionSettings: {
    onlineFormFields: Array<{
      fieldName: string;
      fieldType: string;
      required: boolean;
      options?: string[];
    }>;
  };
}

interface SLARule {
  _id: string;
  name: string;
  description: string;
  priority: string;
  responseTime: {
    value: number;
    unit: string;
  };
  resolutionTime: {
    value: number;
    unit: string;
  };
  isActive: boolean;
}

interface EscalationPolicy {
  _id: string;
  name: string;
  description: string;
  policyId: string;
  isActive: boolean;
  levels: Array<{
    level: number;
    escalateAfter: {
      value: number;
      unit: string;
    };
    escalateTo: {
      type: string;
      targetId: string;
      targetName: string;
    };
  }>;
}

interface AgentTicketDetailProps {
  wrapWithLayout?: boolean;
}

const AgentTicketDetail: React.FC<AgentTicketDetailProps> = ({ wrapWithLayout = true }) => {
  const { id: ticketId, customUrlPath } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'replies' | 'notes' | 'history'>('details');
  
  // Reply states
  const [replyMessage, setReplyMessage] = useState('');
  const [replyFiles, setReplyFiles] = useState<FileList | null>(null);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Internal note states
  const [noteText, setNoteText] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Edit states
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isEditingPriority, setIsEditingPriority] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);

  const [newStatus, setNewStatus] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newTag, setNewTag] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [selectedEscalationContact, setSelectedEscalationContact] = useState('');

  // Master data
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [escalationContacts, setEscalationContacts] = useState<EscalationContact[]>([]);
  const [projectConfig, setProjectConfig] = useState<ProjectConfiguration | null>(null);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);

  useEffect(() => {
    fetchTicketDetails();
    fetchMasterData();
  }, [ticketId]);

  const fetchTicketDetails = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        console.error('No authentication token found');
        alert('Session expired. Please log in again.');
        navigate(`/${customUrlPath}/portal/login`);
        return;
      }

      if (!ticketId) {
        console.error('No ticket ID provided');
        alert('Invalid ticket ID');
        navigate(`/${customUrlPath}/portal/tickets`);
        return;
      }

      console.log('Fetching ticket:', ticketId);
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/${ticketId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      console.log('Ticket response:', response.data);
      
      if (response.data.success && response.data.data) {
        console.log('📋 Setting ticket with status:', response.data.data.status);
        setTicket(response.data.data);
      } else if (response.data && !response.data.success) {
        console.error('API returned error:', response.data.message);
        alert(`Error: ${response.data.message || 'Failed to load ticket'}`);
      } else {
        // Handle case where data is directly in response
        setTicket(response.data);
      }
    } catch (error: any) {
      console.error('Error fetching ticket:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      
      if (error.response?.status === 401) {
        alert('Session expired. Please log in again.');
        navigate(`/${customUrlPath}/portal/login`);
      } else if (error.response?.status === 404) {
        alert('Ticket not found');
        navigate(`/${customUrlPath}/portal/tickets`);
      } else if (error.request) {
        alert('Cannot connect to server. Please check if the backend is running.');
      } else {
        alert(`Error loading ticket: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterData = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const projectContext = JSON.parse(localStorage.getItem('projectContext') || '{}');

      // Fetch ticket configuration (statuses, priorities, categories)
      if (projectContext.projectId) {
        const ticketConfigRes = await axios.get(
          `${API_CONFIG.API_URL}/projects/${projectContext.projectId}/ticket-settings`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        
        if (ticketConfigRes.data.success && ticketConfigRes.data.data) {
          const ticketConfig = ticketConfigRes.data.data;
          
          // Set statuses from Status master table
          if (ticketConfig.allowedStatuses && ticketConfig.allowedStatuses.length > 0) {
            // Map status objects to lowercase codes for the dropdown
            const statusCodes = ticketConfig.allowedStatuses.map((status: any) => 
              status.code ? status.code.toLowerCase() : status
            );
            setStatusOptions(statusCodes);
          }
          
          // Set categories from add project form
          if (ticketConfig.categories && ticketConfig.categories.length > 0) {
            setCategories(ticketConfig.categories.map((cat: string) => ({ 
              _id: cat, 
              name: cat 
            })));
          }
          
          // Set priorities from SLA Rules
          if (ticketConfig.allowedPriorities && ticketConfig.allowedPriorities.length > 0) {
            setPriorityOptions(ticketConfig.allowedPriorities);
          }
        }
      }

      // Fetch available tags
      const tagsRes = await axios.get(
        `${API_CONFIG.API_URL}/tickets/tags`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setAvailableTags(tagsRes.data.data || []);

      // Fetch escalation contacts
      console.log('🔍 Fetching escalation policies for projectId:', projectContext.projectId);
      
      if (projectContext.projectId) {
        try {
          const escalationContactsRes = await axios.get(
            `${API_CONFIG.API_URL}/escalation-policies?projectId=${projectContext.projectId}&isActive=true`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          
          console.log('📋 Escalation Policies Response:', escalationContactsRes.data);
          
          // Transform escalation policies into contact format for the dropdown
          const policies = escalationContactsRes.data.data || [];
          console.log('📋 Policies array:', policies);
          console.log('📋 Number of policies:', policies.length);
          
          const contacts = policies.flatMap((policy: any) => {
            console.log('📋 Processing policy:', policy.name, 'Levels:', policy.levels);
            return (policy.levels || []).flatMap((level: any) => {
              // If level has users array, create a contact for each user
              if (level.users && level.users.length > 0) {
                return level.users.map((user: any) => {
                  const contact = {
                    _id: `${policy._id}-L${level.level}-${user._id}`,
                    name: `${user.firstName} ${user.lastName}`,
                    email: user.email,
                    role: user.role?.name || level.escalateTo?.targetName || 'N/A',
                    priority: policy.name || '',
                    userId: user._id,
                  };
                  console.log('📋 Created contact from user:', contact);
                  return contact;
                });
              } else {
                // Fallback to old format if no users found
                const contact = {
                  _id: `${policy._id}-L${level.level}`,
                  name: level.escalateTo?.targetName || `Level ${level.level}`,
                  email: level.escalateTo?.targetId || '',
                  role: level.escalateTo?.type || 'role',
                  priority: policy.name || '',
                };
                console.log('📋 Created contact (fallback):', contact);
                return [contact];
              }
            });
          });
          
          console.log('📋 Final contacts array:', contacts);
          console.log('📋 Number of contacts:', contacts.length);
          setEscalationContacts(contacts);
        } catch (escalationError) {
          console.error('❌ Error fetching escalation policies:', escalationError);
          if (axios.isAxiosError(escalationError)) {
            console.error('❌ Response:', escalationError.response?.data);
            console.error('❌ Status:', escalationError.response?.status);
          }
        }
      } else {
        console.warn('⚠️ No projectId available, skipping escalation policies fetch');
      }
    } catch (error) {
      console.error('❌ Error fetching master data:', error);
      if (axios.isAxiosError(error)) {
        console.error('❌ Response:', error.response?.data);
      }
    }
  };

  const handleUpdateStatus = async (statusOverride?: string) => {
    const statusToUpdate = statusOverride || newStatus;
    if (!statusToUpdate || !ticket) return;

    console.log('🔄 Updating status to:', statusToUpdate);

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/status`,
        { status: statusToUpdate },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      console.log('✅ Status update response:', response.data);
      
      // Refresh ticket details to get updated data
      await fetchTicketDetails();
      
      console.log('🔄 Ticket refreshed, new status should be:', statusToUpdate);
      
      setIsEditingStatus(false);
      setNewStatus('');
    } catch (error) {
      console.error('❌ Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const handleUpdateCategory = async () => {
    if (!newCategory || !ticket) return;

    try {
      const token = localStorage.getItem('authToken');
      await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/category`,
        { category: newCategory },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      // Refresh ticket details to get updated data
      await fetchTicketDetails();
      setIsEditingCategory(false);
      setNewCategory('');
    } catch (error) {
      console.error('Error updating category:', error);
      alert('Failed to update category');
    }
  };

  const handleUpdatePriority = async (priorityOverride?: string) => {
    const priorityToUpdate = priorityOverride || newPriority;
    if (!priorityToUpdate || !ticket) return;

    console.log('🔄 Updating priority to:', priorityToUpdate);

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/priority`,
        { priority: priorityToUpdate },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      console.log('✅ Priority update response:', response.data);
      
      // Refresh ticket details to get updated data
      await fetchTicketDetails();
      
      console.log('🔄 Ticket refreshed, new priority should be:', priorityToUpdate);
      
      setIsEditingPriority(false);
      setNewPriority('');
    } catch (error) {
      console.error('❌ Error updating priority:', error);
      alert('Failed to update priority');
    }
  };

  const handleAddTag = async () => {
    if (!newTag || !ticket) return;

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/tags`,
        { tag: newTag },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setTicket({ ...ticket, tags: [...(ticket.tags || []), newTag] });
      setIsAddingTag(false);
      setNewTag('');
      // Refresh available tags
      fetchMasterData();
    } catch (error) {
      console.error('Error adding tag:', error);
      alert('Failed to add tag');
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!ticket) return;

    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/tags/${tag}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setTicket({ ...ticket, tags: ticket.tags?.filter(t => t !== tag) });
    } catch (error) {
      console.error('Error removing tag:', error);
      alert('Failed to remove tag');
    }
  };

  const handleEscalate = async () => {
    if (!selectedEscalationContact || !escalationReason || !ticket) return;

    try {
      const token = localStorage.getItem('authToken');
      await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/escalate`,
        {
          escalateTo: selectedEscalationContact,
          reason: escalationReason,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setIsEscalating(false);
      setEscalationReason('');
      setSelectedEscalationContact('');
      fetchTicketDetails();
      alert('Ticket escalated successfully');
    } catch (error) {
      console.error('Error escalating ticket:', error);
      alert('Failed to escalate ticket');
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || !ticket) return;

    setIsSubmittingReply(true);
    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('message', replyMessage);
      formData.append('isInternal', 'false');

      if (replyFiles) {
        Array.from(replyFiles).forEach((file) => {
          formData.append('attachments', file);
        });
      }

      await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/reply`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      setReplyMessage('');
      setReplyFiles(null);
      fetchTicketDetails();
    } catch (error) {
      console.error('Error submitting reply:', error);
      alert('Failed to submit reply');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !ticket) return;

    setIsAddingNote(true);
    try {
      const token = localStorage.getItem('authToken');
      await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/notes`,
        { note: noteText },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setNoteText('');
      fetchTicketDetails();
    } catch (error) {
      console.error('Error adding note:', error);
      alert('Failed to add internal note');
    } finally {
      setIsAddingNote(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'open': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'in-progress': 'bg-blue-100 text-blue-800 border-blue-300',
      'pending': 'bg-pink-100 text-pink-800 border-pink-300',
      'resolved': 'bg-green-100 text-green-800 border-green-300',
      'closed': 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return colors[status?.toLowerCase()] || colors.open;
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      'Critical': 'bg-red-100 text-red-800',
      'critical': 'bg-red-100 text-red-800',
      'Urgent': 'bg-orange-100 text-orange-800',
      'urgent': 'bg-orange-100 text-orange-800',
      'High': 'bg-yellow-100 text-yellow-800',
      'high': 'bg-yellow-100 text-yellow-800',
      'Normal': 'bg-blue-100 text-blue-800',
      'Medium': 'bg-blue-100 text-blue-800',
      'medium': 'bg-blue-100 text-blue-800',
      'Low': 'bg-gray-100 text-gray-800',
      'low': 'bg-gray-100 text-gray-800',
    };
    return colors[priority] || colors['Normal'];
  };

  if (loading) {
    const loadingContent = (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
    return wrapWithLayout ? (
      <DashboardLayout>
        {loadingContent}
      </DashboardLayout>
    ) : (
      loadingContent
    );
  }

  if (!ticket) {
    const errorContent = (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ticket Not Found</h2>
          <p className="text-gray-600 mb-4">The ticket you're looking for doesn't exist or you don't have access.</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
    return wrapWithLayout ? (
      <DashboardLayout>
        {errorContent}
      </DashboardLayout>
    ) : (
      errorContent
    );
  }

  const content = (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
                </button>
                <div>
                  <div className="flex items-center space-x-3">
                    <h1 className="text-2xl font-bold text-gray-900">
                      #{ticket.ticketNumber}
                    </h1>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(ticket.status)}`}>
                      {ticket.status}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Created {new Date(ticket.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Ticket Details Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {ticket.title || ticket.subject || 'No Subject'}
              </h2>
              <div className="prose max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
              </div>

              {ticket.attachments && ticket.attachments.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Attachments</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {ticket.attachments.map((attachment, index) => (
                      <a
                        key={index}
                        href={`${API_CONFIG.BASE_URL}/${attachment.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <PaperClipIcon className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-700 truncate">{attachment.filename}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="border-b border-gray-200">
                <div className="flex space-x-8 px-6">
                  <button
                    onClick={() => setActiveTab('replies')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'replies'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <ChatBubbleLeftRightIcon className="h-5 w-5 inline-block mr-2" />
                    Replies
                  </button>
                  <button
                    onClick={() => setActiveTab('notes')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'notes'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <DocumentTextIcon className="h-5 w-5 inline-block mr-2" />
                    Internal Notes
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'history'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <ClockIcon className="h-5 w-5 inline-block mr-2" />
                    History
                  </button>
                </div>
              </div>

              <div className="p-6">
                {/* Replies Tab */}
                {activeTab === 'replies' && (
                  <div className="space-y-6">
                    {/* Reply Form */}
                    <form onSubmit={handleSubmitReply} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Add Reply
                        </label>
                        <textarea
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          rows={4}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Type your reply here..."
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Attachments (optional)
                        </label>
                        <input
                          type="file"
                          multiple
                          onChange={(e) => setReplyFiles(e.target.files)}
                          className="w-full"
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isSubmittingReply}
                          className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmittingReply ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <PaperAirplaneIcon className="h-5 w-5" />
                              <span>Send Reply</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>

                    <div className="border-t border-gray-200 pt-6">
                      {/* Conversation Thread */}
                      {ticket.threads && ticket.threads.length > 0 ? (
                        <div className="space-y-4">
                          {ticket.threads.map((thread, idx) => (
                            <div
                              key={thread._id || idx}
                              className={`p-4 rounded-lg ${
                                thread.isSystemMessage
                                  ? 'bg-blue-50 border border-blue-200'
                                  : 'bg-gray-50 border border-gray-200'
                              }`}
                            >
                              <div className="flex items-start space-x-3">
                                <div className="flex-shrink-0">
                                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                    <UserIcon className="h-6 w-6 text-blue-600" />
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {thread.createdBy.firstName} {thread.createdBy.lastName}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {new Date(thread.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                    {thread.isSystemMessage && (
                                      <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded">
                                        System
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-gray-700 whitespace-pre-wrap">{thread.message}</p>
                                  {thread.attachments && thread.attachments.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {thread.attachments.map((attachment, idx) => (
                                        <a
                                          key={idx}
                                          href={`${API_CONFIG.BASE_URL}${attachment.path}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                                        >
                                          <PaperClipIcon className="h-3 w-3" />
                                          <span>{attachment.originalName}</span>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-gray-500 py-8">No messages yet</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Internal Notes Tab */}
                {activeTab === 'notes' && (
                  <div className="space-y-6">
                    {/* Add Note Form */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Add Internal Note
                          <span className="text-xs text-gray-500 ml-2">(Not visible to students)</span>
                        </label>
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          rows={3}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Add internal notes for your team..."
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={handleAddNote}
                          disabled={isAddingNote || !noteText.trim()}
                          className="flex items-center space-x-2 px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAddingNote ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Adding...</span>
                            </>
                          ) : (
                            <>
                              <DocumentTextIcon className="h-5 w-5" />
                              <span>Add Note</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-6">
                      {/* Notes List */}
                      {ticket.internalNotes && ticket.internalNotes.length > 0 ? (
                        <div className="space-y-3">
                          {ticket.internalNotes.map((note) => (
                            <div key={note._id} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <div className="flex items-start space-x-3">
                                <DocumentTextIcon className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-1" />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-sm font-medium text-gray-900">
                                      {note.createdBy.firstName} {note.createdBy.lastName}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {new Date(note.createdAt).toLocaleString()}
                                    </p>
                                  </div>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.note}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-gray-500 py-8">No internal notes yet</p>
                      )}
                    </div>
                  </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                  <div className="space-y-4">
                    {ticket.escalationHistory && ticket.escalationHistory.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-900">Escalation History</h3>
                        {ticket.escalationHistory.map((record) => (
                          <div key={record._id} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-start space-x-3">
                              <ArrowUpIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-1" />
                              <div>
                                <p className="text-sm text-gray-900">
                                  Escalated to <span className="font-medium">{record.escalatedTo.firstName} {record.escalatedTo.lastName}</span>
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                  By {record.escalatedBy.firstName} {record.escalatedBy.lastName}
                                </p>
                                <p className="text-sm text-gray-700 mt-2">{record.reason}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(record.escalatedAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-8">No escalation history</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Ticket Info Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Query Information</h3>
              
              <div className="space-y-4">
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={ticket.status}
                    onChange={(e) => {
                      const newStatusValue = e.target.value;
                      setNewStatus(newStatusValue);
                      // Call update directly with the new value
                      handleUpdateStatus(newStatusValue);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={ticket.priority}
                    onChange={(e) => {
                      const newPriorityValue = e.target.value;
                      setNewPriority(newPriorityValue);
                      // Call update directly with the new value
                      handleUpdatePriority(newPriorityValue);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {priorityOptions.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select
                    value={ticket.category}
                    onChange={(e) => {
                      setNewCategory(e.target.value);
                      // Auto-save on change
                      setTimeout(() => handleUpdateCategory(), 100);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assigned To */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assigned To</label>
                  <div className="flex items-center space-x-2">
                    <UserIcon className="h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-900">
                      {ticket.assignedTo
                        ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
                        : 'Unassigned'}
                    </span>
                  </div>
                </div>

                {/* Requester */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Requester</label>
                  <div className="space-y-1">
                    {ticket.metadata?.studentName && (
                      <p className="text-sm text-gray-900">{ticket.metadata.studentName}</p>
                    )}
                    {ticket.metadata?.studentEmail && (
                      <p className="text-sm text-gray-600">{ticket.metadata.studentEmail}</p>
                    )}
                    {ticket.metadata?.studentPhone && (
                      <p className="text-sm text-gray-600">{ticket.metadata.studentPhone}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tags Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Tags</h3>
                <button
                  onClick={() => setIsAddingTag(true)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  + Add
                </button>
              </div>

              {isAddingTag && (
                <div className="mb-4 space-y-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Enter tag name"
                    list="available-tags"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <datalist id="available-tags">
                    {availableTags.map((tag, index) => (
                      <option key={index} value={tag} />
                    ))}
                  </datalist>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleAddTag}
                      className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingTag(false);
                        setNewTag('');
                      }}
                      className="flex-1 px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {ticket.tags && ticket.tags.length > 0 ? (
                  ticket.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                    >
                      <TagIcon className="h-3 w-3" />
                      <span>{tag}</span>
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:text-blue-900"
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No tags added</p>
                )}
              </div>
            </div>

            {/* Escalate Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Escalate Ticket</h3>

              {isEscalating ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Escalate To ({escalationContacts.length} contacts available)
                    </label>
                    <select
                      value={selectedEscalationContact}
                      onChange={(e) => {
                        console.log('🔍 Dropdown changed to:', e.target.value);
                        setSelectedEscalationContact(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select contact ({escalationContacts.length} available)</option>
                      {escalationContacts.length === 0 && (
                        <option value="" disabled>No contacts available</option>
                      )}
                      {escalationContacts.map((contact) => {
                        console.log('🔍 Rendering option:', contact.name, contact.role);
                        return (
                          <option key={contact._id} value={contact._id}>
                            {contact.name} - {contact.role}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for Escalation
                    </label>
                    <textarea
                      value={escalationReason}
                      onChange={(e) => setEscalationReason(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Explain why this ticket needs escalation..."
                    />
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={handleEscalate}
                      disabled={!selectedEscalationContact || !escalationReason}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ExclamationTriangleIcon className="h-5 w-5" />
                      <span>Escalate</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsEscalating(false);
                        setEscalationReason('');
                        setSelectedEscalationContact('');
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    console.log('🚀 Escalate button clicked!');
                    console.log('📋 Current escalationContacts:', escalationContacts);
                    console.log('📋 Number of contacts:', escalationContacts.length);
                    setIsEscalating(true);
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100"
                >
                  <ArrowUpIcon className="h-5 w-5" />
                  <span>Escalate This Ticket</span>
                </button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    if (confirm('Mark this ticket as resolved?')) {
                      handleUpdateStatus('resolved');
                    }
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100"
                >
                  <CheckCircleIcon className="h-5 w-5" />
                  <span>Mark as Resolved</span>
                </button>

                <button
                  onClick={() => {
                    if (confirm('Close this ticket?')) {
                      handleUpdateStatus('closed');
                    }
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100"
                >
                  <XCircleIcon className="h-5 w-5" />
                  <span>Close Ticket</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return wrapWithLayout ? (
    <DashboardLayout>
      {content}
    </DashboardLayout>
  ) : (
    content
  );
};

export default AgentTicketDetail;
