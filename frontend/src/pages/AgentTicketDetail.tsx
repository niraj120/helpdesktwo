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
  TicketIcon,
} from '@heroicons/react/24/outline';

// SLA Tracking interface for resolution time calculation
interface SLATrackingData {
  currentEscalationLevel: number;
  resolutionDeadline?: string;
  nextEscalationDue?: string;
  resolutionStatus: 'met' | 'breached' | 'pending';
  isPaused: boolean;
  pausedDuration: number;
  lastEscalationAt?: string;
  escalationHistory: Array<{
    level: number;
    escalatedAt: string;
    escalatedTo: string;
    mode: 'manual' | 'auto';
    reason: string;
  }>;
  escalationPolicy?: {
    _id: string;
    name: string;
    levels: Array<{
      level: number;
      escalationMode: string;
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
  };
}

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
  resolvedAt?: string;
  closedAt?: string;
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
  submissionSource?: 'online' | 'offline' | 'email'; // Task 6.4: Ticket source
  sourceEmail?: string; // Task 6.4: Sender email for email tickets
  sourceEmailMessageId?: string; // Task 7.5: Original email message ID for threading
  metadata?: {
    studentName?: string;
    studentEmail?: string;
    studentPhone?: string;
    projectId?: string;
  };
  tags?: string[];
  threads?: Thread[];
  comments?: Comment[]; // Task 7.5: Email replies stored as comments
  internalNotes?: InternalNote[];
  attachments?: Attachment[];
  escalationHistory?: EscalationRecord[];
  slaTracking?: SLATrackingData; // SLA tracking data from backend
}

