import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import {
  UserPlusIcon,
  TicketIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

interface Student {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  uniqueId?: string;
}

interface EscalationContact {
  _id: string;
  name: string;
  email: string;
  role: string;
  priority: string;
  userId?: string;
}

interface Category {
  _id: string;
  name: string;
  description?: string;
}

interface RegistrationField {
  id: string;
  fieldName: string;
  fieldType: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  isParentMobile?: boolean;
  order: number;
}

interface TicketField {
  id: string;
  fieldName: string;
  fieldType: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  allowMultiple?: boolean;
  maxFiles?: number;
  allowedFileTypes?: string[];
  isFixed?: boolean;
  isEnabled?: boolean;
  order: number;
}

interface OfflineSettings {
  registrationFields: RegistrationField[];
  ticketFields: TicketField[];
  allowAgentToMarkResolved: boolean;
  allowAgentToEscalate: boolean;
  autoAssignToCreatingAgent: boolean;
  requireStudentVerification: boolean;
  notificationSettings: {
    notifyStudentOnRegistration: boolean;
    notifyStudentOnTicketCreation: boolean;
    sendWelcomeEmail: boolean;
  };
}

interface Props {
  projectId: string;
}

type WorkflowStep = 'search' | 'register' | 'ticket';

const AgentStudentWorkflow: React.FC<Props> = ({ projectId }) => {
  // Workflow state
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('search');
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [newlyRegisteredStudentId, setNewlyRegisteredStudentId] = useState<string | null>(null);

  // Offline Module Settings
  const [offlineSettings, setOfflineSettings] = useState<OfflineSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Step 1: Student Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'name' | 'email' | 'phone' | 'all'>('all');
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  // Step 2: Registration States
  const [registrationForm, setRegistrationForm] = useState<Record<string, any>>({});
  const [registering, setRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState('');

  // Step 3: Ticket States
  const [ticketForm, setTicketForm] = useState<Record<string, any>>({
    markAsResolved: false,
    needsEscalation: false,
    escalationReason: '',
    escalateTo: '',
  });
  const [agents, setAgents] = useState<EscalationContact[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketMessage, setTicketMessage] = useState('');

  // Load settings on mount
  useEffect(() => {
    if (projectId) {
      fetchOfflineSettings();
    }
  }, [projectId]);

  // Fetch agents and categories when moving to ticket step
  useEffect(() => {
    if (workflowStep === 'ticket') {
      fetchTicketAgents();
      fetchCategories();
    }
  }, [workflowStep]);

  const fetchOfflineSettings = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/${projectId}/offline-settings`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        let settings = response.data.data;
        
        // Remove duplicate Category fields - keep only the first one
        if (settings.ticketFields) {
          const seenCategories = new Set();
          settings.ticketFields = settings.ticketFields.filter((field: any) => {
            if (field.fieldName === 'Category') {
              if (seenCategories.has('Category')) {
                console.log('Removing duplicate Category field:', field.id);
                return false; // Remove duplicate
              }
              seenCategories.add('Category');
            }
            return true;
          });
        }
        
        setOfflineSettings(settings);

        // Initialize registration form
        const initialRegForm: Record<string, any> = {};
        settings.registrationFields?.forEach((field: RegistrationField) => {
          initialRegForm[field.fieldName] = '';
        });
        setRegistrationForm(initialRegForm);

        // Initialize ticket form
        const initialTicketForm: Record<string, any> = {
          markAsResolved: false,
          needsEscalation: false,
          escalationReason: '',
          escalateTo: '',
        };
        settings.ticketFields?.forEach((field: TicketField) => {
          initialTicketForm[field.fieldName] = field.fieldType === 'file' ? [] : '';
        });
        setTicketForm(initialTicketForm);
      }
    } catch (error) {
      console.error('Error fetching offline settings:', error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchTicketAgents = async () => {
    try {
      const token = localStorage.getItem('authToken');
      console.log('🔍 Fetching escalation policies for project:', projectId);
      
      const escalationContactsRes = await axios.get(
        `${API_CONFIG.API_URL}/escalation-policies?projectId=${projectId}&isActive=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('📋 Escalation policies response:', escalationContactsRes.data);

      // Transform escalation policies into contact format for the dropdown
      const policies = escalationContactsRes.data.data || [];
      
      console.log(`📊 Found ${policies.length} active policies for this project`);
      
      const contacts = policies.flatMap((policy: any) => {
        console.log(`📌 Processing policy: ${policy.name}, levels: ${policy.levels?.length}`);
        
        return (policy.levels || []).flatMap((level: any) => {
          console.log(`  Level ${level.level}: ${level.users?.length} users, escalateTo:`, level.escalateTo);
          
          // If level has users array, create a contact for each user
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
            // Fallback to old format if no users found
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
      
      console.log(`✅ Total contacts extracted: ${contacts.length}`, contacts);
      setAgents(contacts);
    } catch (error) {
      console.error('❌ Error fetching escalation agents:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/categories/project/${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        setCategories(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // STEP 1: Search Student
  const handleSearchStudent = async () => {
    if (!searchQuery.trim()) {
      setSearchMessage('Please enter a search query');
      return;
    }

    setSearching(true);
    setSearchMessage('');
    setSearchResults([]);

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/users/search-students?query=${encodeURIComponent(
          searchQuery
        )}&projectId=${projectId}&searchType=${searchType}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        if (response.data.data && response.data.data.length > 0) {
          setSearchResults(response.data.data);
          setSearchMessage(`Found ${response.data.count} candidate(s)`);
        } else {
          setSearchMessage('No candidates found. Please register a new candidate.');
          setSearchResults([]);
        }
      }
    } catch (error) {
      console.error('Error searching candidates:', error);
      setSearchMessage('Error searching candidates. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  // Select student from search results
  const selectStudent = (student: Student) => {
    setCurrentStudent(student);
    setWorkflowStep('ticket');
    // Auto-populate ticket form with student ID
    setTicketForm(prev => ({
      ...prev,
      studentId: student._id,
    }));
  };

  // STEP 2: Register New Student
  const handleRegisterStudent = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const requiredFields = offlineSettings?.registrationFields.filter(f => f.required) || [];
    for (const field of requiredFields) {
      if (!registrationForm[field.fieldName]) {
        setRegistrationError(`${field.fieldName} is required`);
        return;
      }
    }

    setRegistering(true);
    setRegistrationError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_CONFIG.API_URL}/users/register-student`,
        {
          ...registrationForm,
          projectId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        const newStudent = response.data.data;
        setCurrentStudent(newStudent);
        setNewlyRegisteredStudentId(newStudent._id);

        // Show success message with default password
        if (newStudent.defaultPassword) {
          alert(
            `✅ Candidate Registered Successfully!\n\n` +
            `Name: ${newStudent.firstName} ${newStudent.lastName}\n` +
            `Email: ${newStudent.email}\n` +
            `Default Password: ${newStudent.defaultPassword}\n\n` +
            `⚠️ IMPORTANT: Please share this password with the candidate securely.\n` +
            `The candidate can login to the candidate portal using:\n` +
            `Email: ${newStudent.email}\n` +
            `Password: ${newStudent.defaultPassword}\n\n` +
            `They will be required to change their password on first login.`
          );
        }

        // Auto-populate ticket form with new student ID
        setTicketForm(prev => ({
          ...prev,
          studentId: newStudent._id,
        }));

        // Move to ticket creation
        setWorkflowStep('ticket');
      }
    } catch (error: any) {
      setRegistrationError(
        error.response?.data?.message || 'Failed to register candidate. Please try again.'
      );
    } finally {
      setRegistering(false);
    }
  };

  // STEP 3: Create Ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentStudent) {
      setTicketMessage('No candidate selected. Please search or register a candidate first.');
      return;
    }

    if (ticketForm.needsEscalation && !ticketForm.escalateTo) {
      setTicketMessage('Please select an agent to escalate to');
      return;
    }

    setCreatingTicket(true);
    setTicketMessage('');

    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();

      // Debug: Log all ticket form data before processing
      console.log('=== TICKET FORM DEBUG ===');
      console.log('Current ticketForm:', ticketForm);
      console.log('Offline settings ticket fields:', offlineSettings?.ticketFields);
      console.log('========================');

      // Map field names to normalize variations
      const normalizeFieldName = (name: string): string => {
        const normalized = name.toLowerCase().trim().replace(/\s+/g, '');
        
        if (normalized.includes('description') || normalized.includes('details') || normalized.includes('issue')) {
          return 'description';
        }
        if (normalized.includes('category')) {
          return 'category';
        }
        if (normalized.includes('priority')) {
          return 'priority';
        }
        return name;
      };

      // Add all configured ticket fields with normalized names
      let hasDescription = false;
      let hasCategory = false;

      offlineSettings?.ticketFields.forEach((field) => {
        const normalizedName = normalizeFieldName(field.fieldName);
        const fieldValue = ticketForm[field.fieldName];
        
        if (field.fieldType === 'file' && fieldValue) {
          const files = fieldValue as File[];
          files.forEach(file => formData.append('attachments', file));
        } else if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
          console.log(`Appending field: ${field.fieldName} -> ${normalizedName} = ${fieldValue}`);
          formData.append(normalizedName, String(fieldValue));
          
          // Track required fields
          if (normalizedName === 'description') hasDescription = true;
          if (normalizedName === 'category') hasCategory = true;
        } else {
          console.log(`Field ${field.fieldName} is empty or undefined`);
        }
      });

      // Validate required fields before submission
      if (!hasDescription || !hasCategory) {
        setTicketMessage(`Missing required fields: ${!hasDescription ? 'Description ' : ''}${!hasCategory ? 'Category' : ''}`);
        setCreatingTicket(false);
        return;
      }

      formData.append('userId', currentStudent._id);
      formData.append('studentId', currentStudent._id);
      formData.append('projectId', projectId);
      formData.append('submissionType', 'offline');

      if (ticketForm.markAsResolved) {
        formData.append('status', 'resolved');
        formData.append('resolvedAtCreation', 'true');
      }

      if (ticketForm.needsEscalation) {
        formData.append('escalateTo', ticketForm.escalateTo);
        formData.append('escalationReason', ticketForm.escalationReason);
      }

      // Log all FormData entries AFTER everything is appended
      console.log('Final FormData entries:');
      for (let [key, value] of formData.entries()) {
        console.log(`${key}: ${value}`);
      }

      const response = await axios.post(
        `${API_CONFIG.API_URL}/tickets/offline-submission`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (response.data.success) {
        setTicketMessage(
          `✓ Query #${response.data.data.ticketNumber} created successfully for ${currentStudent.firstName} ${currentStudent.lastName}`
        );

        // Reset workflow
        setTimeout(() => {
          setWorkflowStep('search');
          setCurrentStudent(null);
          setNewlyRegisteredStudentId(null);
          setSearchQuery('');
          setSearchResults([]);
          setTicketMessage('');
          setTicketForm({
            markAsResolved: false,
            needsEscalation: false,
            escalationReason: '',
            escalateTo: '',
          });
        }, 3000);
      }
    } catch (error: any) {
      setTicketMessage(error.response?.data?.message || 'Failed to create query');
    } finally {
      setCreatingTicket(false);
    }
  };

  // Go back to search
  const resetWorkflow = () => {
    setWorkflowStep('search');
    setCurrentStudent(null);
    setNewlyRegisteredStudentId(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearchMessage('');
    setRegistrationError('');
    setTicketMessage('');
  };

  const renderDynamicField = (
    field: RegistrationField | TicketField,
    value: any,
    onChange: (value: any) => void
  ) => {
    const isRequired = field.required;
    const placeholder = field.placeholder || field.fieldName;

    switch (field.fieldType) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
        return (
          <input
            type={
              field.fieldType === 'email'
                ? 'email'
                : field.fieldType === 'phone'
                ? 'tel'
                : field.fieldType === 'number'
                ? 'number'
                : 'text'
            }
            required={isRequired}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={placeholder}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
            pattern={field.validation?.pattern}
          />
        );

      case 'textarea':
        return (
          <textarea
            required={isRequired}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={placeholder}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
          />
        );

      case 'dropdown':
        return (
          <select
            required={isRequired}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select {field.fieldName}</option>
            {field.options?.map((option, idx) => (
              <option key={idx} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'category':
        return (
          <select
            required={isRequired}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
        );

      case 'date':
        return (
          <input
            type="date"
            required={isRequired}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );

      case 'file':
        const ticketField = field as TicketField;
        return (
          <div>
            <input
              type="file"
              multiple={ticketField.allowMultiple}
              accept={ticketField.allowedFileTypes?.join(',')}
              onChange={(e) => {
                if (e.target.files) {
                  const filesArray = Array.from(e.target.files);
                  const maxFiles = ticketField.maxFiles || 5;
                  if (filesArray.length > maxFiles) {
                    alert(`Maximum ${maxFiles} files allowed`);
                    return;
                  }
                  onChange(filesArray);
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {value && value.length > 0 && (
              <div className="mt-2 space-y-1">
                {value.map((file: File, idx: number) => (
                  <div
                    key={idx}
                    className="text-sm text-gray-600 flex items-center justify-between bg-gray-50 px-3 py-1 rounded"
                  >
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newFiles = value.filter((_: any, i: number) => i !== idx);
                        onChange(newFiles);
                      }}
                      className="text-red-600 hover:text-red-800"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return (
          <input
            type="text"
            required={isRequired}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={placeholder}
          />
        );
    }
  };

  if (settingsLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading workflow settings...</p>
        </div>
      </div>
    );
  }

  if (!offlineSettings) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <ExclamationCircleIcon className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">Offline Module Not Configured</h3>
          <p className="text-yellow-700">
            Please ask your administrator to configure the offline module settings first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Candidate Management Workflow</h1>
        <p className="text-gray-600 mt-2">Search, register, and create queries for walk-in candidates</p>
      </div>

      {/* Workflow Progress */}
      <div className="mb-8 flex items-center space-x-4">
        <div
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            workflowStep === 'search' ? 'bg-blue-100 text-blue-900 font-semibold' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
          <span>Search</span>
        </div>
        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
        <div
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            workflowStep === 'register' ? 'bg-blue-100 text-blue-900 font-semibold' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <UserPlusIcon className="h-5 w-5" />
          <span>Register</span>
        </div>
        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
        <div
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            workflowStep === 'ticket' ? 'bg-blue-100 text-blue-900 font-semibold' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <TicketIcon className="h-5 w-5" />
          <span>Create Ticket</span>
        </div>
      </div>

      {/* STEP 1: SEARCH */}
      {workflowStep === 'search' && (
        <div className="bg-white rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Search for a Candidate</h2>

          {/* Search Form */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search Type</label>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All (Name, Email, Phone)</option>
                <option value="name">By Name</option>
                <option value="email">By Email</option>
                <option value="phone">By Phone Number</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Query <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchStudent()}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={
                    searchType === 'name'
                      ? 'e.g., John Doe'
                      : searchType === 'email'
                      ? 'e.g., student@example.com'
                      : searchType === 'phone'
                      ? 'e.g., 9876543210'
                      : 'Enter name, email, or phone'
                  }
                />
                <button
                  onClick={handleSearchStudent}
                  disabled={searching}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center space-x-2"
                >
                  {searching ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    </>
                  ) : (
                    <>
                      <MagnifyingGlassIcon className="h-5 w-5" />
                      <span>Search</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Search Message */}
            {searchMessage && (
              <div
                className={`p-4 rounded-lg ${
                  searchResults.length > 0
                    ? 'bg-green-50 border border-green-200 text-green-900'
                    : 'bg-amber-50 border border-amber-200 text-amber-900'
                }`}
              >
                {searchResults.length > 0 ? (
                  <p className="flex items-center space-x-2">
                    <CheckCircleIcon className="h-5 w-5" />
                    <span>{searchMessage}</span>
                  </p>
                ) : (
                  <p className="flex items-center space-x-2">
                    <ExclamationCircleIcon className="h-5 w-5" />
                    <span>{searchMessage}</span>
                  </p>
                )}
              </div>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Select a Candidate:</h3>
                {searchResults.map((student) => (
                  <div
                    key={student._id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <UserIcon className="h-6 w-6 text-gray-400" />
                      <div>
                        <p className="font-semibold text-gray-900">
                          {student.firstName} {student.lastName}
                        </p>
                        <p className="text-sm text-gray-600">{student.email}</p>
                        {student.phone && (
                          <p className="text-sm text-gray-600">Phone: {student.phone}</p>
                        )}
                        {student.uniqueId && (
                          <p className="text-sm text-gray-600">ID: {student.uniqueId}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => selectStudent(student)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <span>Select</span>
                      <ChevronRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Register New Student Button */}
            {searchResults.length === 0 && searchMessage && (
              <button
                onClick={() => setWorkflowStep('register')}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 font-semibold"
              >
                <UserPlusIcon className="h-5 w-5" />
                <span>Register New Student</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: REGISTER */}
      {workflowStep === 'register' && (
        <div className="bg-white rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Register New Student</h2>

          {registrationError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-900 flex items-start space-x-3">
              <ExclamationCircleIcon className="h-6 w-6 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold">Registration Error</h4>
                <p className="text-sm mt-1">{registrationError}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleRegisterStudent} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              {offlineSettings.registrationFields
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((field) => (
                  <div key={field.id} className={field.fieldType === 'textarea' ? 'col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {field.fieldName.charAt(0).toUpperCase() + field.fieldName.slice(1)}
                      {field.required && <span className="text-red-500"> *</span>}
                    </label>
                    {renderDynamicField(
                      field,
                      registrationForm[field.fieldName],
                      (value) => setRegistrationForm({ ...registrationForm, [field.fieldName]: value })
                    )}
                  </div>
                ))}
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t">
              <button
                type="button"
                onClick={() => setWorkflowStep('search')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back to Search
              </button>
              <button
                type="submit"
                disabled={registering}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 flex items-center space-x-2"
              >
                {registering ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="h-5 w-5" />
                    <span>Register & Continue</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3: CREATE TICKET */}
      {workflowStep === 'ticket' && currentStudent && (
        <div className="bg-white rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Query</h2>

          {/* Student Info Card */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">
              {newlyRegisteredStudentId ? '📝 Newly Registered' : '✓ Existing'} Student:
            </p>
            <p className="text-lg font-semibold text-gray-900">
              {currentStudent.firstName} {currentStudent.lastName}
            </p>
            <p className="text-sm text-gray-600 mt-1">{currentStudent.email}</p>
            {currentStudent.phone && (
              <p className="text-sm text-gray-600">Phone: {currentStudent.phone}</p>
            )}
          </div>

          {ticketMessage && (
            <div
              className={`mb-6 p-4 rounded-lg ${
                ticketMessage.startsWith('✓')
                  ? 'bg-green-50 border border-green-200 text-green-900'
                  : 'bg-red-50 border border-red-200 text-red-900'
              }`}
            >
              <p className="flex items-center space-x-2">
                {ticketMessage.startsWith('✓') ? (
                  <CheckCircleIcon className="h-5 w-5" />
                ) : (
                  <ExclamationCircleIcon className="h-5 w-5" />
                )}
                <span>{ticketMessage}</span>
              </p>
            </div>
          )}

          <form onSubmit={handleCreateTicket} className="space-y-6">
            {/* Ticket Fields */}
            <div className="space-y-6">
              {offlineSettings.ticketFields
                .filter((field) => (field.isFixed ? field.isEnabled !== false : true))
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((field) => (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {field.fieldName.charAt(0).toUpperCase() + field.fieldName.slice(1).replace(/([A-Z])/g, ' $1')}
                      {field.required && <span className="text-red-500"> *</span>}
                    </label>
                    {renderDynamicField(
                      field,
                      ticketForm[field.fieldName],
                      (value) => setTicketForm({ ...ticketForm, [field.fieldName]: value })
                    )}
                  </div>
                ))}
            </div>

            {/* Options */}
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>ℹ️ Auto-Assignment:</strong> This query will be automatically assigned to you unless you escalate it to another agent.
                </p>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="markResolved"
                  checked={ticketForm.markAsResolved}
                  onChange={(e) => setTicketForm({ ...ticketForm, markAsResolved: e.target.checked })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="markResolved" className="text-sm">
                  <span className="font-medium text-gray-900">Mark as Resolved</span>
                  <p className="text-gray-600 text-xs mt-1">Check if the issue was resolved during this visit</p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="needsEscalation"
                  checked={ticketForm.needsEscalation}
                  onChange={(e) => setTicketForm({ ...ticketForm, needsEscalation: e.target.checked })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="needsEscalation" className="text-sm flex-1">
                  <span className="font-medium text-gray-900">Escalate to Another Agent</span>
                  <p className="text-gray-600 text-xs mt-1">Check if this query needs specialized support</p>
                </label>
              </div>

              {ticketForm.needsEscalation && (
                <div className="ml-7 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Escalate To <span className="text-red-500">*</span>
                    </label>
                    <select
                      required={ticketForm.needsEscalation}
                      value={ticketForm.escalateTo}
                      onChange={(e) => setTicketForm({ ...ticketForm, escalateTo: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select contact ({agents.length} available)</option>
                      {agents.map((contact) => (
                        <option key={contact._id} value={contact.userId || contact._id}>
                          {contact.name} - {contact.role}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Escalation Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required={ticketForm.needsEscalation}
                      rows={3}
                      value={ticketForm.escalationReason}
                      onChange={(e) => setTicketForm({ ...ticketForm, escalationReason: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Reason for escalation..."
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-4 pt-4 border-t">
              <button
                type="button"
                onClick={resetWorkflow}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                New Workflow
              </button>
              <button
                type="submit"
                disabled={creatingTicket}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center space-x-2"
              >
                {creatingTicket ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <TicketIcon className="h-5 w-5" />
                    <span>Create Ticket</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AgentStudentWorkflow;
