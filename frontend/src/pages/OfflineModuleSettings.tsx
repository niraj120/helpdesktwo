import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
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
  BuildingOfficeIcon,
  MapPinIcon,
  PencilIcon,
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
  requireOtpVerification?: boolean; // For phone/email fields - require OTP verification
  order: number;
}

interface TicketField {
  id: string;
  fieldName: string;
  fieldType: 'text' | 'textarea' | 'dropdown' | 'number' | 'date' | 'file' | 'category' | 'category-select' | 'phone' | 'email' | string;
  required: boolean;
  placeholder: string;
  options?: string[];
  allowMultiple?: boolean;
  maxFiles?: number;
  allowedFileTypes?: string[];
  isFixed?: boolean; // True for category field - cannot be removed
  isEnabled?: boolean; // For category field - can be enabled/disabled
  order: number;
  hierarchyLevel?: number; // For hierarchy level fields
  requireOtpVerification?: boolean; // For phone/email fields - require OTP verification
}

interface Category {
  _id: string;
  name: string;
  description?: string;
  parentId?: string;
  level?: number;
}

interface HierarchyLevel {
  levelNumber: number;
  displayName: string;
  isRequired: boolean;
  showInList?: boolean;
}

interface HierarchyConfig {
  _id: string;
  projectId: string;
  levelCount: number;
  levels: HierarchyLevel[];
}

interface OfflineCenter {
  _id?: string;
  centerName: string;
  address: string;
  country?: string;
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
  isActive?: boolean;
  contacts?: Array<{
    name: string;
    role: string;
    mobile: string;
    email: string;
  }>;
}

interface OfflineSettings {
  registrationFields: RegistrationField[];
  ticketFields: TicketField[];
  allowAgentToMarkResolved: boolean;
  allowAgentToEscalate: boolean;
  autoAssignToCreatingAgent: boolean;
  requireStudentVerification: boolean;
  offlineTicketNumbering?: {
    prefix: string;
    startingNumber: number;
    separator: string;
    includeYear: boolean;
    includeMonth: boolean;
    resetFrequency: 'never' | 'yearly' | 'monthly';
  };
  notificationSettings: {
    notifyStudentOnRegistration: boolean;
    notifyStudentOnTicketCreation: boolean;
    sendWelcomeEmail: boolean;
  };
  offlineCenters?: OfflineCenter[];
}

