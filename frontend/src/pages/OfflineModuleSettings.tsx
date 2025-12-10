import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { API_CONFIG } from '../config/constants';
import {
  PlusIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  UserPlusIcon,
  TicketIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

interface RegistrationField {
  id: string;
  fieldName: string;
  fieldType: 'text' | 'email' | 'phone' | 'number' | 'textarea' | 'dropdown' | 'date';
  required: boolean;
  placeholder: string;
  options?: string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  isParentMobile?: boolean; // For phone fields to indicate parent login number
  order: number;
}

interface TicketField {
  id: string;
  fieldName: string;
  fieldType: 'text' | 'textarea' | 'dropdown' | 'number' | 'date' | 'file' | 'category' | 'category-select';
  required: boolean;
  placeholder: string;
  options?: string[];
  allowMultiple?: boolean;
  maxFiles?: number;
  allowedFileTypes?: string[];
  isFixed?: boolean; // True for category field - cannot be removed
  isEnabled?: boolean; // For category field - can be enabled/disabled
  order: number;
}

interface Category {
  _id: string;
  name: string;
  description?: string;
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

const OfflineModuleSettings: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<'registration' | 'ticket' | 'general'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<OfflineSettings>({
    registrationFields: [
      { id: '1', fieldName: 'firstName', fieldType: 'text', required: true, placeholder: 'Enter first name', order: 1 },
      { id: '2', fieldName: 'lastName', fieldType: 'text', required: true, placeholder: 'Enter last name', order: 2 },
      { id: '3', fieldName: 'email', fieldType: 'email', required: true, placeholder: 'student@example.com', order: 3 },
      { id: '4', fieldName: 'phone', fieldType: 'phone', required: true, placeholder: '+91 98765 43210', order: 4 },
      { id: '5', fieldName: 'parentMobile', fieldType: 'phone', required: true, placeholder: 'Parent mobile number', isParentMobile: true, order: 5 },
    ],
    ticketFields: [
      { id: 'category-fixed', fieldName: 'Category', fieldType: 'category', required: true, placeholder: 'Select category', isFixed: true, isEnabled: true, order: 1 },
      { id: '1', fieldName: 'Title', fieldType: 'text', required: true, placeholder: 'Brief description of issue', order: 2 },
      { id: '2', fieldName: 'Description', fieldType: 'textarea', required: true, placeholder: 'Detailed description...', order: 3 },
      { id: '3', fieldName: 'Attachments', fieldType: 'file', required: false, placeholder: '', allowMultiple: true, maxFiles: 5, allowedFileTypes: ['pdf', 'jpg', 'png', 'doc', 'docx'], order: 4 },
    ],
    allowAgentToMarkResolved: true,
    allowAgentToEscalate: true,
    autoAssignToCreatingAgent: false,
    requireStudentVerification: false,
    notificationSettings: {
      notifyStudentOnRegistration: true,
      notifyStudentOnTicketCreation: true,
      sendWelcomeEmail: true,
    },
  });

  useEffect(() => {
    fetchSettings();
    fetchCategories();
  }, [projectId]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/${projectId}/offline-settings`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success && response.data.data) {
        const fetchedSettings = response.data.data;
        
        // Remove duplicate Category fields - keep only the first one
        if (fetchedSettings.ticketFields) {
          const seenCategories = new Set();
          fetchedSettings.ticketFields = fetchedSettings.ticketFields.filter((field: TicketField) => {
            if (field.fieldName === 'Category') {
              if (seenCategories.has('Category')) {
                return false; // Remove duplicate
              }
              seenCategories.add('Category');
            }
            return true;
          });
        }
        
        // Ensure category field exists
        const hasCategoryField = fetchedSettings.ticketFields?.some((f: TicketField) => 
          f.fieldType === 'category' || f.fieldType === 'category-select' || f.fieldName === 'Category'
        );
        if (!hasCategoryField) {
          // Add category field as first field if it doesn't exist
          fetchedSettings.ticketFields = [
            {
              id: 'category-fixed',
              fieldName: 'Category',
              fieldType: 'category-select',
              required: true,
              placeholder: 'Select category',
              isFixed: true,
              isEnabled: true,
              order: 1
            },
            ...(fetchedSettings.ticketFields || []).map((f: TicketField) => ({
              ...f,
              order: (f.order || 0) + 1
            }))
          ];
        }
        
        setSettings(fetchedSettings);
      }
    } catch (error) {
      console.error('Error fetching offline settings:', error);
    } finally {
      setLoading(false);
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

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const token = localStorage.getItem('authToken');
      await axios.put(
        `${API_CONFIG.API_URL}/projects/${projectId}/offline-settings`,
        settings,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addRegistrationField = () => {
    const newField: RegistrationField = {
      id: Date.now().toString(),
      fieldName: 'New Field',
      fieldType: 'text',
      required: false,
      placeholder: '',
      order: settings.registrationFields.length + 1,
    };
    setSettings({
      ...settings,
      registrationFields: [...settings.registrationFields, newField],
    });
  };

  const removeRegistrationField = (id: string) => {
    // Prevent deletion of mandatory fields
    const field = settings.registrationFields.find(f => f.id === id);
    const mandatoryFields = ['firstName', 'lastName', 'email', 'phone', 'parentMobile'];
    
    if (field && mandatoryFields.includes(field.fieldName)) {
      alert(`Cannot delete ${field.fieldName} - this is a mandatory field required by the system.`);
      return;
    }
    
    setSettings({
      ...settings,
      registrationFields: settings.registrationFields.filter(f => f.id !== id),
    });
  };

  const updateRegistrationField = (id: string, updates: Partial<RegistrationField>) => {
    // Prevent changing required status of mandatory fields
    const field = settings.registrationFields.find(f => f.id === id);
    const mandatoryFields = ['firstName', 'lastName', 'email', 'phone', 'parentMobile'];
    
    if (field && mandatoryFields.includes(field.fieldName) && 'required' in updates && !updates.required) {
      alert(`${field.fieldName} must remain required - this is a mandatory field.`);
      return;
    }
    
    // Prevent changing fieldName of mandatory fields
    if (field && mandatoryFields.includes(field.fieldName) && 'fieldName' in updates) {
      alert(`Cannot rename ${field.fieldName} - this is a system field.`);
      return;
    }
    
    setSettings({
      ...settings,
      registrationFields: settings.registrationFields.map(f =>
        f.id === id ? { ...f, ...updates } : f
      ),
    });
  };

  const moveRegistrationField = (id: string, direction: 'up' | 'down') => {
    const index = settings.registrationFields.findIndex(f => f.id === id);
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === settings.registrationFields.length - 1)
    ) {
      return;
    }

    const newFields = [...settings.registrationFields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    
    // Update order
    newFields.forEach((field, idx) => {
      field.order = idx + 1;
    });

    setSettings({ ...settings, registrationFields: newFields });
  };

  const addTicketField = () => {
    const newField: TicketField = {
      id: Date.now().toString(),
      fieldName: 'New Field',
      fieldType: 'text',
      required: false,
      placeholder: '',
      order: settings.ticketFields.length + 1,
    };
    setSettings({
      ...settings,
      ticketFields: [...settings.ticketFields, newField],
    });
  };

  const removeTicketField = (id: string) => {
    setSettings({
      ...settings,
      ticketFields: settings.ticketFields.filter(f => f.id !== id),
    });
  };

  const updateTicketField = (id: string, updates: Partial<TicketField>) => {
    setSettings({
      ...settings,
      ticketFields: settings.ticketFields.map(f =>
        f.id === id ? { ...f, ...updates } : f
      ),
    });
  };

  const moveTicketField = (id: string, direction: 'up' | 'down') => {
    const index = settings.ticketFields.findIndex(f => f.id === id);
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === settings.ticketFields.length - 1)
    ) {
      return;
    }

    const newFields = [...settings.ticketFields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    
    // Update order
    newFields.forEach((field, idx) => {
      field.order = idx + 1;
    });

    setSettings({ ...settings, ticketFields: newFields });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Cog6ToothIcon className="h-8 w-8 text-blue-600" />
            Offline Module Configuration
          </h1>
          <p className="text-gray-600 mt-2">
            Configure how agents register students and create tickets for walk-in support
          </p>
        </div>

        {saveSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
            <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-green-900">Settings Saved Successfully!</h4>
              <p className="text-sm text-green-700 mt-1">
                Your offline module configuration has been updated.
              </p>
            </div>
          </div>
        )}

        {/* Main Content - Two Column Layout */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Configuration Forms */}
          <div className="col-span-7">
            {/* Tab Navigation */}
            <div className="flex space-x-4 border-b border-gray-200 mb-6">
              <button
                onClick={() => setActiveTab('general')}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  activeTab === 'general'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Cog6ToothIcon className="h-5 w-5" />
                  <span>General Settings</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('registration')}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  activeTab === 'registration'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <UserPlusIcon className="h-5 w-5" />
                  <span>Registration Form</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('ticket')}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  activeTab === 'ticket'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <TicketIcon className="h-5 w-5" />
                  <span>Ticket Creation Form</span>
                </div>
              </button>
            </div>

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Permissions</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="allowMarkResolved"
                  checked={settings.allowAgentToMarkResolved}
                  onChange={(e) => setSettings({ ...settings, allowAgentToMarkResolved: e.target.checked })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="allowMarkResolved" className="flex-1">
                  <span className="font-medium text-gray-900">Allow Mark as Resolved</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Agents can mark tickets as resolved if issue was fixed during walk-in support
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="allowEscalate"
                  checked={settings.allowAgentToEscalate}
                  onChange={(e) => setSettings({ ...settings, allowAgentToEscalate: e.target.checked })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="allowEscalate" className="flex-1">
                  <span className="font-medium text-gray-900">Allow Escalation at Creation</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Agents can escalate tickets to specialized agents during creation
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="autoAssign"
                  checked={settings.autoAssignToCreatingAgent}
                  onChange={(e) => setSettings({ ...settings, autoAssignToCreatingAgent: e.target.checked })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="autoAssign" className="flex-1">
                  <span className="font-medium text-gray-900">Auto-assign to Creating Agent</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Automatically assign offline tickets to the agent who created them
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="requireVerification"
                  checked={settings.requireStudentVerification}
                  onChange={(e) => setSettings({ ...settings, requireStudentVerification: e.target.checked })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="requireVerification" className="flex-1">
                  <span className="font-medium text-gray-900">Require Student Verification</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Agents must verify student identity before registration (ID card, etc.)
                  </p>
                </label>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Settings</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="notifyRegistration"
                  checked={settings.notificationSettings.notifyStudentOnRegistration}
                  onChange={(e) => setSettings({
                    ...settings,
                    notificationSettings: {
                      ...settings.notificationSettings,
                      notifyStudentOnRegistration: e.target.checked,
                    },
                  })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="notifyRegistration" className="flex-1">
                  <span className="font-medium text-gray-900">Notify on Registration</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Send email notification when student is registered
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="notifyTicket"
                  checked={settings.notificationSettings.notifyStudentOnTicketCreation}
                  onChange={(e) => setSettings({
                    ...settings,
                    notificationSettings: {
                      ...settings.notificationSettings,
                      notifyStudentOnTicketCreation: e.target.checked,
                    },
                  })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="notifyTicket" className="flex-1">
                  <span className="font-medium text-gray-900">Notify on Ticket Creation</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Send email notification when ticket is created on their behalf
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="welcomeEmail"
                  checked={settings.notificationSettings.sendWelcomeEmail}
                  onChange={(e) => setSettings({
                    ...settings,
                    notificationSettings: {
                      ...settings.notificationSettings,
                      sendWelcomeEmail: e.target.checked,
                    },
                  })}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="welcomeEmail" className="flex-1">
                  <span className="font-medium text-gray-900">Send Welcome Email</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Send welcome email with portal access instructions to new students
                  </p>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Registration Form Tab */}
      {activeTab === 'registration' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Registration Form Fields</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Configure what information agents collect when registering students
                </p>
              </div>
              <button
                onClick={addRegistrationField}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <PlusIcon className="h-5 w-5" />
                <span>Add Field</span>
              </button>
            </div>

            <div className="space-y-4">
              {settings.registrationFields.map((field, index) => {
                const isMandatoryField = ['firstName', 'lastName', 'email', 'phone', 'parentMobile'].includes(field.fieldName);
                
                return (
                <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                  {isMandatoryField && (
                    <div className="mb-2 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                      🔒 System Required Field - Cannot be deleted or made optional
                    </div>
                  )}
                  <div className="grid grid-cols-12 gap-4">
                    {/* Field Name */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Field Name
                      </label>
                      {isMandatoryField ? (
                        <input
                          type="text"
                          value={field.fieldName}
                          disabled
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                        />
                      ) : (
                        <select
                          value={field.fieldName}
                          onChange={(e) => updateRegistrationField(field.id, { fieldName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select Field</option>
                          <optgroup label="Student Info">
                            <option value="name">Name / Full Name</option>
                            <option value="First Name">First Name</option>
                            <option value="Last Name">Last Name</option>
                            <option value="Email">Email</option>
                            <option value="Phone">Phone</option>
                            <option value="Mobile Number">Mobile Number</option>
                            <option value="Parent Mobile">Parent Mobile</option>
                            <option value="Unique ID">Unique ID / Student ID</option>
                          </optgroup>
                          <optgroup label="Custom Fields">
                            <option value="Address">Address</option>
                            <option value="City">City</option>
                            <option value="State">State</option>
                            <option value="Pincode">Pincode</option>
                            <option value="Date of Birth">Date of Birth</option>
                            <option value="Gender">Gender</option>
                            <option value="Course">Course</option>
                            <option value="Class">Class</option>
                            <option value="Custom Field">Custom Field (Edit Name)</option>
                          </optgroup>
                        </select>
                      )}
                    </div>

                    {/* Field Type */}
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Type
                      </label>
                      <select
                        value={field.fieldType}
                        onChange={(e) => updateRegistrationField(field.id, { fieldType: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="text">Text</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="number">Number</option>
                        <option value="textarea">Textarea</option>
                        <option value="dropdown">Dropdown</option>
                        <option value="date">Date</option>
                      </select>
                    </div>

                    {/* Placeholder */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Placeholder
                      </label>
                      <input
                        type="text"
                        value={field.placeholder}
                        onChange={(e) => updateRegistrationField(field.id, { placeholder: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    {/* Required */}
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Required
                      </label>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateRegistrationField(field.id, { required: e.target.checked })}
                        disabled={isMandatoryField}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Actions */}
                    <div className="col-span-3 flex items-end space-x-2">
                      <button
                        onClick={() => moveRegistrationField(field.id, 'up')}
                        disabled={index === 0}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                        title="Move up"
                      >
                        <ArrowUpIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => moveRegistrationField(field.id, 'down')}
                        disabled={index === settings.registrationFields.length - 1}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                        title="Move down"
                      >
                        <ArrowDownIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => removeRegistrationField(field.id)}
                        disabled={isMandatoryField}
                        className="p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isMandatoryField ? "Cannot delete mandatory field" : "Delete field"}
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Dropdown Options */}
                  {field.fieldType === 'dropdown' && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dropdown Options (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={field.options?.join(', ') || ''}
                        onChange={(e) => updateRegistrationField(field.id, {
                          options: e.target.value.split(',').map(o => o.trim()).filter(Boolean)
                        })}
                        placeholder="Option 1, Option 2, Option 3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}

                  {/* Parent Mobile Checkbox for Phone Fields */}
                  {field.fieldType === 'phone' && (
                    <div className="mt-4">
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          id={`parent-mobile-${field.id}`}
                          checked={field.isParentMobile || false}
                          onChange={(e) => updateRegistrationField(field.id, { isParentMobile: e.target.checked })}
                          className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`parent-mobile-${field.id}`} className="flex-1">
                          <span className="font-medium text-gray-900">Use as Parent Mobile Number</span>
                          <p className="text-sm text-gray-600 mt-1">
                            This number will be saved as parent contact and can be used for parent login
                          </p>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Ticket Form Tab */}
      {activeTab === 'ticket' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Ticket Creation Form Fields</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Configure what information agents collect when creating tickets
                </p>
              </div>
              <button
                onClick={addTicketField}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <PlusIcon className="h-5 w-5" />
                <span>Add Field</span>
              </button>
            </div>

            <div className="space-y-4">
              {settings.ticketFields.map((field, index) => (
                <div key={field.id} className={`border rounded-lg p-4 ${field.isFixed ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                  {field.isFixed && (
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-1 bg-blue-600 text-white text-xs font-semibold rounded">FIXED FIELD</span>
                        <span className="text-sm text-gray-700">Category field from category master (cannot be removed)</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <label htmlFor={`category-enabled-${field.id}`} className="text-sm font-medium text-gray-700">
                          Enabled
                        </label>
                        <input
                          type="checkbox"
                          id={`category-enabled-${field.id}`}
                          checked={field.isEnabled !== false}
                          onChange={(e) => updateTicketField(field.id, { isEnabled: e.target.checked })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-12 gap-4">
                    {/* Field Name */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Field Name
                      </label>
                      <input
                        type="text"
                        value={field.fieldName}
                        onChange={(e) => updateTicketField(field.id, { fieldName: e.target.value })}
                        disabled={field.isFixed}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Field Type */}
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Type
                      </label>
                      <select
                        value={field.fieldType}
                        onChange={(e) => updateTicketField(field.id, { fieldType: e.target.value as any })}
                        disabled={field.isFixed}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        {(field.fieldType === 'category' || field.fieldType === 'category-select') && <option value={field.fieldType}>Category (Master)</option>}
                        <option value="text">Text</option>
                        <option value="textarea">Textarea</option>
                        <option value="dropdown">Dropdown</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="file">File Upload</option>
                      </select>
                    </div>

                    {/* Placeholder */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Placeholder
                      </label>
                      <input
                        type="text"
                        value={field.placeholder}
                        onChange={(e) => updateTicketField(field.id, { placeholder: e.target.value })}
                        disabled={field.isFixed}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Required */}
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Required
                      </label>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateTicketField(field.id, { required: e.target.checked })}
                        disabled={field.isFixed}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-2 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Actions */}
                    <div className="col-span-3 flex items-end space-x-2">
                      <button
                        onClick={() => moveTicketField(field.id, 'up')}
                        disabled={index === 0}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                        title="Move up"
                      >
                        <ArrowUpIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => moveTicketField(field.id, 'down')}
                        disabled={index === settings.ticketFields.length - 1}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                        title="Move down"
                      >
                        <ArrowDownIcon className="h-5 w-5" />
                      </button>
                      {!field.isFixed && (
                        <button
                          onClick={() => removeTicketField(field.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                          title="Delete field"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Category Info */}
                  {field.fieldType === 'category' && (
                    <div className="mt-4 p-3 bg-blue-100 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900">
                        <strong>Categories loaded from Category Master:</strong> {categories.length} categories available
                        {categories.length > 0 && (
                          <span className="ml-2">({categories.slice(0, 3).map(c => c.name).join(', ')}{categories.length > 3 && '...'})</span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Dropdown Options */}
                  {field.fieldType === 'dropdown' && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dropdown Options (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={field.options?.join(', ') || ''}
                        onChange={(e) => updateTicketField(field.id, {
                          options: e.target.value.split(',').map(o => o.trim()).filter(Boolean)
                        })}
                        placeholder="Option 1, Option 2, Option 3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}

                  {/* File Upload Settings */}
                  {field.fieldType === 'file' && (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Allow Multiple Files
                        </label>
                        <input
                          type="checkbox"
                          checked={field.allowMultiple || false}
                          onChange={(e) => updateTicketField(field.id, { allowMultiple: e.target.checked })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Max Files
                        </label>
                        <input
                          type="number"
                          value={field.maxFiles || 5}
                          onChange={(e) => updateTicketField(field.id, { maxFiles: parseInt(e.target.value) })}
                          min="1"
                          max="10"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Allowed File Types
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {['pdf', 'jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'rar'].map((fileType) => (
                            <label key={fileType} className="flex items-center space-x-2 p-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(field.allowedFileTypes || []).includes(fileType)}
                                onChange={(e) => {
                                  const currentTypes = field.allowedFileTypes || [];
                                  const newTypes = e.target.checked
                                    ? [...currentTypes, fileType]
                                    : currentTypes.filter(t => t !== fileType);
                                  updateTicketField(field.id, { allowedFileTypes: newTypes });
                                }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <span className="text-sm text-gray-700">.{fileType}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

          </div>

          {/* Right Column - Preview Panel */}
          <div className="col-span-5">
            <div className="sticky top-6">
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <EyeIcon className="h-5 w-5 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Configuration Preview</h3>
                </div>

                {activeTab === 'general' && (
                  <div className="space-y-4">
                    <div className="border-b pb-3">
                      <h4 className="font-medium text-gray-900 mb-2">Agent Permissions</h4>
                      <ul className="space-y-1 text-sm text-gray-700">
                        <li className="flex items-center space-x-2">
                          <span>{settings.allowAgentToMarkResolved ? '✓' : '✗'}</span>
                          <span>Mark as Resolved</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <span>{settings.allowAgentToEscalate ? '✓' : '✗'}</span>
                          <span>Escalate at Creation</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <span>{settings.autoAssignToCreatingAgent ? '✓' : '✗'}</span>
                          <span>Auto-assign to Agent</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <span>{settings.requireStudentVerification ? '✓' : '✗'}</span>
                          <span>Require Verification</span>
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Notifications</h4>
                      <ul className="space-y-1 text-sm text-gray-700">
                        <li className="flex items-center space-x-2">
                          <span>{settings.notificationSettings.notifyStudentOnRegistration ? '✓' : '✗'}</span>
                          <span>On Registration</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <span>{settings.notificationSettings.notifyStudentOnTicketCreation ? '✓' : '✗'}</span>
                          <span>On Ticket Creation</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <span>{settings.notificationSettings.sendWelcomeEmail ? '✓' : '✗'}</span>
                          <span>Welcome Email</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 'registration' && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Registration Form Fields</h4>
                    <div className="overflow-auto max-h-[600px]">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">#</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Field Name</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Type</th>
                            <th className="px-3 py-2 text-center font-medium text-gray-700">Required</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {settings.registrationFields.sort((a, b) => a.order - b.order).map((field, index) => (
                            <tr key={field.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-600">{index + 1}</td>
                              <td className="px-3 py-2 font-medium text-gray-900">{field.fieldName}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  {field.fieldType}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {field.required ? (
                                  <span className="text-red-600 font-bold">*</span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {settings.registrationFields.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          No fields configured yet
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'ticket' && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Ticket Form Fields</h4>
                    <div className="overflow-auto max-h-[600px]">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">#</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Field Name</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Type</th>
                            <th className="px-3 py-2 text-center font-medium text-gray-700">Required</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {settings.ticketFields.sort((a, b) => a.order - b.order).map((field, index) => (
                            <tr key={field.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-600">{index + 1}</td>
                              <td className="px-3 py-2 font-medium text-gray-900">{field.fieldName}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                  {field.fieldType}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {field.required ? (
                                  <span className="text-red-600 font-bold">*</span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {settings.ticketFields.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          No fields configured yet
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      {/* Save Button */}
      <div className="flex justify-end space-x-4 pt-6 border-t mt-6">
        <button
          onClick={() => window.history.back()}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Saving...</span>
            </>
          ) : (
            <>
              <CheckCircleIcon className="h-5 w-5" />
              <span>Save Configuration</span>
            </>
          )}
        </button>
      </div>
    </div>
    </DashboardLayout>
  );
};

export default OfflineModuleSettings;