interface Thread {
  _id?: string;
  message: string;
  createdBy: {
    _id?: string;
    firstName: string;
    lastName: string;
    email: string;
    role?: string | { name: string; code?: string };
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

// Task 7.5: Comment interface for email replies
interface Comment {
  _id?: string;
  text: string;
  createdBy: {
    _id?: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  createdAt: string;
  updatedAt?: string;
  isSystemComment?: boolean;
}

interface Attachment {
  filename: string;
  path: string;
  size: number;
  uploadedAt: string;
}

// Task 6.5: Email communication interface
interface EmailCommunication {
  _id: string;
  ticketId: string;
  direction: 'incoming' | 'outgoing' | 'inbound' | 'outbound';
  fromEmail: string;
  toEmail: string;
  ccEmails?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  bodyHtml?: string;
  messageId: string;
  inReplyTo?: string;
  references?: string | string[];
  attachments?: Array<{
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    path?: string;
  }>;
  sentAt?: string;
  receivedAt?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
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
  const [permissions, setPermissions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'replies' | 'notes' | 'history' | 'emails'>('replies'); // Task 6.5: Added 'emails' tab
  
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

  const [newStatus, setNewStatus] = useState<string | number>('');
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
  const [statusOptions, setStatusOptions] = useState<any[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);
  const [priorityData, setPriorityData] = useState<any>(null);
  const [slaRules, setSlaRules] = useState<any[]>([]);
  
  // Task 6.4: State for escalation policies (for level-based SLA timing) and user role
  const [escalationPolicies, setEscalationPolicies] = useState<EscalationPolicy[]>([]);
  const [userRole, setUserRole] = useState<{ _id: string; name: string; code?: string } | null>(null);

  // Task 6.5: Email communications state
  const [emailCommunications, setEmailCommunications] = useState<EmailCommunication[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

  // Task 7.1: Email reply state
  const [replyContent, setReplyContent] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState('');
  const [replyError, setReplyError] = useState('');
  const [showReplyForm, setShowReplyForm] = useState(false);

  // Task 6.4: Source badge helper function
  const getSourceBadge = (source?: 'online' | 'offline' | 'email') => {
    const badges = {
      online: { icon: '🌐', label: 'Online', color: '#3B82F6', bgColor: '#DBEAFE', tooltip: 'Submitted via online portal' },
      offline: { icon: '📍', label: 'Offline', color: '#8B5CF6', bgColor: '#EDE9FE', tooltip: 'Walk-in or phone submission' },
      email: { icon: '📧', label: 'Email', color: '#10B981', bgColor: '#D1FAE5', tooltip: 'Created from email' },
    };
    return badges[source || 'online'] || badges.online;
  };

  // Helper function to get status display name from numeric code
  const getStatusDisplayName = (statusCode: number | string) => {
    const code = typeof statusCode === 'string' ? Number(statusCode) : statusCode;
    const status = statusOptions.find((s: any) => s.code === code);
    
    // If status found in options, return it
    if (status) return status.name;
    
    // Fallback to standard status names for common codes
    const standardStatuses: { [key: number]: string } = {
      1: 'Open',
      2: 'In Progress',
      3: 'Pending',
      4: 'Resolved',
      5: 'Closed'
    };
    
    return standardStatuses[code] || `Status ${code}`;
  };

  // Helper function to format change history values (converts status IDs to names)
  const formatChangeValue = (field: string, value: any) => {
    if (!value) return value;
    
    // Convert status codes to names
    if (field === 'Status' || field === 'status') {
      return getStatusDisplayName(value);
    }
    
    return value;
  };

  // Function to calculate resolution time remaining
  const calculateResolutionTimeRemaining = () => {
    if (!ticket || !priorityData) return null;

    const createdAt = new Date(ticket.createdAt);
    const now = new Date();
    const elapsedMs = now.getTime() - createdAt.getTime();

    // Convert resolution time to milliseconds
    let resolutionMs = 0;
    if (priorityData.resolutionTime) {
      const { value, unit } = priorityData.resolutionTime;
      switch (unit) {
        case 'minutes':
          resolutionMs = value * 60 * 1000;
          break;
        case 'hours':
          resolutionMs = value * 60 * 60 * 1000;
          break;
        case 'days':
          resolutionMs = value * 24 * 60 * 60 * 1000;
          break;
      }
    }

    const remainingMs = resolutionMs - elapsedMs;
    const isBreached = remainingMs <= 0;

    // Convert to hours and minutes
    const totalMinutes = Math.abs(Math.floor(remainingMs / (1000 * 60)));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
      hours,
      minutes,
      isBreached,
      displayText: isBreached 
        ? `Overdue by ${hours}h ${minutes}m`
        : `${hours}h ${minutes}m remaining`
    };
  };

  useEffect(() => {
    fetchTicketDetails();
    fetchMasterData();
    fetchUserPermissions();
  }, [ticketId]);

  // Task 6.5: Fetch email communications when ticket loads or changes
  useEffect(() => {
    if (ticket && ticket.submissionSource === 'email') {
      fetchEmailCommunications();
    }
  }, [ticket?.submissionSource, ticketId]);

  // Update priority data when ticket or slaRules change (no additional API call needed)
  useEffect(() => {
    if (!ticket?.priority || !slaRules.length) return;
    
    // Find the matching SLA rule by priority name from already-fetched slaRules
    const matchingSlaRule = slaRules.find(
      (rule: any) => rule.priority?.name?.toUpperCase() === ticket.priority.toUpperCase()
    );
      
    if (matchingSlaRule?.priority) {
      setPriorityData({
        name: matchingSlaRule.priority.name,
        code: ticket.priority.toUpperCase(),
        resolutionTime: {
          value: matchingSlaRule.resolutionTime?.value || 0,
          unit: matchingSlaRule.resolutionTime?.unit || 'hours'
        }
      });
    }
  }, [ticket?.priority, slaRules]);

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

  // PERFORMANCE: Consolidated master data fetch using Promise.all for parallel requests
  const fetchMasterData = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const projectContext = JSON.parse(localStorage.getItem('projectContext') || '{}');
      const headers = { Authorization: `Bearer ${token}` };

      if (!projectContext.projectId) {
        console.warn('⚠️ No projectId available, skipping master data fetch');
        return;
      }

      // PERFORMANCE: Fetch all data in parallel using Promise.all
      const [ticketConfigRes, tagsRes, escalationRes] = await Promise.all([
        // Ticket settings (statuses, priorities, categories, SLA rules)
        axios.get(
          `${API_CONFIG.API_URL}/projects/${projectContext.projectId}/ticket-settings`,
          { headers }
        ),
        // Available tags
        axios.get(`${API_CONFIG.API_URL}/tickets/tags`, { headers }),
        // Escalation policies
        axios.get(
          `${API_CONFIG.API_URL}/escalation-policies?projectId=${projectContext.projectId}&isActive=true`,
          { headers }
        ).catch(err => {
          console.error('❌ Error fetching escalation policies:', err);
          return { data: { data: [] } };
        })
      ]);

      // Process ticket configuration
      if (ticketConfigRes.data.success && ticketConfigRes.data.data) {
        const ticketConfig = ticketConfigRes.data.data;
        
        if (ticketConfig.allowedStatuses?.length > 0) {
          setStatusOptions(ticketConfig.allowedStatuses);
        }
        
        if (ticketConfig.categories?.length > 0) {
          setCategories(ticketConfig.categories.map((cat: string) => ({ 
            _id: cat, 
            name: cat 
          })));
        }
        
        if (ticketConfig.allowedPriorities?.length > 0) {
          setPriorityOptions(ticketConfig.allowedPriorities);
        }
        
        if (ticketConfig.slaRules?.length > 0) {
          setSlaRules(ticketConfig.slaRules);
        }
      }

      // Process tags
      setAvailableTags(tagsRes.data.data || []);

      // Process escalation contacts
      const policies = escalationRes.data.data || [];
      
      // Task 6.4: Store raw escalation policies for SLA level calculation
      setEscalationPolicies(policies);
      console.log('📋 Raw Escalation Policies:', policies);
      
      const contacts = policies.flatMap((policy: any) => {
        return (policy.levels || []).flatMap((level: any) => {
          if (level.users && level.users.length > 0) {
            return level.users.map((user: any) => ({
              _id: `${policy._id}-L${level.level}-${user._id}`,
              name: `${user.firstName} ${user.lastName}`,
              email: user.email,
              role: user.role?.name || level.escalateTo?.targetName || 'N/A',
              priority: policy.name || '',
              userId: user._id,
            }));
          } else {
            return [{
              _id: `${policy._id}-L${level.level}`,
              name: level.escalateTo?.targetName || `Level ${level.level}`,
              email: level.escalateTo?.targetId || '',
              role: level.escalateTo?.type || 'role',
              priority: policy.name || '',
            }];
          }
        });
      });
      setEscalationContacts(contacts);

    } catch (error) {
      console.error('❌ Error fetching master data:', error);
      if (axios.isAxiosError(error)) {
        console.error('❌ Response:', error.response?.data);
      }
    }
  };

  const fetchUserPermissions = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success && response.data.data) {
        const userPermissions = response.data.data.role?.permissions || [];
        console.log('🔐 User Permissions Loaded:', userPermissions);
        console.log('✅ Has TICKET_ESCALATE?', userPermissions.includes('TICKET_ESCALATE'));
        setPermissions(userPermissions);
        
        // Task 6.4: Store user role for SLA level calculation
        const role = response.data.data.role;
        if (role) {
          setUserRole({ _id: role._id, name: role.name, code: role.code });
          console.log('👤 User Role:', role.name, role.code);
        }
      }
    } catch (error) {
      console.error('Error fetching user permissions:', error);
    }
  };

  // Task 6.5: Fetch email communications
  const fetchEmailCommunications = async () => {
    if (!ticketId || !ticket?.submissionSource || ticket.submissionSource !== 'email') {
      // Only fetch for email tickets
      return;
    }

    setLoadingEmails(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/${ticketId}/communications`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        setEmailCommunications(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching email communications:', error);
    } finally {
      setLoadingEmails(false);
    }
  };

  // Task 7.1: Send email reply
  const handleSendReply = async () => {
    if (!replyContent.trim() || !ticket) {
      setReplyError('Reply content is required');
      return;
    }

    // Validate ticket is from email source
    if (ticket.submissionSource !== 'email' || !ticket.sourceEmail) {
      setReplyError('Cannot send email reply: This ticket was not created via email');
      return;
    }

    setSendingReply(true);
    setReplyError('');
    setReplySuccess('');

    try {
      const token = localStorage.getItem('authToken');
      
      // Get the original message ID for threading
      const originalMessageId = ticket.sourceEmailMessageId || 
        (emailCommunications.length > 0 ? emailCommunications[0].messageId : undefined);

      const response = await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/reply-email`,
        {
          replyContent: replyContent.trim(),
          inReplyToMessageId: originalMessageId
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        setReplySuccess('Email reply sent successfully!');
        setReplyContent(''); // Clear form
        setShowReplyForm(false); // Hide form
        
        // Refresh email communications to show the new reply
        await fetchEmailCommunications();
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setReplySuccess('');
        }, 3000);
      } else {
        setReplyError(response.data.error || 'Failed to send reply');
      }
    } catch (error: any) {
      console.error('Error sending email reply:', error);
      const errorMessage = error.response?.data?.error || 
        error.response?.data?.details || 
        'Failed to send email reply. Please try again.';
      setReplyError(errorMessage);
    } finally {
      setSendingReply(false);
    }
  };

  // Toggle email expand/collapse
  const toggleEmailExpanded = (emailId: string) => {
    setExpandedEmails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  };

  const handleUpdateStatus = async (statusOverride?: string | number) => {
    const statusToUpdate = statusOverride || newStatus;
    if (!statusToUpdate || !ticket) return;

    // Convert to number (status codes are now numeric: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed)
    const statusCode = typeof statusToUpdate === 'string' ? Number(statusToUpdate) : statusToUpdate;

    console.log('🔄 Updating status to:', statusToUpdate, '→', statusCode);
    console.log('🔍 Type of statusCode:', typeof statusCode);
    console.log('🔍 Status options available:', statusOptions);

    try {
      const token = localStorage.getItem('authToken');
      console.log('📤 Sending PATCH request with body:', { status: statusCode });
      const response = await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticket._id}/status`,
        { status: statusCode },
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
      alert('Query escalated successfully');
      // Navigate to ticket list with timestamp to force refresh
      navigate(`/${customUrlPath}/portal/tickets/my-tickets?refresh=${Date.now()}`);
    } catch (error) {
      console.error('Error escalating ticket:', error);
      alert('Failed to escalate query');
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

  const getStatusColor = (status: number | string) => {
    const statusCode = typeof status === 'string' ? Number(status) : status;
    const colors: Record<number, string> = {
      1: 'bg-yellow-100 text-yellow-800 border-yellow-300', // open
      2: 'bg-blue-100 text-blue-800 border-blue-300', // in-progress
      3: 'bg-pink-100 text-pink-800 border-pink-300', // on-hold
      4: 'bg-green-100 text-green-800 border-green-300', // resolved
      5: 'bg-gray-100 text-gray-800 border-gray-300', // closed
    };
    return colors[statusCode] || colors[1]; // Default to 'open' style
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Query Not Found</h2>
          <p className="text-gray-600 mb-4">The query you're looking for doesn't exist or you don't have access.</p>
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
                      {getStatusDisplayName(ticket.status)}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1).toLowerCase()}
                    </span>
                    {/* Task 6.4: Source badge */}
                    {(() => {
                      const sourceBadge = getSourceBadge(ticket.submissionSource);
                      return (
                        <span 
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                          style={{
                            color: sourceBadge.color,
                            backgroundColor: sourceBadge.bgColor,
                            border: `1px solid ${sourceBadge.color}40`,
                          }}
                          title={sourceBadge.tooltip}
                        >
                          <span>{sourceBadge.icon}</span>
                          <span>{sourceBadge.label}</span>
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-sm text-gray-600">
                      Created {new Date(ticket.createdAt).toLocaleString()}
                    </p>
                    {/* Task 6.4: Show sender email for email tickets */}
                    {ticket.submissionSource === 'email' && ticket.sourceEmail && (
                      <>
                        <span className="text-gray-400">•</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">From:</span>
                          <a
                            href={`mailto:${ticket.sourceEmail}`}
                            className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                            title={ticket.sourceEmail}
                          >
                            {ticket.sourceEmail}
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(ticket.sourceEmail || '');
                            }}
                            className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                            title="Copy email"
                          >
                            📋
                          </button>
                        </div>
                      </>
                    )}
                  </div>
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
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="p-1.5 bg-blue-100 rounded-lg">
                    <TicketIcon className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Subject</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 leading-tight">
                  {ticket.title || ticket.subject || 'No Subject'}
                </h2>
              </div>
              
              <div className="p-6">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="p-1.5 bg-purple-100 rounded-lg">
                    <DocumentTextIcon className="h-4 w-4 text-purple-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Description</span>
                </div>
                <div className="prose max-w-none">
                  <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
                </div>
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

            {/* Latest Reply and Internal Note - Always Visible */}
            {(ticket.threads && ticket.threads.length > 0) || (ticket.internalNotes && ticket.internalNotes.length > 0) ? (
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                
                {/* Latest Reply */}
                {ticket.threads && ticket.threads.length > 0 && (() => {
                  const latestReply = [...ticket.threads].sort((a, b) => 
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  )[0];
                  
                  return (
                    <div className="border-l-4 border-blue-500 pl-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-600" />
                          <span className="text-sm font-semibold text-gray-900">Latest Reply</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(latestReply.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-700 mb-1">
                          {latestReply.createdBy.firstName} {latestReply.createdBy.lastName}
                          {latestReply.createdBy.role && (
                            <span className="text-gray-500"> • {typeof latestReply.createdBy.role === 'string' ? latestReply.createdBy.role : (latestReply.createdBy.role as any).name}</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-3">
                          {latestReply.message}
                        </p>
                        {latestReply.attachments && latestReply.attachments.length > 0 && (
                          <div className="mt-2 flex items-center space-x-1 text-xs text-blue-600">
                            <PaperClipIcon className="h-3 w-3" />
                            <span>{latestReply.attachments.length} attachment(s)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Latest Internal Note */}
                {ticket.internalNotes && ticket.internalNotes.length > 0 && (() => {
                  const latestNote = [...ticket.internalNotes].sort((a, b) => 
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  )[0];
                  
                  return (
                    <div className="border-l-4 border-yellow-500 pl-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <DocumentTextIcon className="h-5 w-5 text-yellow-600" />
                          <span className="text-sm font-semibold text-gray-900">Latest Internal Note</span>
                          <span className="text-xs text-gray-500 italic">(Staff only)</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(latestNote.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-700 mb-1">
                          {latestNote.createdBy.firstName} {latestNote.createdBy.lastName}
                        </p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-3">
                          {latestNote.note}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">
                    View all replies and notes in the tabs below
                  </p>
                </div>
              </div>
            ) : null}

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
                  {/* Task 6.5: Emails tab - only show for email tickets */}
                  {ticket.submissionSource === 'email' && (
                    <button
                      onClick={() => setActiveTab('emails')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'emails'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <svg className="h-5 w-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Email Thread ({emailCommunications.filter(e => {
                        const isOut = e.direction === 'outgoing' || e.direction === 'outbound';
                        const isConf = e.subject?.toLowerCase().includes('ticket created:');
                        return !(isOut && isConf);
                      }).length})
                    </button>
                  )}
                </div>
              </div>

              <div className="p-6">
                {/* Replies Tab */}
                {activeTab === 'replies' && (
                  <div className="space-y-6">
                    {/* Closed Ticket Notice */}
                    {(String(ticket.status) === '5' || String(ticket.status).toLowerCase() === 'closed') && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-start">
                          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0" />
                          <div>
                            <h4 className="text-sm font-semibold text-yellow-900">Query is Closed</h4>
                            <p className="text-sm text-yellow-700 mt-1">
                              This query is closed. To add a reply, please change the status to "Open" first.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Reply Form (only if ticket is not closed) */}
                    {!(String(ticket.status) === '5' || String(ticket.status).toLowerCase() === 'closed') && (
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
                    )}

                    {/* Task 7.5: Combined Timeline - Comments (Email Replies) + Threads */}
                    {((ticket.comments && ticket.comments.length > 0) || (ticket.threads && ticket.threads.length > 0)) && (
                      <div className="space-y-4 mt-8">
                        <h4 className="text-base font-semibold text-gray-900 border-b pb-2">
                          Full Conversation ({(ticket.comments?.length || 0) + (ticket.threads?.length || 0)} messages)
                        </h4>

                        {/* Task 7.5: Display Email Replies (from comments) */}
                        {ticket.comments && ticket.comments.length > 0 && ticket.comments
                          .filter(comment => comment.text?.startsWith('📧'))
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map((comment) => {
                            // Extract email and content from comment text
                            const emailMatch = comment.text.match(/📧 Email reply sent to ([^:]+):\n\n(.+)/s);
                            const recipientEmail = emailMatch ? emailMatch[1].trim() : '';
                            const replyContent = emailMatch ? emailMatch[2].trim() : comment.text;

                            return (
                              <div key={comment._id} className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
                                <div className="flex items-start space-x-3">
                                  <div className="flex-shrink-0">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-white font-semibold">
                                      {comment.createdBy?.firstName?.charAt(0) || 'A'}
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-gray-900">
                                          {comment.createdBy?.firstName} {comment.createdBy?.lastName}
                                        </p>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                          📧 Sent via Email
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-500">
                                        {new Date(comment.createdAt).toLocaleString('en-US', {
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </p>
                                    </div>
                                    {recipientEmail && (
                                      <p className="text-xs text-blue-700 mb-2">
                                        To: {recipientEmail}
                                      </p>
                                    )}
                                    <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                                      {replyContent}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        }

                        {/* Original Threads/Replies */}
                        {ticket.threads && ticket.threads.length > 0 && ticket.threads
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map((thread) => (
                            <div key={thread._id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                              <div className="flex items-start space-x-3">
                                <div className="flex-shrink-0">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                                    {thread.createdBy?.firstName?.charAt(0) || '?'}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {thread.createdBy?.firstName} {thread.createdBy?.lastName}
                                        {thread.createdBy?.role && (
                                          <span className="ml-2 text-xs text-gray-500">
                                            ({typeof thread.createdBy.role === 'string' ? thread.createdBy.role : thread.createdBy.role.name})
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {new Date(thread.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                  </div>
                                  <p className="text-gray-700 whitespace-pre-wrap text-sm">{thread.message}</p>

                                  {/* Thread Attachments */}
                                  {thread.attachments && thread.attachments.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                      {thread.attachments.map((file, idx) => (
                                        <a
                                          key={idx}
                                          href={`${API_CONFIG.BASE_URL}${file.path}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-700"
                                        >
                                          <PaperClipIcon className="h-4 w-4" />
                                          <span>{file.filename}</span>
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

                    {/* Full Internal Notes List */}
                    {ticket.internalNotes && ticket.internalNotes.length > 0 && (
                      <div className="space-y-4 mt-8">
                        <h4 className="text-base font-semibold text-gray-900 border-b pb-2">
                          All Internal Notes ({ticket.internalNotes.length} {ticket.internalNotes.length === 1 ? 'note' : 'notes'})
                        </h4>
                        {ticket.internalNotes
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map((note) => (
                            <div key={note._id} className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                              <div className="flex items-start space-x-3">
                                <div className="flex-shrink-0">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-white font-semibold">
                                    {note.createdBy?.firstName?.charAt(0) || '?'}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {note.createdBy?.firstName} {note.createdBy?.lastName}
                                        <span className="ml-2 text-xs text-yellow-700 font-semibold">(STAFF ONLY)</span>
                                      </p>
                                      <p className="text-xs text-gray-600">
                                        {new Date(note.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                  </div>
                                  <p className="text-gray-700 whitespace-pre-wrap text-sm">{note.note}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                  <div className="space-y-6">
                    {/* Change History */}
                    {(ticket as any).changeHistory && (ticket as any).changeHistory.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-900">Change History</h3>
                        {[...(ticket as any).changeHistory].reverse().map((change: any) => (
                          <div key={change._id} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                            <div className="flex items-start space-x-3">
                              <ClockIcon className="h-5 w-5 text-gray-600 flex-shrink-0 mt-1" />
                              <div className="flex-1">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {change.field} {change.changeType === 'add' ? 'Added' : change.changeType === 'remove' ? 'Removed' : 'Updated'}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">
                                      By {change.changedBy?.firstName} {change.changedBy?.lastName}
                                    </p>
                                  </div>
                                  <p className="text-xs text-gray-500">
                                    {new Date(change.changedAt).toLocaleString()}
                                  </p>
                                </div>
                                <div className="mt-2 text-sm">
                                  {change.changeType === 'add' ? (
                                    <span className="text-green-700">
                                      + {formatChangeValue(change.field, change.newValue)}
                                    </span>
                                  ) : change.changeType === 'remove' ? (
                                    <span className="text-red-700">
                                      - {formatChangeValue(change.field, change.oldValue)}
                                    </span>
                                  ) : (
                                    <div className="space-y-1">
                                      <span className="text-red-700 line-through">
                                        {formatChangeValue(change.field, change.oldValue)}
                                      </span>
                                      <span className="mx-2">→</span>
                                      <span className="text-green-700">
                                        {formatChangeValue(change.field, change.newValue)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* Escalation History */}
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
                    ) : null}

                    {/* No history message */}
                    {(!(ticket as any).changeHistory || (ticket as any).changeHistory.length === 0) && 
                     (!ticket.escalationHistory || ticket.escalationHistory.length === 0) && (
                      <p className="text-center text-gray-500 py-8">No history yet</p>
                    )}
                  </div>
                )}

                {/* Task 6.5: Email Communications Tab */}
                {activeTab === 'emails' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Email Communication Thread</h3>
                      {loadingEmails && (
                        <span className="text-sm text-gray-500">Loading...</span>
                      )}
                    </div>

                    {/* Filter out automatic ticket confirmation emails (outgoing with "Ticket Created:" subject) */}
                    {(() => {
                      const filteredEmails = emailCommunications.filter(email => {
                        // Exclude automatic outgoing confirmation emails
                        const isOutgoing = email.direction === 'outgoing' || email.direction === 'outbound';
                        const isConfirmationEmail = email.subject?.toLowerCase().includes('ticket created:');
                        return !(isOutgoing && isConfirmationEmail);
                      });
                      
                      return (
                        <>
                          {!loadingEmails && filteredEmails.length === 0 && (
                            <div className="text-center py-12 bg-gray-50 rounded-lg">
                              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <p className="mt-4 text-sm text-gray-600">No email communications found</p>
                              <p className="mt-1 text-xs text-gray-500">Email thread will appear here once messages are exchanged</p>
                            </div>
                          )}

                          {filteredEmails.map((email, index) => {
                      const isIncoming = email.direction === 'incoming' || email.direction === 'inbound';
                      const isExpanded = expandedEmails.has(email._id);
                      const emailBody = email.htmlBody || email.bodyHtml || email.body;
                      const isLongEmail = emailBody.length > 500;
                      const displayBody = !isExpanded && isLongEmail 
                        ? emailBody.substring(0, 500) + '...' 
                        : emailBody;

                      return (
                        <div 
                          key={email._id}
                          className={`relative border-l-4 pl-6 pr-4 py-4 rounded-r-lg ${
                            isIncoming 
                              ? 'bg-blue-50 border-blue-500' 
                              : 'bg-green-50 border-green-500'
                          }`}
                        >
                          {/* Thread indicator line */}
                          {index > 0 && (
                            <div 
                              className="absolute left-0 -top-4 w-0.5 h-4 bg-gray-300"
                              style={{ marginLeft: '-2px' }}
                            />
                          )}

                          {/* Email header */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-semibold px-2 py-1 rounded ${
                                  isIncoming 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {isIncoming ? '📥 INCOMING' : '📤 OUTGOING'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(email.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-sm">
                                <p className="font-medium text-gray-900">
                                  <span className="text-gray-600">From:</span> {email.fromEmail}
                                </p>
                                <p className="text-gray-700">
                                  <span className="text-gray-600">To:</span> {email.toEmail}
                                </p>
                                {email.ccEmails && email.ccEmails.length > 0 && (
                                  <p className="text-gray-600 text-xs">
                                    CC: {email.ccEmails.join(', ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Email subject */}
                          <div className="mb-3">
                            <p className="text-sm font-semibold text-gray-900">
                              Subject: {email.subject}
                            </p>
                          </div>

                          {/* Email body */}
                          <div className="mb-3">
                            {email.htmlBody || email.bodyHtml ? (
                              <div 
                                className="prose prose-sm max-w-none text-gray-700 bg-white p-3 rounded border border-gray-200"
                                dangerouslySetInnerHTML={{ 
                                  __html: displayBody 
                                }}
                              />
                            ) : (
                              <div className="text-sm text-gray-700 bg-white p-3 rounded border border-gray-200 whitespace-pre-wrap">
                                {displayBody}
                              </div>
                            )}
                          </div>

                          {/* Expand/Collapse button for long emails */}
                          {isLongEmail && (
                            <button
                              onClick={() => toggleEmailExpanded(email._id)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              {isExpanded ? '▲ Show less' : '▼ Show more'}
                            </button>
                          )}

                          {/* Attachments */}
                          {email.attachments && email.attachments.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs font-medium text-gray-700 mb-2">
                                📎 Attachments ({email.attachments.length})
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {email.attachments.map((att, i) => (
                                  <span 
                                    key={i}
                                    className="text-xs bg-white px-2 py-1 rounded border border-gray-300 text-gray-700"
                                  >
                                    {att.originalName || att.filename} ({(att.size / 1024).toFixed(1)} KB)
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Email metadata */}
                          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                            <div className="flex items-center gap-4">
                              <span>Message ID: {email.messageId.substring(0, 20)}...</span>
                              {email.inReplyTo && (
                                <span>↩️ Reply to: {email.inReplyTo.substring(0, 20)}...</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Task 7.1: Email Reply Form */}
                {!loadingEmails && ticket.sourceEmail && (
                  <div className="mt-6">
                    {/* Success/Error Messages */}
                    {replySuccess && (
                      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                        <span className="text-green-600">✅</span>
                        <span className="text-sm text-green-700">{replySuccess}</span>
                      </div>
                    )}
                    {replyError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                        <span className="text-red-600">❌</span>
                        <span className="text-sm text-red-700">{replyError}</span>
                      </div>
                    )}

                    {/* Reply Button or Form */}
                    {!showReplyForm ? (
                      <button
                        onClick={() => setShowReplyForm(true)}
                        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                      >
                        <span>📧</span>
                        <span>Reply via Email</span>
                      </button>
                    ) : (
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-gray-900">
                            Reply to: {ticket.sourceEmail}
                          </h4>
                          <button
                            onClick={() => {
                              setShowReplyForm(false);
                              setReplyContent('');
                              setReplyError('');
                            }}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            disabled={sendingReply}
                          >
                            ✕
                          </button>
                        </div>

                        {/* Reply Textarea */}
                        <textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          placeholder="Type your reply here..."
                          rows={6}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                          disabled={sendingReply}
                        />

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-gray-500">
                            {replyContent.length} characters
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowReplyForm(false);
                                setReplyContent('');
                                setReplyError('');
                              }}
                              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                              disabled={sendingReply}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSendReply}
                              disabled={sendingReply || !replyContent.trim()}
                              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                              {sendingReply ? (
                                <>
                                  <span className="animate-spin">⏳</span>
                                  <span>Sending...</span>
                                </>
                              ) : (
                                <>
                                  <span>📤</span>
                                  <span>Send Reply</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
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
                      const newStatusCode = Number(e.target.value);
                      setNewStatus(newStatusCode);
                      // Call update directly with the new numeric code
                      handleUpdateStatus(newStatusCode);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {statusOptions.map((status: any) => (
                      <option key={status.code} value={status.code}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={ticket.priority.toUpperCase()}
                    onChange={(e) => {
                      const newPriorityValue = e.target.value;
                      setNewPriority(newPriorityValue);
                      // Call update directly with the new value
                      handleUpdatePriority(newPriorityValue);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {priorityOptions.map((priority) => (
                      <option key={priority} value={priority.toUpperCase()}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Resolution Time Countdown */}
                {(() => {
                  console.log('🎯 Full Ticket Object:', ticket);
                  console.log('🎯 SLA Tracking Data:', ticket.slaTracking);
                  console.log('🎯 SLA Tracking Type:', typeof ticket.slaTracking);
                  console.log('🎯 Resolution Deadline Value:', ticket.slaTracking?.resolutionDeadline);
                  console.log('🎯 Resolution Deadline Type:', typeof ticket.slaTracking?.resolutionDeadline);
                  console.log('🎯 Ticket Status:', ticket.status);
                  
                  // Check if ticket is resolved or closed (handle both numeric and string values)
                  const statusLower = String(ticket.status).toLowerCase();
                  const isResolved = String(ticket.status) === '4' || statusLower === 'resolved';
                  const isClosed = String(ticket.status) === '5' || statusLower === 'closed' || statusLower === 'close';
                  const isComplete = isResolved || isClosed;
                  
                  // Get escalation info from ticket's SLA tracking data
                  const slaTracking = ticket.slaTracking;
                  const currentLevel = slaTracking?.currentEscalationLevel || 0;
                  const escalationPolicy = slaTracking?.escalationPolicy;
                  
                  // Determine the current level's name for display
                  let timeLabel = 'Resolution Time';
                  let currentLevelConfig = null;
                  
                  if (escalationPolicy?.levels && currentLevel >= 0) {
                    // Level 0 means first level (L1), Level 1 means second level (L2), etc.
                    const levelIndex = currentLevel;
                    currentLevelConfig = escalationPolicy.levels.find(l => l.level === levelIndex + 1);
                    if (currentLevelConfig) {
                      timeLabel = `${currentLevelConfig.escalateTo?.targetName || `Level ${levelIndex + 1}`} SLA`;
                    } else if (currentLevel > 0) {
                      // Already escalated but no matching level found
                      timeLabel = `Level ${currentLevel + 1} SLA`;
                    }
                  }
                  
                  console.log('🎯 Current Escalation Level:', currentLevel);
                  console.log('🎯 Current Level Config:', currentLevelConfig);
                  
                  let resolutionDeadline: Date;
                  const createdAt = new Date(ticket.createdAt);
                  
                  // Use SLA tracking resolution deadline if available
                  if (slaTracking?.resolutionDeadline) {
                    resolutionDeadline = new Date(slaTracking.resolutionDeadline);
                    console.log('🎯 Using SLA Tracking Deadline:', resolutionDeadline);
                  } else {
                    // Fallback: Calculate from escalation policy or SLA rules
                    let resolutionMs = 0;
                    
                    // Try to get from escalation policy
                    if (currentLevelConfig?.escalateAfter) {
                      const { value, unit } = currentLevelConfig.escalateAfter;
                      switch (unit?.toLowerCase()) {
                        case 'minutes':
                          resolutionMs = value * 60 * 1000;
                          break;
                        case 'hours':
                          resolutionMs = value * 60 * 60 * 1000;
                          break;
                        case 'days':
                          resolutionMs = value * 24 * 60 * 60 * 1000;
                          break;
                        default:
                          resolutionMs = value * 60 * 60 * 1000;
                      }
                    } else {
                      // Fallback to SLA rules or defaults
                      const matchingSlaRule = slaRules.find(
                        (rule: any) => rule.priority?.name?.toUpperCase() === ticket.priority.toUpperCase()
                      );
                      
                      if (matchingSlaRule?.resolutionTime) {
                        const { value, unit } = matchingSlaRule.resolutionTime;
                        switch (unit?.toLowerCase()) {
                          case 'minutes':
                            resolutionMs = value * 60 * 1000;
                            break;
                          case 'hours':
                            resolutionMs = value * 60 * 60 * 1000;
                            break;
                          case 'days':
                            resolutionMs = value * 24 * 60 * 60 * 1000;
                            break;
                          default:
                            resolutionMs = value * 60 * 60 * 1000;
                        }
                      } else {
                        // Default resolution times
                        const defaultHours: { [key: string]: number } = {
                          'CRITICAL': 2, 'HIGH': 8, 'MEDIUM': 24, 'LOW': 48
                        };
                        resolutionMs = (defaultHours[ticket.priority.toUpperCase()] || 24) * 60 * 60 * 1000;
                      }
                    }
                    
                    resolutionDeadline = new Date(createdAt.getTime() + resolutionMs);
                    console.log('🎯 Calculated Resolution Deadline:', resolutionDeadline);
                  }
                  
                  let displayText = '';
                  let isBreached = false;
                  let bgColor = '';
                  let textColor = '';
                  let borderColor = '';
                  let nextEscalationInfo = '';
                  
                  if (isComplete) {
                    // Ticket is resolved or closed - show time taken
                    const completedAt = new Date(ticket.resolvedAt || ticket.closedAt || ticket.updatedAt);
                    const timeTakenMs = completedAt.getTime() - createdAt.getTime();
                    const totalHours = Math.floor(timeTakenMs / (1000 * 60 * 60));
                    const minutes = Math.floor((timeTakenMs % (1000 * 60 * 60)) / (1000 * 60));
                    
                    // Check if it was resolved within SLA
                    const resolutionMs = resolutionDeadline.getTime() - createdAt.getTime();
                    isBreached = timeTakenMs > resolutionMs;
                    
                    displayText = `Resolved in ${totalHours}h ${minutes}m`;
                    
                    if (isBreached) {
                      bgColor = 'bg-red-50';
                      borderColor = 'border-red-300';
                      textColor = 'text-red-600';
                    } else {
                      bgColor = 'bg-green-50';
                      borderColor = 'border-green-300';
                      textColor = 'text-green-600';
                    }
                  } else {
                    // Ticket is still open - show remaining time
                    const now = new Date();
                    const diffMs = resolutionDeadline.getTime() - now.getTime();
                    isBreached = diffMs < 0;
                    
                    const absDiffMs = Math.abs(diffMs);
                    const totalHours = Math.floor(absDiffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));
                    
                    displayText = isBreached 
                      ? `Overdue by ${totalHours}h ${minutes}m`
                      : `${totalHours}h ${minutes}m remaining`;
                    
                    bgColor = isBreached ? 'bg-red-50' : 'bg-blue-50';
                    borderColor = isBreached ? 'border-red-300' : 'border-blue-300';
                    textColor = isBreached ? 'text-red-600' : 'text-blue-600';
                    
                    // Show next escalation info if available
                    if (slaTracking?.nextEscalationDue && !isBreached) {
                      const nextEscDate = new Date(slaTracking.nextEscalationDue);
                      const nextDiff = nextEscDate.getTime() - now.getTime();
                      if (nextDiff > 0) {
                        const nextHours = Math.floor(nextDiff / (1000 * 60 * 60));
                        const nextMins = Math.floor((nextDiff % (1000 * 60 * 60)) / (1000 * 60));
                        nextEscalationInfo = `Auto-escalates in ${nextHours}h ${nextMins}m`;
                      }
                    }
                  }
                  
                  console.log('🎯 Display Text:', displayText);
                  
                  return (
                    <div className={`p-3 rounded-lg border ${bgColor} ${borderColor}`}>
                      <div className="flex items-center space-x-2">
                        <ClockIcon className={`h-5 w-5 ${textColor}`} />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-700">{timeLabel}</p>
                          <p className={`text-lg font-bold ${textColor}`}>
                            {displayText}
                          </p>
                          {nextEscalationInfo && (
                            <p className="text-xs text-orange-600 mt-1">
                              ⬆️ {nextEscalationInfo}
                            </p>
                          )}
                          {currentLevel > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              Escalated {currentLevel} time{currentLevel > 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select
                    value={typeof ticket.category === 'object' && ticket.category !== null && (ticket.category as any).name ? (ticket.category as any).name : String(ticket.category || '')}
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

            {/* Escalate Card - Only shown if user has TICKET_ESCALATE permission */}
            {permissions.includes('TICKET_ESCALATE') && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Escalate Query</h3>

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
                      placeholder="Explain why this query needs escalation..."
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
                  <span>Escalate This Query</span>
                </button>
              )}
            </div>
            )}

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
                  <span>Close Query</span>
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