const OfflineModuleSettings: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<'registration' | 'ticket' | 'general' | 'centers'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Ref to prevent duplicate API calls from React.StrictMode
  const hasFetchedSettings = useRef(false);
  const hasFetchedCategories = useRef(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [hierarchyConfig, setHierarchyConfig] = useState<HierarchyConfig | null>(null);
  const hasFetchedHierarchy = useRef(false);
  
  // Offline Centers state
  const [countries, setCountries] = useState<any[]>([]);
  const [centerStates, setCenterStates] = useState<Record<string, any[]>>({});
  const [centerCities, setCenterCities] = useState<Record<string, any[]>>({});
  const [editingCenter, setEditingCenter] = useState<OfflineCenter | null>(null);
  const [showCenterForm, setShowCenterForm] = useState(false);
  
  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const originalSettings = useRef<OfflineSettings | null>(null);
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
      { id: 'subject-fixed', fieldName: 'Subject', fieldType: 'text', required: true, placeholder: 'Brief description of issue', isFixed: true, order: 2 },
      { id: 'description-fixed', fieldName: 'Description', fieldType: 'textarea', required: true, placeholder: 'Detailed description...', isFixed: true, order: 3 },
      { id: '3', fieldName: 'Attachments', fieldType: 'file', required: false, placeholder: '', allowMultiple: true, maxFiles: 5, allowedFileTypes: ['pdf', 'jpg', 'png', 'doc', 'docx'], order: 4 },
    ],
    allowAgentToMarkResolved: true,
    allowAgentToEscalate: true,
    autoAssignToCreatingAgent: false,
    requireStudentVerification: false,
    offlineTicketNumbering: {
      prefix: 'OFF',
      startingNumber: 1,
      separator: '-',
      includeYear: true,
      includeMonth: false,
      resetFrequency: 'yearly',
    },
    notificationSettings: {
      notifyStudentOnRegistration: true,
      notifyStudentOnTicketCreation: true,
      sendWelcomeEmail: true,
    },
  });

  useEffect(() => {
    // Reset refs when projectId changes
    hasFetchedSettings.current = false;
    hasFetchedCategories.current = false;
    hasFetchedHierarchy.current = false;
    
    // Fetch all data when projectId changes
    const loadData = async () => {
      // Fetch hierarchy config first
      if (!hasFetchedHierarchy.current) {
        hasFetchedHierarchy.current = true;
        await fetchHierarchyConfig();
      }
      // Then fetch settings (will apply hierarchy fields after)
      if (!hasFetchedSettings.current) {
        hasFetchedSettings.current = true;
        await fetchSettings();
      }
      if (!hasFetchedCategories.current) {
        hasFetchedCategories.current = true;
        fetchCategories();
      }
    };
    
    loadData();
  }, [projectId]);

  // Apply hierarchy fields whenever hierarchyConfig changes and settings are loaded
  useEffect(() => {
    console.log('🔍 useEffect triggered - hierarchyConfig:', hierarchyConfig?.levelCount, 'loading:', loading);
    if (hierarchyConfig && hierarchyConfig.levels && hierarchyConfig.levels.length > 0 && !loading) {
      console.log('✅ Calling updateHierarchyFields');
      updateHierarchyFields(hierarchyConfig);
    }
  }, [hierarchyConfig, loading]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      console.log('🔄 Fetching offline settings for project:', projectId);
      
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/${projectId}/offline-settings`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('✅ Offline settings response:', response.data);

      if (response.data.success) {
        const fetchedSettings = response.data.data || {};
        
        console.log('📋 Fetched registration fields:', fetchedSettings.registrationFields?.length || 0);
        console.log('📋 Fetched ticket fields:', fetchedSettings.ticketFields?.length || 0);
        
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
        if (!hasCategoryField && fetchedSettings.ticketFields) {
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
            ...fetchedSettings.ticketFields.map((f: TicketField) => ({
              ...f,
              order: (f.order || 0) + 1
            }))
          ];
        }
        
        // Merge with defaults to ensure we always have the structure
        const mergedSettings = {
          registrationFields: fetchedSettings.registrationFields || settings.registrationFields,
          ticketFields: fetchedSettings.ticketFields || settings.ticketFields,
          allowAgentToMarkResolved: fetchedSettings.allowAgentToMarkResolved ?? settings.allowAgentToMarkResolved,
          allowAgentToEscalate: fetchedSettings.allowAgentToEscalate ?? settings.allowAgentToEscalate,
          autoAssignToCreatingAgent: fetchedSettings.autoAssignToCreatingAgent ?? settings.autoAssignToCreatingAgent,
          requireStudentVerification: fetchedSettings.requireStudentVerification ?? settings.requireStudentVerification,
          offlineTicketNumbering: fetchedSettings.offlineTicketNumbering || settings.offlineTicketNumbering,
          notificationSettings: fetchedSettings.notificationSettings || settings.notificationSettings,
        };
        
        console.log('✅ Setting merged settings with', mergedSettings.registrationFields?.length, 'registration fields');
        console.log('🎫 Offline ticket numbering:', mergedSettings.offlineTicketNumbering);
        setSettings(mergedSettings);
        originalSettings.current = mergedSettings;
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error('❌ Error fetching offline settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('authToken');
      // Fetch all categories (including hierarchy tree) to get level information
      const response = await axios.get(
        `${API_CONFIG.API_URL}/hierarchy-config/${projectId}/tree`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        // Flatten the tree to get all categories with level info
        const flattenTree = (nodes: any[], result: Category[] = []): Category[] => {
          for (const node of nodes) {
            result.push({
              _id: node._id,
              name: node.name,
              level: node.level,
              parentId: node.parentId,
            });
            if (node.children && node.children.length > 0) {
              flattenTree(node.children, result);
            }
          }
          return result;
        };
        setCategories(flattenTree(response.data.data));
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fallback to old endpoint
      try {
        const token = localStorage.getItem('authToken');
        const response = await axios.get(
          `${API_CONFIG.API_URL}/categories/project/${projectId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (response.data.success) {
          setCategories(response.data.data);
        }
      } catch (err) {
        console.error('Fallback category fetch also failed:', err);
      }
    }
  };

  // Fetch hierarchy configuration to know how many category levels are configured
  const fetchHierarchyConfig = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/hierarchy-config/${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success && response.data.data) {
        console.log('✅ Hierarchy config loaded:', response.data.data.levelCount, 'levels');
        setHierarchyConfig(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching hierarchy config:', error);
    }
  };

  // Update ticket fields based on hierarchy configuration
  const updateHierarchyFields = (config: HierarchyConfig) => {
    console.log('🔄 Updating hierarchy fields with config:', config.levels?.length, 'levels');
    
    setSettings(prevSettings => {
      // Remove existing hierarchy/category fixed fields
      const nonHierarchyFields = prevSettings.ticketFields.filter(
        f => !f.isFixed || (f.fieldName !== 'Category' && !f.fieldType.startsWith('hierarchy-'))
      );
      
      console.log('📋 Non-hierarchy fields:', nonHierarchyFields.map(f => f.fieldName));
      
      // Create fixed fields for each hierarchy level
      const hierarchyFields: TicketField[] = config.levels
        .sort((a, b) => a.levelNumber - b.levelNumber)
        .map((level, index) => ({
          id: `hierarchy-level-${level.levelNumber}`,
          fieldName: level.displayName,
          fieldType: `hierarchy-level-${level.levelNumber}` as any,
          required: level.isRequired,
          placeholder: `Select ${level.displayName.toLowerCase()}`,
          isFixed: true,
          isEnabled: true,
          order: index + 1,
          hierarchyLevel: level.levelNumber,
        }));
      
      console.log('✅ Created hierarchy fields:', hierarchyFields.map(f => f.fieldName));
      
      // Update orders of non-hierarchy fields
      const reorderedFields = nonHierarchyFields.map((f, idx) => ({
        ...f,
        order: hierarchyFields.length + idx + 1
      }));
      
      const result = {
        ...prevSettings,
        ticketFields: [...hierarchyFields, ...reorderedFields]
      };
      
      console.log('📝 Final ticket fields:', result.ticketFields.map(f => `${f.fieldName} (${f.isFixed ? 'fixed' : 'custom'})`));
      
      return result;
    });
  };

  // Fetch countries for offline centers
  const fetchCountries = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/master/countries`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        // Map the response to include 'name' property from 'value'
        const formattedCountries = response.data.data.map((c: any) => ({
          _id: c._id,
          key: c.key,
          name: c.value // Map 'value' to 'name' for consistency
        }));
        setCountries(formattedCountries);
      }
    } catch (error) {
      console.error('Error fetching countries:', error);
    }
  };

  // Fetch states for a country
  const fetchStatesForCountry = async (countryId: string, centerId?: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/master/countries/${countryId}/states`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        // Map the response to include 'name' property from 'value'
        const formattedStates = response.data.data.map((s: any) => ({
          _id: s._id,
          key: s.key,
          name: s.value // Map 'value' to 'name' for consistency
        }));
        setCenterStates(prev => ({
          ...prev,
          [centerId || 'new']: formattedStates
        }));
      }
    } catch (error) {
      console.error('Error fetching states:', error);
    }
  };

  // Fetch cities for a state
  const fetchCitiesForState = async (stateId: string, centerId?: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/master/states/${stateId}/cities`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        // Map the response to include 'name' property from 'value'
        const formattedCities = response.data.data.map((c: any) => ({
          _id: c._id,
          key: c.key,
          name: c.value // Map 'value' to 'name' for consistency
        }));
        setCenterCities(prev => ({
          ...prev,
          [centerId || 'new']: formattedCities
        }));
      }
    } catch (error) {
      console.error('Error fetching cities:', error);
    }
  };

  // Add or update offline center
  const handleAddOrUpdateCenter = async (center: OfflineCenter) => {
    try {
      const token = localStorage.getItem('authToken');
      
      if (center._id && center._id !== 'new') {
        // Update existing center via API
        const response = await axios.put(
          `${API_CONFIG.API_URL}/centers/${center._id}`,
          center,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.data.success) {
          // Refresh centers list
          const centersResponse = await axios.get(
            `${API_CONFIG.API_URL}/centers?projectId=${projectId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setSettings({ ...settings, offlineCenters: centersResponse.data.data });
        }
      } else {
        // Create new center via API
        const response = await axios.post(
          `${API_CONFIG.API_URL}/centers`,
          { ...center, projectId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.data.success) {
          // Refresh centers list
          const centersResponse = await axios.get(
            `${API_CONFIG.API_URL}/centers?projectId=${projectId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setSettings({ ...settings, offlineCenters: centersResponse.data.data });
        }
      }
      
      setShowCenterForm(false);
      setEditingCenter(null);
    } catch (error) {
      console.error('Error saving center:', error);
      alert('Failed to save center. Please try again.');
    }
  };

  // Delete offline center
  const handleDeleteCenter = async (centerId: string) => {
    if (confirm('Are you sure you want to delete this center?')) {
      try {
        const token = localStorage.getItem('authToken');
        
        await axios.delete(
          `${API_CONFIG.API_URL}/centers/${centerId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        // Refresh centers list
        const centersResponse = await axios.get(
          `${API_CONFIG.API_URL}/centers?projectId=${projectId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSettings({ ...settings, offlineCenters: centersResponse.data.data });
      } catch (error) {
        console.error('Error deleting center:', error);
        alert('Failed to delete center. Please try again.');
      }
    }
  };

  // Load centers from API when component mounts or tab changes
  useEffect(() => {
    if (activeTab === 'centers' && projectId) {
      const loadCenters = async () => {
        try {
          const token = localStorage.getItem('authToken');
          const response = await axios.get(
            `${API_CONFIG.API_URL}/centers?projectId=${projectId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setSettings({ ...settings, offlineCenters: response.data.data });
        } catch (error) {
          console.error('Error loading centers:', error);
        }
      };
      loadCenters();
    }
  }, [activeTab, projectId]);

  // Fetch countries when centers tab is active
  useEffect(() => {
    if (activeTab === 'centers' && countries.length === 0) {
      fetchCountries();
    }
  }, [activeTab]);

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const token = localStorage.getItem('authToken');
      
      // Exclude centers from settings since they're managed separately via /api/centers
      const { offlineCenters, ...settingsWithoutCenters } = settings;
      
      await axios.put(
        `${API_CONFIG.API_URL}/projects/${projectId}/offline-settings`,
        settingsWithoutCenters,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      originalSettings.current = settings;
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
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
  };

  const removeTicketField = (id: string) => {
    setSettings({
      ...settings,
      ticketFields: settings.ticketFields.filter(f => f.id !== id),
    });
    setHasUnsavedChanges(true);
  };

  const updateTicketField = (id: string, updates: Partial<TicketField>) => {
    setSettings({
      ...settings,
      ticketFields: settings.ticketFields.map(f =>
        f.id === id ? { ...f, ...updates } : f
      ),
    });
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
  };

  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

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
        <ModuleHeader
          title="Offline Module Configuration"
          subtitle="Configure how agents register students and create queries for walk-in support"
        />

        {/* Unsaved Changes Warning */}
        {hasUnsavedChanges && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-300 rounded-lg flex items-start space-x-3">
            <svg className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold text-yellow-900">You have unsaved changes</h4>
              <p className="text-sm text-yellow-700 mt-1">
                Don't forget to click "Save Configuration" at the bottom to save your changes permanently.
              </p>
            </div>
          </div>
        )}

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
                  <span>Query Creation Form</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('centers')}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  activeTab === 'centers'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <BuildingOfficeIcon className="h-5 w-5" />
                  <span>Offline Centers</span>
                </div>
              </button>
            </div>

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Ticket Numbering Configuration */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Offline Query Numbering</h3>
            <p className="text-sm text-gray-600 mb-6">
              Configure how query numbers are generated for offline (walk-in) queries
            </p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prefix
                  </label>
                  <input
                    type="text"
                    value={settings.offlineTicketNumbering?.prefix ?? ''}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        offlineTicketNumbering: {
                          ...(settings.offlineTicketNumbering || { startingNumber: 1, separator: '-', includeYear: true, includeMonth: false, resetFrequency: 'yearly' }),
                          prefix: e.target.value.toUpperCase()
                        }
                      });
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="OFF"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Separator
                  </label>
                  <select
                    value={settings.offlineTicketNumbering?.separator || '-'}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        offlineTicketNumbering: {
                          ...(settings.offlineTicketNumbering || { prefix: 'OFF', startingNumber: 1, includeYear: true, includeMonth: false, resetFrequency: 'yearly' }),
                          separator: e.target.value
                        }
                      });
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="-">Hyphen (-)</option>
                    <option value="_">Underscore (_)</option>
                    <option value="/">Slash (/)</option>
                    <option value="">None</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Starting Number
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.offlineTicketNumbering?.startingNumber || 1}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        offlineTicketNumbering: {
                          ...(settings.offlineTicketNumbering || { prefix: 'OFF', separator: '-', includeYear: true, includeMonth: false, resetFrequency: 'yearly' }),
                          startingNumber: parseInt(e.target.value) || 1
                        }
                      });
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reset Frequency
                  </label>
                  <select
                    value={settings.offlineTicketNumbering?.resetFrequency || 'yearly'}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        offlineTicketNumbering: {
                          ...(settings.offlineTicketNumbering || { prefix: 'OFF', startingNumber: 1, separator: '-', includeYear: true, includeMonth: false }),
                          resetFrequency: e.target.value as 'never' | 'yearly' | 'monthly'
                        }
                      });
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="never">Never Reset</option>
                    <option value="yearly">Reset Yearly</option>
                    <option value="monthly">Reset Monthly</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="includeYear"
                    checked={settings.offlineTicketNumbering?.includeYear ?? true}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        offlineTicketNumbering: {
                          ...(settings.offlineTicketNumbering || { prefix: 'OFF', startingNumber: 1, separator: '-', includeMonth: false, resetFrequency: 'yearly' }),
                          includeYear: e.target.checked
                        }
                      });
                      setHasUnsavedChanges(true);
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="includeYear" className="text-sm font-medium text-gray-700">
                    Include Year in query number
                  </label>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="includeMonth"
                    checked={settings.offlineTicketNumbering?.includeMonth ?? false}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        offlineTicketNumbering: {
                          ...(settings.offlineTicketNumbering || { prefix: 'OFF', startingNumber: 1, separator: '-', includeYear: true, resetFrequency: 'yearly' }),
                          includeMonth: e.target.checked
                        }
                      });
                      setHasUnsavedChanges(true);
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="includeMonth" className="text-sm font-medium text-gray-700">
                    Include Month in query number
                  </label>
                </div>
              </div>

              {/* Preview */}
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-blue-900">Preview</p>
                    <p className="text-lg font-mono font-bold text-blue-700 mt-1">
                      {(() => {
                        const config = settings.offlineTicketNumbering || { prefix: 'OFF', separator: '-', includeYear: true, includeMonth: false };
                        let preview = config.prefix;
                        if (config.separator) preview += config.separator;
                        if (config.includeYear) preview += '2025';
                        if (config.includeMonth) {
                          if (config.includeYear && config.separator) preview += config.separator;
                          preview += '12';
                        }
                        if (config.separator) preview += config.separator;
                        preview += '0001';
                        return preview;
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Permissions</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="allowMarkResolved"
                  checked={settings.allowAgentToMarkResolved}
                  onChange={(e) => {
                    setSettings({ ...settings, allowAgentToMarkResolved: e.target.checked });
                    setHasUnsavedChanges(true);
                  }}
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
                  onChange={(e) => {
                    setSettings({ ...settings, allowAgentToEscalate: e.target.checked });
                    setHasUnsavedChanges(true);
                  }}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="allowEscalate" className="flex-1">
                  <span className="font-medium text-gray-900">Allow Escalation at Creation</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Agents can escalate queries to specialized agents during creation
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="autoAssign"
                  checked={settings.autoAssignToCreatingAgent}
                  onChange={(e) => {
                    setSettings({ ...settings, autoAssignToCreatingAgent: e.target.checked });
                    setHasUnsavedChanges(true);
                  }}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="autoAssign" className="flex-1">
                  <span className="font-medium text-gray-900">Auto-assign to Counselor</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Automatically assign offline tickets to the counselor who created them
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="requireVerification"
                  checked={settings.requireStudentVerification}
                  onChange={(e) => {
                    setSettings({ ...settings, requireStudentVerification: e.target.checked });
                    setHasUnsavedChanges(true);
                  }}
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
                  onChange={(e) => {
                    setSettings({
                      ...settings,
                      notificationSettings: {
                        ...settings.notificationSettings,
                        notifyStudentOnRegistration: e.target.checked,
                      },
                    });
                    setHasUnsavedChanges(true);
                  }}
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
                  onChange={(e) => {
                    setSettings({
                      ...settings,
                      notificationSettings: {
                        ...settings.notificationSettings,
                        notifyStudentOnTicketCreation: e.target.checked,
                      },
                    });
                    setHasUnsavedChanges(true);
                  }}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="notifyTicket" className="flex-1">
                  <span className="font-medium text-gray-900">Notify on Query Creation</span>
                  <p className="text-sm text-gray-600 mt-1">
                    Send email notification when query is created on their behalf
                  </p>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="welcomeEmail"
                  checked={settings.notificationSettings.sendWelcomeEmail}
                  onChange={(e) => {
                    setSettings({
                      ...settings,
                      notificationSettings: {
                        ...settings.notificationSettings,
                        sendWelcomeEmail: e.target.checked,
                      },
                    });
                    setHasUnsavedChanges(true);
                  }}
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

                  {/* OTP Verification Checkbox for Phone/Email Fields */}
                  {(field.fieldType === 'phone' || field.fieldType === 'email') && (
                    <div className="mt-4">
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          id={`otp-verification-${field.id}`}
                          checked={field.requireOtpVerification || false}
                          onChange={(e) => updateRegistrationField(field.id, { requireOtpVerification: e.target.checked })}
                          className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`otp-verification-${field.id}`} className="flex-1">
                          <span className="font-medium text-gray-900">Require OTP Verification</span>
                          <p className="text-sm text-gray-600 mt-1">
                            {field.fieldType === 'phone' 
                              ? 'Send OTP to this phone number and verify before proceeding'
                              : 'Send OTP to this email address and verify before proceeding'}
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
                <h3 className="text-lg font-semibold text-gray-900">Query Creation Form Fields</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Configure what information agents collect when creating queries
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
                        <span className="text-sm text-gray-700">
                          {field.hierarchyLevel 
                            ? `${field.fieldName} (Hierarchy Level ${field.hierarchyLevel}) - loaded from Category Master` 
                            : 'Category field from category master (cannot be removed)'}
                        </span>
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
                        {field.fieldType.startsWith('hierarchy-level-') && <option value={field.fieldType}>Hierarchy Level</option>}
                        <option value="text">Text</option>
                        <option value="textarea">Textarea</option>
                        <option value="dropdown">Dropdown</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="phone">Phone</option>
                        <option value="email">Email</option>
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
                  {(field.fieldType === 'category' || field.fieldType.startsWith('hierarchy-level-')) && (
                    <div className="mt-4 p-3 bg-blue-100 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900">
                        <strong>Categories loaded from Category Master:</strong>{' '}
                        {field.hierarchyLevel 
                          ? `${categories.filter(c => c.level === field.hierarchyLevel).length} ${field.fieldName.toLowerCase()}(s) available`
                          : `${categories.length} categories available`
                        }
                        {categories.length > 0 && !field.hierarchyLevel && (
                          <span className="ml-2">({categories.slice(0, 3).map(c => c.name).join(', ')}{categories.length > 3 && '...'})</span>
                        )}
                        {field.hierarchyLevel && categories.filter(c => c.level === field.hierarchyLevel).length > 0 && (
                          <span className="ml-2">
                            ({categories.filter(c => c.level === field.hierarchyLevel).slice(0, 3).map(c => c.name).join(', ')}
                            {categories.filter(c => c.level === field.hierarchyLevel).length > 3 && '...'})
                          </span>
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

                  {/* OTP Verification Checkbox for Phone/Email Fields */}
                  {(field.fieldType === 'phone' || field.fieldType === 'email') && (
                    <div className="mt-4">
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          id={`ticket-otp-verification-${field.id}`}
                          checked={field.requireOtpVerification || false}
                          onChange={(e) => updateTicketField(field.id, { requireOtpVerification: e.target.checked })}
                          className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`ticket-otp-verification-${field.id}`} className="flex-1">
                          <span className="font-medium text-gray-900">Require OTP Verification</span>
                          <p className="text-sm text-gray-600 mt-1">
                            {field.fieldType === 'phone' 
                              ? 'Send OTP to this phone number and verify before proceeding'
                              : 'Send OTP to this email address and verify before proceeding'}
                          </p>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Offline Centers Tab */}
      {activeTab === 'centers' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-6" style={{ position: 'relative', zIndex: 10 }}>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Offline Support Centers</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Manage physical locations where agents provide walk-in support
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingCenter(null);
                  setShowCenterForm(true);
                }}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                style={{ position: 'relative', zIndex: 20 }}
              >
                <PlusIcon className="h-5 w-5" />
                <span>Add Center</span>
              </button>
            </div>

            {/* Centers List */}
            {(!settings.offlineCenters || settings.offlineCenters.length === 0) && !showCenterForm ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <BuildingOfficeIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-4">No offline centers configured yet</p>
                <button
                  onClick={() => setShowCenterForm(true)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Add your first offline center
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {(settings.offlineCenters || []).map((center) => (
                  <div key={center._id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h4 className="font-semibold text-gray-900">{center.centerName}</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                          <div>
                            <MapPinIcon className="h-4 w-4 inline mr-1" />
                            {center.city}, {center.state}{center.country && `, ${center.country}`} - {center.pincode}
                          </div>
                          <div>
                            📧 {center.email}
                          </div>
                          <div className="col-span-2">
                            📍 {center.address}
                          </div>
                          <div>
                            📞 {center.phone}
                          </div>
                          <div>
                            🕒 {center.workingHours}
                          </div>
                          {center.features && center.features.length > 0 && (
                            <div className="col-span-2">
                              <span className="font-medium">Features: </span>
                              {center.features.join(', ')}
                            </div>
                          )}
                          {center.contacts && center.contacts.length > 0 && (
                            <div className="col-span-2">
                              <span className="font-medium">Contacts: </span>
                              {center.contacts.map((c, i) => `${c.name} (${c.mobile})`).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => {
                            setEditingCenter(center);
                            setShowCenterForm(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCenter(center._id!)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Center Form (Add/Edit) */}
            {showCenterForm && (
              <div className="mt-6 border-t pt-6">
                <h4 className="font-semibold text-gray-900 mb-4">
                  {editingCenter ? 'Edit Center' : 'Add New Center'}
                </h4>
                <CenterForm
                  center={editingCenter}
                  countries={countries}
                  states={centerStates[editingCenter?._id || 'new'] || []}
                  cities={centerCities[editingCenter?._id || 'new'] || []}
                  onSave={handleAddOrUpdateCenter}
                  onCancel={() => {
                    setShowCenterForm(false);
                    setEditingCenter(null);
                  }}
                  onCountryChange={(countryId) => fetchStatesForCountry(countryId, editingCenter?._id || 'new')}
                  onStateChange={(stateId) => fetchCitiesForState(stateId, editingCenter?._id || 'new')}
                />
              </div>
            )}
          </div>
        </div>
      )}

          </div>

          {/* Right Column - Preview Panel */}
          <div className="col-span-5">
            <div className="sticky top-6" style={{ zIndex: 1 }}>
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

                {activeTab === 'centers' && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Offline Centers Summary</h4>
                    <div className="space-y-3">
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="text-2xl font-bold text-blue-900">
                          {(settings.offlineCenters || []).length}
                        </div>
                        <div className="text-sm text-blue-700">Total Centers</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="text-2xl font-bold text-green-900">
                          {(settings.offlineCenters || []).filter(c => c.isActive).length}
                        </div>
                        <div className="text-sm text-green-700">Active Centers</div>
                      </div>
                      {(settings.offlineCenters || []).length > 0 && (
                        <div className="mt-4">
                          <div className="text-xs font-medium text-gray-600 mb-2">Locations:</div>
                          <div className="space-y-2 text-sm">
                            {(settings.offlineCenters || []).map((center, idx) => (
                              <div key={idx} className="flex items-start space-x-2 text-gray-700">
                                <MapPinIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span className="text-xs">{center.centerName} - {center.city}</span>
                              </div>
                            ))}
                          </div>
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
          onClick={() => {
            if (hasUnsavedChanges && !confirm('You have unsaved changes. Are you sure you want to leave without saving?')) {
              return;
            }
            window.history.back();
          }}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className={`px-6 py-2 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2 ${
            hasUnsavedChanges ? 'bg-orange-600 hover:bg-orange-700 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Saving...</span>
            </>
          ) : (
            <>
              <CheckCircleIcon className="h-5 w-5" />
              <span>{hasUnsavedChanges ? 'Save Changes Now' : 'Save Configuration'}</span>
            </>
          )}
        </button>
      </div>
    </div>
    </DashboardLayout>
  );
};

// Center Form Component
interface CenterFormProps {
  center: OfflineCenter | null;
  countries: any[];
  states: any[];
  cities: any[];
  onSave: (center: OfflineCenter) => void;
  onCancel: () => void;
  onCountryChange: (countryId: string) => void;
  onStateChange: (stateId: string) => void;
}

const CenterForm: React.FC<CenterFormProps> = ({
  center,
  countries,
  states,
  cities,
  onSave,
  onCancel,
  onCountryChange,
  onStateChange,
}) => {
  const [formData, setFormData] = useState<OfflineCenter>({
    _id: center?._id,
    centerName: center?.centerName || '',
    address: center?.address || '',
    country: center?.country || '',
    city: center?.city || '',
    state: center?.state || '',
    pincode: center?.pincode || '',
    phone: center?.phone || '',
    email: center?.email || '',
    workingHours: center?.workingHours || '',
    latitude: center?.latitude,
    longitude: center?.longitude,
    features: center?.features || [],
    mapLink: center?.mapLink || '',
    googleMapLink: center?.googleMapLink || '',
    contacts: center?.contacts || [],
  });

  const [newFeature, setNewFeature] = useState('');
  const [newContact, setNewContact] = useState({ name: '', role: '', mobile: '', email: '' });
  const [isInitialized, setIsInitialized] = useState(false);

  // Update form data when center prop changes
  useEffect(() => {
    if (center) {
      setFormData({
        _id: center._id,
        centerName: center.centerName || '',
        address: center.address || '',
        country: center.country || '',
        city: center.city || '',
        state: center.state || '',
        pincode: center.pincode || '',
        phone: center.phone || '',
        email: center.email || '',
        workingHours: center.workingHours || '',
        latitude: center.latitude,
        longitude: center.longitude,
        features: center.features || [],
        mapLink: center.mapLink || '',
        googleMapLink: center.googleMapLink || '',
        contacts: center.contacts || [],
      });
      setIsInitialized(false);
    }
  }, [center?._id]);

  // Load states when editing a center and countries are available
  useEffect(() => {
    if (center && center.country && countries.length > 0 && !isInitialized) {
      const countryObj = countries.find(c => c.name === center.country);
      if (countryObj?._id) {
        onCountryChange(countryObj._id);
        setIsInitialized(true);
      }
    }
  }, [center?.country, countries.length, isInitialized]);

  // Load cities when editing a center and states are available
  useEffect(() => {
    if (center && center.state && states.length > 0 && isInitialized) {
      const stateObj = states.find(s => s.name === center.state);
      if (stateObj?._id) {
        onStateChange(stateObj._id);
      }
    }
  }, [center?.state, states.length, isInitialized]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.centerName || !formData.address || !formData.city || !formData.state || !formData.pincode) {
      alert('Please fill in all required fields');
      return;
    }
    
    onSave(formData);
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const countryId = e.target.value;
    const selectedCountry = countries.find(c => c._id === countryId);
    setFormData({ ...formData, country: selectedCountry?.name || '', state: '', city: '' });
    if (countryId) {
      onCountryChange(countryId);
    }
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const stateId = e.target.value;
    const selectedState = states.find(s => s._id === stateId);
    setFormData({ ...formData, state: selectedState?.name || '', city: '' });
    if (stateId) {
      onStateChange(stateId);
    }
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cityId = e.target.value;
    const selectedCity = cities.find(c => c._id === cityId);
    setFormData({ ...formData, city: selectedCity?.name || '' });
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFormData({ ...formData, features: [...(formData.features || []), newFeature.trim()] });
      setNewFeature('');
    }
  };

  const removeFeature = (index: number) => {
    const updatedFeatures = (formData.features || []).filter((_, i) => i !== index);
    setFormData({ ...formData, features: updatedFeatures });
  };

  const addContact = () => {
    if (newContact.name.trim() && newContact.mobile.trim()) {
      setFormData({ ...formData, contacts: [...(formData.contacts || []), newContact] });
      setNewContact({ name: '', role: '', mobile: '', email: '' });
    }
  };

  const removeContact = (index: number) => {
    const updatedContacts = (formData.contacts || []).filter((_, i) => i !== index);
    setFormData({ ...formData, contacts: updatedContacts });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {/* Center Name */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Center Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.centerName}
            onChange={(e) => setFormData({ ...formData, centerName: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Main Campus Support Center"
            required
          />
        </div>

        {/* Address */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Address <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Full address with street and building"
            rows={2}
            required
          />
        </div>

        {/* Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Country <span className="text-red-500">*</span>
          </label>
          <select
            value={countries.find(c => c.name === formData.country)?._id || ''}
            onChange={handleCountryChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">Select Country</option>
            {countries.map((country) => (
              <option key={country._id} value={country._id}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        {/* State */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            State <span className="text-red-500">*</span>
          </label>
          <select
            value={states.find(s => s.name === formData.state)?._id || ''}
            onChange={handleStateChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!formData.country}
            required
          >
            <option value="">Select State</option>
            {states.map((state) => (
              <option key={state._id} value={state._id}>
                {state.name}
              </option>
            ))}
          </select>
        </div>

        {/* City */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City <span className="text-red-500">*</span>
          </label>
          <select
            value={cities.find(c => c.name === formData.city)?._id || ''}
            onChange={handleCityChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!formData.state}
            required
          >
            <option value="">Select City</option>
            {cities.map((city) => (
              <option key={city._id} value={city._id}>
                {city.name}
              </option>
            ))}
          </select>
        </div>

        {/* Pincode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pincode <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.pincode}
            onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., 400001"
            required
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="+91 98765 43210"
            required
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="center@example.com"
            required
          />
        </div>

        {/* Working Hours */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Working Hours <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.workingHours}
            onChange={(e) => setFormData({ ...formData, workingHours: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Mon-Fri: 9AM-6PM"
            required
          />
        </div>

        {/* Map Link */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Map Link (Optional)
          </label>
          <input
            type="url"
            value={formData.mapLink || ''}
            onChange={(e) => setFormData({ ...formData, mapLink: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://maps.app.goo.gl/..."
          />
        </div>

        {/* Google Map Link */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Google Map Link (Optional)
          </label>
          <input
            type="url"
            value={formData.googleMapLink || ''}
            onChange={(e) => setFormData({ ...formData, googleMapLink: e.target.value })}
            onBlur={(e) => {
              const url = e.target.value;
              if (url) {
                // Extract coordinates from various Google Maps URL formats
                // Format 1: https://www.google.com/maps?q=28.6139,77.2090
                // Format 2: https://www.google.com/maps/place/.../@28.6139,77.2090
                // Format 3: https://maps.app.goo.gl/... (shortened, harder to parse)
                // Format 4: https://www.google.com/maps/@28.6139,77.2090,15z
                
                let lat: number | undefined;
                let lng: number | undefined;
                
                try {
                  // Try to match coordinates in various formats
                  const patterns = [
                    /@(-?\d+\.\d+),(-?\d+\.\d+)/,  // @lat,lng
                    /q=(-?\d+\.\d+),(-?\d+\.\d+)/,  // q=lat,lng
                    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // !3dlat!4dlng
                  ];
                  
                  for (const pattern of patterns) {
                    const match = url.match(pattern);
                    if (match) {
                      lat = parseFloat(match[1]);
                      lng = parseFloat(match[2]);
                      break;
                    }
                  }
                  
                  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
                    setFormData({ 
                      ...formData, 
                      googleMapLink: url,
                      latitude: lat, 
                      longitude: lng 
                    });
                  }
                } catch (error) {
                  console.error('Failed to extract coordinates from Google Maps URL:', error);
                }
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://www.google.com/maps/..."
          />
        </div>

        {/* Latitude */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Latitude (Optional)
          </label>
          <input
            type="number"
            step="any"
            value={formData.latitude || ''}
            onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., 28.6139"
          />
        </div>

        {/* Longitude */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Longitude (Optional)
          </label>
          <input
            type="number"
            step="any"
            value={formData.longitude || ''}
            onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., 77.2090"
          />
        </div>
      </div>

      {/* Features Array */}
      <div className="border-t pt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Features (Optional)
        </label>
        <div className="flex space-x-2 mb-2">
          <input
            type="text"
            value={newFeature}
            onChange={(e) => setNewFeature(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFeature();
              }
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Free WiFi, Parking Available"
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              addFeature();
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center justify-center"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(formData.features || []).map((feature, index) => (
            <span key={index} className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              <span>{feature}</span>
              <button
                type="button"
                onClick={() => removeFeature(index)}
                className="hover:text-blue-900"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Contacts Array */}
      <div className="border-t pt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Contact Persons (Optional)
        </label>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input
            type="text"
            value={newContact.name}
            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Name"
          />
          <input
            type="text"
            value={newContact.role}
            onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Role"
          />
          <input
            type="tel"
            value={newContact.mobile}
            onChange={(e) => setNewContact({ ...newContact, mobile: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Mobile"
          />
          <input
            type="email"
            value={newContact.email}
            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Email"
          />
          <button
            type="button"
            onClick={addContact}
            className="col-span-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center justify-center space-x-2"
          >
            <PlusIcon className="h-5 w-5" />
            <span>Add Contact</span>
          </button>
        </div>
        <div className="space-y-2">
          {(formData.contacts || []).map((contact, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="text-sm">
                <div className="font-medium">{contact.name} {contact.role && `- ${contact.role}`}</div>
                <div className="text-gray-600">{contact.mobile} {contact.email && `• ${contact.email}`}</div>
              </div>
              <button
                type="button"
                onClick={() => removeContact(index)}
                className="text-red-600 hover:text-red-700"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {center ? 'Update Center' : 'Add Center'}
        </button>
      </div>
    </form>
  );
};

export default OfflineModuleSettings;
