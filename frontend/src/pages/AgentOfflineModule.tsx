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
} from '@heroicons/react/24/outline';

interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

interface Agent {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
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

const AgentOfflineModule: React.FC<Props> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'register' | 'create-ticket'>('register');
  
  // Offline Module Settings
  const [offlineSettings, setOfflineSettings] = useState<OfflineSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  
  // User Registration States
  const [userForm, setUserForm] = useState<Record<string, any>>({});
  const [searchEmail, setSearchEmail] = useState('');
  const [foundUser, setFoundUser] = useState<User | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [userSearched, setUserSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Ticket Creation States
  const [ticketForm, setTicketForm] = useState<Record<string, any>>({
    userEmail: '',
    userId: '',
    markAsResolved: false,
    needsEscalation: false,
    escalationReason: '',
    escalateTo: '',
  });
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [ticketUserSearched, setTicketUserSearched] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(false);
  const [createdTicketNumber, setCreatedTicketNumber] = useState('');

  useEffect(() => {
    if (projectId) {
      fetchOfflineSettings();
    }
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'create-ticket') {
      fetchTicketAgents();
      fetchCategories();
    }
  }, [activeTab]);

  const fetchOfflineSettings = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/${projectId}/offline-settings`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        const settings = response.data.data; // Changed from response.data.settings to response.data.data
        setOfflineSettings(settings);
        
        // Initialize form with empty values for each configured field
        const initialRegistrationForm: Record<string, any> = {};
        settings.registrationFields?.forEach((field: RegistrationField) => {
          initialRegistrationForm[field.fieldName] = '';
        });
        setUserForm(initialRegistrationForm);
        
        const initialTicketForm: Record<string, any> = {
          userEmail: '',
          userId: '',
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
      const agentResponse = await axios.get(
        `${API_CONFIG.API_URL}/users?projectId=${projectId}&roleCode=AGENT`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (agentResponse.data.success) {
        setAgents(agentResponse.data.data);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
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

  const searchUser = async () => {
    if (!searchEmail.trim()) return;

    setSearchLoading(true);
    setUserSearched(false);
    setFoundUser(null);

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/users/search?email=${searchEmail}&projectId=${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success && response.data.data) {
        setFoundUser(response.data.data);
        // Populate form with found user data
        const updatedForm: Record<string, any> = {};
        offlineSettings?.registrationFields.forEach((field) => {
          const normalizedFieldName = field.fieldName.toLowerCase().replace(/\s+/g, '');
          if (normalizedFieldName === 'firstname') {
            updatedForm[field.fieldName] = response.data.data.firstName || '';
          } else if (normalizedFieldName === 'lastname') {
            updatedForm[field.fieldName] = response.data.data.lastName || '';
          } else if (normalizedFieldName === 'email') {
            updatedForm[field.fieldName] = response.data.data.email || '';
          } else if (normalizedFieldName === 'phone' || normalizedFieldName === 'phonenumber') {
            updatedForm[field.fieldName] = response.data.data.phone || '';
          } else {
            updatedForm[field.fieldName] = '';
          }
        });
        setUserForm(updatedForm);
      } else {
        setFoundUser(null);
        const updatedForm: Record<string, any> = {};
        offlineSettings?.registrationFields.forEach((field) => {
          if (field.fieldName.toLowerCase().includes('email')) {
            updatedForm[field.fieldName] = searchEmail;
          } else {
            updatedForm[field.fieldName] = '';
          }
        });
        setUserForm(updatedForm);
      }
      setUserSearched(true);
    } catch (error) {
      console.error('Error searching user:', error);
      setFoundUser(null);
      setUserSearched(true);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    setRegisterSuccess(false);

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_CONFIG.API_URL}/users/register-student`,
        {
          ...userForm,
          projectId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setRegisterSuccess(true);
        setFoundUser(response.data.data);
        setTimeout(() => {
          setRegisterSuccess(false);
          setSearchEmail('');
          const resetForm: Record<string, any> = {};
          offlineSettings?.registrationFields.forEach((field) => {
            resetForm[field.fieldName] = '';
          });
          setUserForm(resetForm);
          setFoundUser(null);
          setUserSearched(false);
        }, 3000);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to register user');
    } finally {
      setRegistering(false);
    }
  };

  const searchUserForTicket = async () => {
    if (!ticketForm.userEmail.trim()) return;

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/users/search?email=${ticketForm.userEmail}&projectId=${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success && response.data.data) {
        setSelectedUser(response.data.data);
        setTicketForm(prev => ({
          ...prev,
          userId: response.data.data._id,
        }));
        setTicketUserSearched(true);
      } else {
        alert('User not found. Please register them first.');
        setSelectedUser(null);
        setTicketForm(prev => ({
          ...prev,
          userId: '',
        }));
        setTicketUserSearched(true);
      }
    } catch (error) {
      console.error('Error searching user:', error);
      alert('Error finding user. Please try again.');
      setSelectedUser(null);
      setTicketUserSearched(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUser) {
      alert('Please search and select a user first');
      return;
    }

    if (ticketForm.needsEscalation && !ticketForm.escalateTo) {
      alert('Please select an agent to escalate to');
      return;
    }

    setCreatingTicket(true);
    setTicketSuccess(false);

    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      
      // Add all configured ticket fields
      offlineSettings?.ticketFields.forEach((field) => {
        if (field.fieldType === 'file' && ticketForm[field.fieldName]) {
          const files = ticketForm[field.fieldName] as File[];
          files.forEach(file => formData.append(field.fieldName, file));
        } else if (ticketForm[field.fieldName]) {
          formData.append(field.fieldName, ticketForm[field.fieldName]);
        }
      });
      
      formData.append('userId', selectedUser._id);
      formData.append('studentId', selectedUser._id);
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
        setTicketSuccess(true);
        setCreatedTicketNumber(response.data.data.ticketNumber);
        setTimeout(() => {
          setTicketSuccess(false);
          // Reset form
          const resetForm: Record<string, any> = {
            userEmail: '',
            userId: '',
            markAsResolved: false,
            needsEscalation: false,
            escalationReason: '',
            escalateTo: '',
          };
          offlineSettings?.ticketFields.forEach((field) => {
            resetForm[field.fieldName] = field.fieldType === 'file' ? [] : '';
          });
          setTicketForm(resetForm);
          setSelectedUser(null);
          setTicketUserSearched(false);
          setCreatedTicketNumber('');
        }, 5000);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to create query');
    } finally {
      setCreatingTicket(false);
    }
  };

  const renderDynamicField = (field: RegistrationField | TicketField, value: any, onChange: (value: any) => void) => {
    const isRequired = field.required;
    const placeholder = field.placeholder || field.fieldName;

    switch (field.fieldType) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
        return (
          <input
            type={field.fieldType === 'email' ? 'email' : field.fieldType === 'phone' ? 'tel' : field.fieldType === 'number' ? 'number' : 'text'}
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
                  <div key={idx} className="text-sm text-gray-600 flex items-center justify-between bg-gray-50 px-3 py-1 rounded">
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
          <p className="text-gray-600">Loading offline module settings...</p>
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Offline Support Center</h1>
        <p className="text-gray-600 mt-2">
          Register users and create queries for walk-in support
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-4 border-b border-gray-200 mb-8">
        <button
          onClick={() => setActiveTab('register')}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'register'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            <UserPlusIcon className="h-5 w-5" />
            <span>Register User</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('create-ticket')}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'create-ticket'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            <TicketIcon className="h-5 w-5" />
            <span>Create Ticket</span>
          </div>
        </button>
      </div>

      {/* Register User Tab */}
      {activeTab === 'register' && (
        <div className="bg-white rounded-xl shadow-md p-8">
          {registerSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
              <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-green-900">User Registered Successfully!</h4>
                <p className="text-sm text-green-700 mt-1">
                  {foundUser?.firstName} {foundUser?.lastName} has been registered and can now submit queries.
                </p>
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search User by Email
            </label>
            <div className="flex space-x-2">
              <input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchUser()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="user@example.com"
              />
              <button
                onClick={searchUser}
                disabled={searchLoading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {searchLoading ? (
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
            {userSearched && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                {foundUser ? (
                  <div>
                    <p className="text-sm text-blue-900 flex items-center space-x-2">
                      <CheckCircleIcon className="h-5 w-5" />
                      <span>
                        User found: <strong>{foundUser.firstName} {foundUser.lastName}</strong>
                      </span>
                    </p>
                    <p className="text-xs text-blue-700 mt-1">This user is already registered in the system.</p>
                  </div>
                ) : (
                  <p className="text-sm text-blue-900">User not found. Complete the registration form below to create a new user.</p>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleRegisterUser} className="space-y-6">
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
                      userForm[field.fieldName],
                      (value) => setUserForm({ ...userForm, [field.fieldName]: value })
                    )}
                  </div>
                ))}
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => {
                  setSearchEmail('');
                  const resetForm: Record<string, any> = {};
                  offlineSettings.registrationFields.forEach((field) => {
                    resetForm[field.fieldName] = '';
                  });
                  setUserForm(resetForm);
                  setFoundUser(null);
                  setUserSearched(false);
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={registering || foundUser !== null}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {registering ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="h-5 w-5" />
                    <span>{foundUser ? 'Already Registered' : 'Register User'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Ticket Tab */}
      {activeTab === 'create-ticket' && (
        <div className="bg-white rounded-xl shadow-md p-8">
          {ticketSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
              <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-green-900">Ticket Created Successfully!</h4>
                <p className="text-sm text-green-700 mt-1">
                  Query #{createdTicketNumber} has been created
                  {ticketForm.markAsResolved && ' and marked as resolved'}
                  {ticketForm.needsEscalation && ' and escalated'}.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleCreateTicket} className="space-y-6">
            {/* User Search */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-sm text-amber-900 mb-3">
                <span className="font-semibold">Important:</span> You must search for and select a user before creating a ticket.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User Email <span className="text-red-500">*</span>
                </label>
                <div className="flex space-x-2">
                  <input
                    type="email"
                    required
                    value={ticketForm.userEmail}
                    onChange={(e) => {
                      setTicketForm({ ...ticketForm, userEmail: e.target.value });
                      setTicketUserSearched(false);
                      setSelectedUser(null);
                    }}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), searchUserForTicket())}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="user@example.com"
                  />
                  <button
                    type="button"
                    onClick={searchUserForTicket}
                    className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
                  >
                    <MagnifyingGlassIcon className="h-5 w-5" />
                    <span>Find</span>
                  </button>
                </div>
              </div>
              {ticketUserSearched && (
                <div className="mt-3">
                  {selectedUser ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-900 flex items-center space-x-2">
                        <CheckCircleIcon className="h-5 w-5" />
                        <span>
                          User: <strong>{selectedUser.firstName} {selectedUser.lastName}</strong> ({selectedUser.email})
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-900 flex items-center space-x-2">
                        <ExclamationCircleIcon className="h-5 w-5" />
                        <span>User not found. Please register them first.</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dynamic Ticket Fields */}
            <div className="space-y-6">
              {offlineSettings.ticketFields
                .filter((field) => field.isFixed ? field.isEnabled !== false : true) // Only show category if enabled
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
                  <p className="text-gray-600 text-xs mt-1">
                    Check this if you resolved the issue during walk-in support
                  </p>
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
                  <span className="font-medium text-gray-900">Escalate Ticket</span>
                  <p className="text-gray-600 text-xs mt-1">
                    Escalate to another agent for specialized support
                  </p>
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
                      <option value="">Select agent</option>
                      {agents.map((agent) => (
                        <option key={agent._id} value={agent._id}>
                          {agent.firstName} {agent.lastName} ({agent.email})
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
                onClick={() => {
                  const resetForm: Record<string, any> = {
                    userEmail: '',
                    userId: '',
                    markAsResolved: false,
                    needsEscalation: false,
                    escalationReason: '',
                    escalateTo: '',
                  };
                  offlineSettings?.ticketFields.forEach((field) => {
                    resetForm[field.fieldName] = field.fieldType === 'file' ? [] : '';
                  });
                  setTicketForm(resetForm);
                  setSelectedUser(null);
                  setTicketUserSearched(false);
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear Form
              </button>
              <button
                type="submit"
                disabled={creatingTicket || !selectedUser}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {creatingTicket ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Creating...</span>
                  </>
                ) : selectedUser ? (
                  <>
                    <TicketIcon className="h-5 w-5" />
                    <span>Create Ticket</span>
                  </>
                ) : (
                  <>
                    <ExclamationCircleIcon className="h-5 w-5" />
                    <span>Select User First</span>
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

export default AgentOfflineModule;
