import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  ClockIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import { StudentLoginModal } from '../components/StudentLoginModal';
import { LanguageToggle } from '../components/LanguageToggle';
import KBChatbot from '../components/KBChatbot';
import { API_CONFIG } from '../config/constants';
import './StudentPortal.css';

// Google Maps type declarations
declare global {
  interface Window {
    google: any;
  }
}

interface ProjectBranding {
  projectId: string;
  name: string;
  customUrlPath: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  welcomeText: string;
  footerText: string;
  knowledgeBase?: boolean;
  branding?: {
    colorTheme?: {
      primary: string;
      secondary: string;
      accent?: string;
      background?: string;
    };
    logo?: string;
    headerText?: string;
  };
}

interface OnlineFormField {
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'email' | 'phone' | 'url' | 'textarea' | 'dropdown' | 'multiselect' | 'radio' | 'checkbox' | 'file';
  required: boolean;
  placeholder: string;
  options?: string[];
  // file-specific
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
  contacts?: Array<{
    name: string;
    role: string;
    mobile: string;
    email: string;
  }>;
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

interface StudentPortalProps {
  hideHeader?: boolean;
}

const StudentPortal: React.FC<StudentPortalProps> = ({ hideHeader = false }) => {
  const { customUrlPath } = useParams<{ customUrlPath: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectBranding, setProjectBranding] = useState<ProjectBranding | null>(null);
  const [ticketSettings, setTicketSettings] = useState<TicketSubmissionSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'online' | 'offline' | 'kb'>('online');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fieldFiles, setFieldFiles] = useState<Record<string, File[]>>({}); // per-field file storage
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'state' | 'city' | 'pincode'>('all');
  const [filteredCenters, setFilteredCenters] = useState<OfflineCenter[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [uniqueStates, setUniqueStates] = useState<string[]>([]);
  const [uniqueCities, setUniqueCities] = useState<string[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [sortBy, setSortBy] = useState<'none' | 'district' | 'distance' | 'alphabetical'>('none');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [centerCoordinates, setCenterCoordinates] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [kbArticles, setKbArticles] = useState<any[]>([]);
  const [kbCategories, setKbCategories] = useState<any[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  const [kbSearchQuery, setKbSearchQuery] = useState('');

  const fetchSpecificKBArticle = async (articleId: string) => {
    try {
      setKbLoading(true);
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/${articleId}`);
      if (response.data.success) {
        setSelectedArticle(response.data.data);
        // Also fetch all articles for navigation
        if (kbArticles.length === 0) {
          fetchKBArticles();
        }
      }
    } catch (error) {
      console.error('Error fetching KB article:', error);
    } finally {
      setKbLoading(false);
    }
  };

  // Fetch KB articles when KB tab is active
  useEffect(() => {
    if (activeTab === 'kb' && projectBranding?.knowledgeBase && kbArticles.length === 0) {
      fetchKBArticles();
    }
  }, [activeTab]);

  const fetchKBArticles = async () => {
    try {
      setKbLoading(true);
      console.log('Fetching KB articles for project:', projectBranding?.projectId);
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/project/${projectBranding?.projectId}`);
      console.log('KB API Response:', response.data);
      
      // Handle different response structures
      if (response.data.success) {
        const articles = response.data.data?.articles || response.data.data || [];
        console.log('KB Articles found:', articles);
        setKbArticles(Array.isArray(articles) ? articles : []);
        setKbCategories(response.data.data?.categories || []);
      } else {
        console.log('KB API returned success=false');
      }
    } catch (error) {
      console.error('Error fetching KB articles:', error);
    } finally {
      setKbLoading(false);
    }
  };

  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch project branding
        const brandingResponse = await axios.get(
          `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`
        );
        
        // Extract branding data from response
        const brandingData = brandingResponse.data.success 
          ? brandingResponse.data.data 
          : brandingResponse.data;
        
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
        
        // Map the branding colors from nested structure
        const branding: ProjectBranding = {
          projectId: brandingData.projectId,
          name: brandingData.name,
          customUrlPath: brandingData.customUrlPath,
          logoUrl: brandingData.branding?.logo || null,
          welcomeText: brandingData.branding?.headerText || 'Welcome!',
          footerText: brandingData.branding?.footerText || '© 2025. All rights reserved.',
          knowledgeBase: brandingData.knowledgeBase,
          primaryColor: colorTheme?.primary || '#49bc8f',
          secondaryColor: colorTheme?.secondary || '#64748b',
          branding: { ...brandingData.branding, colorTheme },
        };
        
        setProjectBranding(branding);

        // Fetch ticket submission settings
        const cacheBuster = `?t=${Date.now()}`;
        const settingsResponse = await axios.get(
          `${API_CONFIG.API_URL}/projects/${branding.projectId}/ticket-settings${cacheBuster}`
        );
        const ticketSettings = settingsResponse.data.success 
          ? settingsResponse.data.data 
          : settingsResponse.data;
        setTicketSettings(ticketSettings);

        // Set default tab based on mode
        // Check if we have a kbArticle parameter in URL
        const urlParams = new URLSearchParams(window.location.search);
        const kbArticleId = urlParams.get('kbArticle');
        
        if (kbArticleId && branding.knowledgeBase) {
          // If KB article is specified, switch to KB tab and load it
          setActiveTab('kb');
          // Fetch the specific article
          try {
            const response = await axios.get(`${API_CONFIG.API_URL}/kb/${kbArticleId}`);
            if (response.data.success) {
              setSelectedArticle(response.data.data);
            }
          } catch (error) {
            console.error('Error fetching KB article:', error);
          }
        } else if (ticketSettings.mode === 'online') {
          setActiveTab('online');
        } else if (ticketSettings.mode === 'offline') {
          setActiveTab('offline');
        }

        // Initialize filtered centers
        setFilteredCenters(ticketSettings.offlineCenters || []);

        // Extract unique states and cities for filters
        if (ticketSettings.offlineCenters) {
          const states = [...new Set(ticketSettings.offlineCenters.map((c: OfflineCenter) => c.state))] as string[];
          const cities = [...new Set(ticketSettings.offlineCenters.map((c: OfflineCenter) => c.city))] as string[];
          setUniqueStates(states.sort());
          setUniqueCities(cities.sort());
        }
      } catch (err: any) {
        console.error('Error fetching project data:', err);
        setError(err.response?.data?.message || 'Project not found');
      } finally {
        setLoading(false);
      }
    };

    if (customUrlPath) {
      fetchProjectData();
    }
  }, [customUrlPath]);

  // Get user's location for distance-based sorting
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.log('Geolocation permission denied or unavailable:', error);
        }
      );
    }
  }, []);

  // Helper function to calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    // Filter centers based on search query and filter type
    if (ticketSettings?.offlineCenters) {
      let filtered = ticketSettings.offlineCenters;

      // Apply search query filter
      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase();
        filtered = filtered.filter((center) => {
          if (filterType === 'state') {
            return center.state.toLowerCase().includes(searchLower);
          } else if (filterType === 'city') {
            return center.city.toLowerCase().includes(searchLower);
          } else if (filterType === 'pincode') {
            return center.pincode.includes(searchQuery);
          } else {
            // 'all' - search across all fields
            return (
              center.centerName.toLowerCase().includes(searchLower) ||
              center.city.toLowerCase().includes(searchLower) ||
              center.state.toLowerCase().includes(searchLower) ||
              center.pincode.includes(searchQuery)
            );
          }
        });
      }

      // Apply sorting
      if (sortBy === 'district') {
        // Sort by state (district) alphabetically
        filtered = [...filtered].sort((a, b) => a.state.localeCompare(b.state));
      } else if (sortBy === 'alphabetical') {
        // Sort by center name alphabetically
        filtered = [...filtered].sort((a, b) => a.centerName.localeCompare(b.centerName));
      } else if (sortBy === 'distance' && userLocation) {
        console.log('🗺️ Sorting by distance. User location:', userLocation);
        
        // Helper function to extract coordinates from Google Maps link
        const extractCoordinatesFromLink = (center: OfflineCenter): { lat: number; lng: number } | null => {
          // First check if center already has coordinates
          if (center.latitude && center.longitude) {
            return { lat: center.latitude, lng: center.longitude };
          }
          
          const link = center.mapLink || center.googleMapLink;
          if (!link) return null;
          
          try {
            // Format 1: 3d<lat>!4d<lng> pattern (most common in place links)
            // e.g., 3d19.1594674!4d72.8355775
            let match = link.match(/3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
            if (match) {
              console.log(`✅ Found 3d/4d format: ${match[1]}, ${match[2]}`);
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }
            
            // Format 2: @lat,lng pattern (e.g., https://www.google.com/maps/@19.0760,72.8777,15z)
            match = link.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (match) {
              console.log(`✅ Found @ format: ${match[1]}, ${match[2]}`);
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }
            
            // Format 3: ?q=lat,lng pattern (e.g., https://www.google.com/maps?q=19.0760,72.8777)
            match = link.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (match) {
              console.log(`✅ Found q= format: ${match[1]}, ${match[2]}`);
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }
            
            // Format 4: /place/ or /dir/ with coordinates
            match = link.match(/\/(?:place|dir)\/[^\/]*@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (match) {
              console.log(`✅ Found place/dir format: ${match[1]}, ${match[2]}`);
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }
            
            // Format 5: ll= pattern
            match = link.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (match) {
              console.log(`✅ Found ll= format: ${match[1]}, ${match[2]}`);
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }
            
            console.log(`❌ No coordinate pattern found in: ${link}`);
          } catch (e) {
            console.error('Error parsing coordinates from link:', link, e);
          }
          
          return null;
        };
        
        // For centers with shortened URLs or no coordinates, we'll use Geocoding API
        // This will be done asynchronously after initial sort
        const centersWithDistances: Array<{ center: OfflineCenter; distance: number }> = [];
        const centersNeedingGeocode: OfflineCenter[] = [];
        
        filtered.forEach(center => {
          const coords = extractCoordinatesFromLink(center);
          if (coords) {
            const distance = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              coords.lat,
              coords.lng
            );
            console.log(`📏 ${center.centerName}: ${distance.toFixed(2)} km`);
            centersWithDistances.push({ center, distance });
          } else {
            // Will geocode based on address
            console.log(`🔍 ${center.centerName}: Will use geocoding for address`);
            centersNeedingGeocode.push(center);
          }
        });
        
        // Sort by distance
        centersWithDistances.sort((a, b) => a.distance - b.distance);
        
        console.log('✅ Sorted order:', centersWithDistances.map(c => `${c.center.centerName} (${c.distance.toFixed(2)} km)`));
        
        // Extract just the centers
        const sortedWithCoords = centersWithDistances.map(item => item.center);
        
        // Geocode centers that need it (using Google Maps Geocoding API)
        if (centersNeedingGeocode.length > 0 && window.google) {
          const geocoder = new window.google.maps.Geocoder();
          const newCoords = new Map(centerCoordinates);
          let geocodedCount = 0;
          const geocodedCenters: Array<{ center: OfflineCenter; distance: number }> = [];
          
          centersNeedingGeocode.forEach(center => {
            const address = `${center.address}, ${center.city}, ${center.state} ${center.pincode}`;
            
            geocoder.geocode({ address }, (results: any, status: any) => {
              if (status === 'OK' && results[0]) {
                const lat = results[0].geometry.location.lat();
                const lng = results[0].geometry.location.lng();
                const distance = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
                
                console.log(`📍 Geocoded ${center.centerName}: ${distance.toFixed(2)} km`);
                
                // Store coordinates for this center
                const key = `${center.centerName}-${center.address}`;
                newCoords.set(key, { lat, lng });
                geocodedCenters.push({ center, distance });
                geocodedCount++;
                
                // When all geocoding is done, update the list
                if (geocodedCount === centersNeedingGeocode.length) {
                  // Combine and sort all centers
                  const allCentersWithDistance = [...centersWithDistances, ...geocodedCenters];
                  allCentersWithDistance.sort((a, b) => a.distance - b.distance);
                  const allSorted = allCentersWithDistance.map(item => item.center);
                  
                  setCenterCoordinates(newCoords);
                  setFilteredCenters(allSorted);
                }
              } else {
                geocodedCount++;
                if (geocodedCount === centersNeedingGeocode.length) {
                  // Update with what we have
                  const allCentersWithDistance = [...centersWithDistances, ...geocodedCenters];
                  allCentersWithDistance.sort((a, b) => a.distance - b.distance);
                  const allSorted = allCentersWithDistance.map(item => item.center);
                  
                  setCenterCoordinates(newCoords);
                  setFilteredCenters(allSorted);
                }
              }
            });
          });
        }
        
        // Initial display with sorted centers + centers needing geocoding at the end
        filtered = [...sortedWithCoords, ...centersNeedingGeocode];
      }

      setFilteredCenters(filtered);
    }
  }, [searchQuery, filterType, ticketSettings, sortBy, userLocation]);

  const handleInputChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleFieldFileChange = (fieldName: string, files: FileList | null, field: OnlineFormField) => {
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    const maxSize = (field.maxFileSizeMB || 10) * 1024 * 1024;
    const allowedTypes = field.allowedFileTypes || [];

    // Validate file size
    const oversizedFiles = filesArray.filter((file) => file.size > maxSize);
    if (oversizedFiles.length > 0) {
      setSubmitError(
        `Some files for "${fieldName}" exceed the maximum size of ${field.maxFileSizeMB || 10} MB`
      );
      return;
    }

    // Validate file types
    if (allowedTypes.length > 0) {
      const invalidFiles = filesArray.filter((file) => {
        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
        return !allowedTypes.includes(fileExt);
      });
      if (invalidFiles.length > 0) {
        setSubmitError(
          `Invalid file type for "${fieldName}". Allowed: ${allowedTypes.join(', ')}`
        );
        return;
      }
    }

    // Store files keyed by field name
    if (field.allowMultiple) {
      setFieldFiles((prev) => ({ ...prev, [fieldName]: [...(prev[fieldName] || []), ...filesArray] }));
    } else {
      setFieldFiles((prev) => ({ ...prev, [fieldName]: [filesArray[0]] }));
    }
    setSubmitError(null);
  };

  const removeFieldFile = (fieldName: string, fileIndex: number) => {
    setFieldFiles((prev) => {
      const updated = { ...prev };
      updated[fieldName] = (updated[fieldName] || []).filter((_, i) => i !== fileIndex);
      if (updated[fieldName].length === 0) delete updated[fieldName];
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Validate required fields
      const requiredFields = ticketSettings?.onlineFormFields.filter((f) => f.required) || [];
      const missingFields = requiredFields.filter((field) => !formData[field.fieldName]);

      if (missingFields.length > 0) {
        setSubmitError('Please fill in all required fields');
        setSubmitting(false);
        return;
      }

      // Prepare form data
      const submitData = new FormData();
      submitData.append('projectId', projectBranding?.projectId || '');
      submitData.append('formData', JSON.stringify(formData));

      // Attach per-field files (keyed by field name so backend can map them)
      Object.keys(fieldFiles).forEach((fieldName) => {
        fieldFiles[fieldName].forEach((file) => {
          submitData.append(fieldName, file);
        });
      });

      // Submit ticket
      await axios.post(`${API_CONFIG.API_URL}/tickets/submit`, submitData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSubmitSuccess(true);
      setFormData({});
      setFieldFiles({});

      // Reset form after 5 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
    } catch (err: any) {
      console.error('Error submitting ticket:', err);
      setSubmitError(err.response?.data?.message || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const renderOnlineFormField = (field: OnlineFormField) => {
    const value = formData[field.fieldName] || '';

    const commonClasses = `block w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-offset-0 focus:outline-none transition-colors`;

    switch (field.fieldType) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
      case 'date':
      case 'url':
        return (
          <input
            key={field.fieldName}
            type={field.fieldType === 'url' ? 'url' : field.fieldType}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            className={`${commonClasses} focus:ring-2`}
            style={{
              borderColor: '#e5e7eb',
              ['--tw-ring-color' as any]: projectBranding?.primaryColor,
            }}
          />
        );
      case 'textarea':
        return (
          <textarea
            key={field.fieldName}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            rows={4}
            className={`${commonClasses} focus:ring-2`}
            style={{
              borderColor: '#e5e7eb',
              ['--tw-ring-color' as any]: projectBranding?.primaryColor,
            }}
          />
        );
      case 'dropdown':
        return (
          <select
            key={field.fieldName}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            className={`${commonClasses} focus:ring-2`}
            style={{
              borderColor: '#e5e7eb',
              ['--tw-ring-color' as any]: projectBranding?.primaryColor,
            }}
          >
            <option value="">{field.placeholder}</option>
            {field.options?.map((option, idx) => (
              <option key={idx} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case 'multiselect':
        return (
          <select
            key={field.fieldName}
            multiple
            value={Array.isArray(value) ? value : []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
              handleInputChange(field.fieldName, selected);
            }}
            required={field.required}
            className={`${commonClasses} focus:ring-2`}
            style={{
              borderColor: '#e5e7eb',
              ['--tw-ring-color' as any]: projectBranding?.primaryColor,
              minHeight: '120px',
            }}
          >
            {field.options?.map((option, idx) => (
              <option key={idx} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case 'radio':
        return (
          <div key={field.fieldName} className="flex flex-col gap-2">
            {field.options?.map((option, idx) => (
              <label key={idx} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={field.fieldName}
                  value={option}
                  checked={value === option}
                  onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
                  required={field.required && idx === 0}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: projectBranding?.primaryColor }}
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <div key={field.fieldName} className="flex flex-col gap-2">
            {field.options?.map((option, idx) => (
              <label key={idx} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  value={option}
                  checked={Array.isArray(value) && value.includes(option)}
                  onChange={(e) => {
                    const current = Array.isArray(value) ? value : [];
                    if (e.target.checked) {
                      handleInputChange(field.fieldName, [...current, option]);
                    } else {
                      handleInputChange(field.fieldName, current.filter((v) => v !== option));
                    }
                  }}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: projectBranding?.primaryColor }}
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      case 'file':
        return (
          <div key={field.fieldName}>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <DocumentArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <label className="cursor-pointer">
                <span
                  className="text-sm font-medium hover:underline"
                  style={{ color: projectBranding?.primaryColor }}
                >
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
                {(field.allowedFileTypes || []).length > 0 &&
                  ` | Allowed: ${field.allowedFileTypes?.join(', ')}`}
              </p>
            </div>
            {fieldFiles[field.fieldName] && fieldFiles[field.fieldName].length > 0 && (
              <ul className="mt-4 space-y-2">
                {fieldFiles[field.fieldName].map((file, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                  >
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
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (error || !projectBranding || !ticketSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <ExclamationCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Portal Not Found</h2>
          <p className="text-gray-600 mb-6">
            {error || 'The requested portal could not be found.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const showOnline = ticketSettings.mode === 'online' || ticketSettings.mode === 'both';
  const showOffline = ticketSettings.mode === 'offline' || ticketSettings.mode === 'both';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modern Header with Logo */}
      {!hideHeader && (
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-20">
              {/* Logo and Brand */}
              <div className="flex items-center space-x-2 sm:space-x-4 flex-1 min-w-0">
                {projectBranding.logoUrl && (
                  <img
                    src={projectBranding.logoUrl}
                    alt={projectBranding.name}
                    className="h-8 sm:h-12 w-auto flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">{projectBranding.name}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 truncate hidden sm:block">{projectBranding.welcomeText}</p>
                </div>
              </div>

              {/* Right Side Actions */}
              <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
                <LanguageToggle />
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all hover:shadow-md"
                  style={{
                    backgroundColor: projectBranding.primaryColor,
                    color: 'white',
                  }}
                >
                  {t('login')}
                </button>
              </div>
            </div>

            {/* Modern Navigation Menu */}
            <nav className="flex space-x-1 pb-2 overflow-x-auto">
              {showOnline && (
                <button
                  onClick={() => {
                    setActiveTab('online');
                  }}
                  className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-6 py-2 sm:py-3 rounded-t-lg font-medium transition-all whitespace-nowrap ${
                    activeTab === 'online'
                      ? 'text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  style={{
                    backgroundColor: activeTab === 'online' ? projectBranding.primaryColor : 'transparent',
                  }}
                >
                  <DocumentArrowUpIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-sm sm:text-base">{t('submitOnline')}</span>
                </button>
              )}
              
              {showOffline && (
                <button
                  onClick={() => {
                    setActiveTab('offline');
                    setViewMode('list');
                  }}
                  className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-6 py-2 sm:py-3 rounded-t-lg font-medium transition-all whitespace-nowrap ${
                    activeTab === 'offline'
                      ? 'text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  style={{
                    backgroundColor: activeTab === 'offline' ? projectBranding.primaryColor : 'transparent',
                  }}
                >
                  <MapPinIcon className="w-5 h-5" />
                  <span>{t('findNearestCenter')}</span>
                </button>
              )}

              {projectBranding.knowledgeBase && (
                <button
                  onClick={() => setActiveTab('kb')}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-t-lg font-medium transition-all ${
                    activeTab === 'kb'
                      ? 'text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  style={{
                    backgroundColor: activeTab === 'kb' ? projectBranding.primaryColor : 'transparent',
                  }}
                >
                  <BookOpenIcon className="w-5 h-5" />
                  <span>{t('knowledgeBase')}</span>
                </button>
              )}
            </nav>
          </div>
        </header>
      )}

      {/* Moving Announcement Banner */}
      {ticketSettings.announcement && (
        <div 
          className="overflow-hidden py-3 border-b border-gray-200"
          style={{
            background: `linear-gradient(90deg, ${projectBranding.primaryColor}10 0%, ${projectBranding.secondaryColor}10 100%)`,
          }}
        >
          <div className="relative flex">
            <div className="animate-marquee whitespace-nowrap flex items-center space-x-8">
              <span className="inline-flex items-center space-x-2 text-sm font-medium px-4">
                <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" style={{ color: projectBranding.primaryColor }} />
                <span style={{ color: projectBranding.primaryColor }}>{ticketSettings.announcement}</span>
              </span>
              <span className="inline-flex items-center space-x-2 text-sm font-medium px-4">
                <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" style={{ color: projectBranding.primaryColor }} />
                <span style={{ color: projectBranding.primaryColor }}>{ticketSettings.announcement}</span>
              </span>
            </div>
            <div className="animate-marquee2 whitespace-nowrap flex items-center space-x-8 absolute top-0">
              <span className="inline-flex items-center space-x-2 text-sm font-medium px-4">
                <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" style={{ color: projectBranding.primaryColor }} />
                <span style={{ color: projectBranding.primaryColor }}>{ticketSettings.announcement}</span>
              </span>
              <span className="inline-flex items-center space-x-2 text-sm font-medium px-4">
                <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" style={{ color: projectBranding.primaryColor }} />
                <span style={{ color: projectBranding.primaryColor }}>{ticketSettings.announcement}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 ${hideHeader ? 'py-0' : 'py-4 sm:py-8'}`}>
        {/* Success Message */}
        {submitSuccess && (
          <div 
            className="mb-6 rounded-xl p-6 flex items-start space-x-4 shadow-lg animate-fadeIn"
            style={{
              background: `linear-gradient(135deg, #10b98115 0%, #10b98125 100%)`,
              border: '1px solid #10b981',
            }}
          >
            <CheckCircleIcon className="w-7 h-7 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-bold text-green-900 mb-1">
                🎉 Ticket Submitted Successfully!
              </h3>
              <p className="text-green-700 font-medium">
                {ticketSettings.successMessage ||
                  'Your ticket has been submitted. Our team will get back to you soon.'}
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {submitError && (
          <div 
            className="mb-6 rounded-xl p-6 flex items-start space-x-4 shadow-lg animate-fadeIn"
            style={{
              background: `linear-gradient(135deg, #ef444415 0%, #ef444425 100%)`,
              border: '1px solid #ef4444',
            }}
          >
            <ExclamationCircleIcon className="w-7 h-7 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-bold text-red-900 mb-1">⚠️ Submission Error</h3>
              <p className="text-red-700 font-medium">{submitError}</p>
            </div>
          </div>
        )}

        {/* Content Area with Modern Card Design */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
          {/* Online Form View */}
          {showOnline && activeTab === 'online' && (
            <div className="p-4 sm:p-8 md:p-12">
              <div className="mb-6 sm:mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Submit Your Query</h2>
                <p className="text-sm sm:text-base text-gray-600">
                  {ticketSettings.welcomeMessage || 'Fill out the form below and our team will assist you.'}
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                {ticketSettings.onlineFormFields.map((field) => (
                  <div key={field.fieldName} className="group">
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      {field.fieldName}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderOnlineFormField(field)}
                  </div>
                ))}

                {/* Submit Button with Modern Design */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 px-6 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-2xl transform hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
                    style={{
                      background: `linear-gradient(135deg, ${projectBranding.primaryColor} 0%, ${projectBranding.secondaryColor} 100%)`,
                    }}
                  >
                    <span className="relative z-10 flex items-center justify-center space-x-2">
                      {submitting ? (
                        <>
                          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <DocumentArrowUpIcon className="w-6 h-6" />
                          <span>Submit Ticket</span>
                        </>
                      )}
                    </span>
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Offline Centers View */}
          {showOffline && activeTab === 'offline' && (
            <div>
              {/* Header with View Toggle */}
              <div 
                className="px-4 sm:px-8 md:px-12 py-4 sm:py-6 border-b border-gray-200"
                style={{
                  background: `linear-gradient(135deg, ${projectBranding.primaryColor}08 0%, ${projectBranding.secondaryColor}08 100%)`,
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">{t('findNearestCenter')}</h2>
                    <p className="text-sm sm:text-base text-gray-600">{t('locateCentersText')}</p>
                  </div>
                  
                  {/* View Mode Toggle */}
                  <div className="flex gap-1 sm:gap-2 bg-white p-1 rounded-lg shadow-sm border border-gray-200 w-full md:w-auto">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-md font-medium transition-all flex-1 md:flex-initial ${
                        viewMode === 'list'
                          ? 'text-white shadow-md transform scale-105'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                      style={{
                        backgroundColor: viewMode === 'list' ? projectBranding.primaryColor : 'transparent',
                      }}
                    >
                      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                      <span className="text-sm sm:text-base">{t('list')}</span>
                    </button>
                    <button
                      onClick={() => setViewMode('map')}
                      className={`flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-md font-medium transition-all flex-1 md:flex-initial ${
                        viewMode === 'map'
                          ? 'text-white shadow-md transform scale-105'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                      style={{
                        backgroundColor: viewMode === 'map' ? projectBranding.primaryColor : 'transparent',
                      }}
                    >
                      <MapPinIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="text-sm sm:text-base">{t('map')}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 md:p-8 lg:p-12">

            {/* Filter Buttons */}
            {viewMode === 'list' && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setFilterType('all');
                  setSearchQuery('');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'all'
                    ? 'text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: filterType === 'all' ? projectBranding.primaryColor : undefined,
                }}
              >
                {t('allCenters')}
              </button>
              <button
                onClick={() => {
                  setFilterType('city');
                  setSearchQuery('');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'city'
                    ? 'text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: filterType === 'city' ? projectBranding.primaryColor : undefined,
                }}
              >
                {t('byCity')}
              </button>
              <button
                onClick={() => {
                  setFilterType('pincode');
                  setSearchQuery('');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'pincode'
                    ? 'text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: filterType === 'pincode' ? projectBranding.primaryColor : undefined,
                }}
              >
                {t('byPincode')}
              </button>
            </div>
            )}

            {/* Search and Sort */}
            {viewMode === 'list' && (
            <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder={
                    filterType === 'city'
                      ? t('searchByCity')
                      : filterType === 'pincode'
                      ? t('searchByPincode')
                      : t('searchPlaceholder')
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:outline-none"
                  style={{ ['--tw-ring-color' as any]: projectBranding.primaryColor }}
                />
              </div>
              
              {/* Sort Dropdown */}
              <div className="relative w-full sm:w-auto sm:min-w-[200px]">
                <button
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className="flex items-center space-x-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors font-medium text-gray-700 w-full justify-between text-sm sm:text-base"
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                    <span>
                      {sortBy === 'district' ? t('sortDistrict') : 
                       sortBy === 'distance' ? t('sortDistance') :
                       sortBy === 'alphabetical' ? t('sortAlphabetical') :
                       t('sortBy')}
                    </span>
                  </div>
                  <svg className={`w-4 h-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Dropdown Menu */}
                {showSortDropdown && (
                  <div className="absolute right-0 mt-2 w-full bg-white rounded-lg shadow-xl border border-gray-200 z-10 overflow-hidden">
                    <button
                      onClick={() => {
                        setSortBy('district');
                        setShowSortDropdown(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2 ${
                        sortBy === 'district' ? 'font-bold' : ''
                      }`}
                      style={{
                        backgroundColor: sortBy === 'district' ? `${projectBranding.primaryColor}10` : 'transparent',
                        color: sortBy === 'district' ? projectBranding.primaryColor : 'inherit',
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      <span>{t('sortByDistrict')}</span>
                      {sortBy === 'district' && (
                        <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (!userLocation) {
                          alert('Location access is required to sort by distance. Please enable location permissions.');
                          return;
                        }
                        setSortBy('distance');
                        setShowSortDropdown(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2 ${
                        sortBy === 'distance' ? 'font-bold' : ''
                      } ${!userLocation ? 'opacity-50' : ''}`}
                      style={{
                        backgroundColor: sortBy === 'distance' ? `${projectBranding.primaryColor}10` : 'transparent',
                        color: sortBy === 'distance' ? projectBranding.primaryColor : 'inherit',
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{t('sortByDistance')}</span>
                      {!userLocation && <span className="text-xs text-gray-400">(location required)</span>}
                      {sortBy === 'distance' && (
                        <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setSortBy('alphabetical');
                        setShowSortDropdown(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2 ${
                        sortBy === 'alphabetical' ? 'font-bold' : ''
                      }`}
                      style={{
                        backgroundColor: sortBy === 'alphabetical' ? `${projectBranding.primaryColor}10` : 'transparent',
                        color: sortBy === 'alphabetical' ? projectBranding.primaryColor : 'inherit',
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                      </svg>
                      <span>{t('sortByAlphabetical')}</span>
                      {sortBy === 'alphabetical' && (
                        <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    {sortBy !== 'none' && (
                      <button
                        onClick={() => {
                          setSortBy('none');
                          setShowSortDropdown(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-red-50 transition-colors flex items-center space-x-2 border-t border-gray-200 text-red-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Clear Sort</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Map View */}
            {viewMode === 'map' && (
              <div className="h-[400px] sm:h-[500px] md:h-[600px] rounded-lg overflow-hidden border border-gray-200 shadow-lg relative">
                <div 
                  id="google-map" 
                  className="w-full h-full"
                  ref={(el) => {
                    if (el && !el.dataset.initialized) {
                      el.dataset.initialized = 'true';
                      
                      // Load Google Maps Script
                      if (!window.google) {
                        const script = document.createElement('script');
                        script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyBRFSFV0gNYtzruNYF9hoJxbUFoaOMWhD8`;
                        script.async = true;
                        script.onload = () => initMap(el);
                        document.head.appendChild(script);
                      } else {
                        initMap(el);
                      }
                    }

                    function initMap(mapElement: HTMLElement) {
                      if (!window.google) return;

                      // Default center (India)
                      const defaultCenter = { lat: 20.5937, lng: 78.9629 };
                      
                      // Create map
                      const map = new window.google.maps.Map(mapElement, {
                        zoom: 5,
                        center: defaultCenter,
                        mapTypeControl: true,
                        fullscreenControl: true,
                      });

                      // Add markers for each center
                      const bounds = new window.google.maps.LatLngBounds();
                      let hasMarkers = false;

                      // Geocode centers that don't have coordinates
                      const geocodePromises = filteredCenters.map(async (center) => {
                        let lat: number | undefined, lng: number | undefined;

                        // Try to get coordinates
                        if (center.latitude && center.longitude) {
                          lat = typeof center.latitude === 'number' ? center.latitude : parseFloat(String(center.latitude));
                          lng = typeof center.longitude === 'number' ? center.longitude : parseFloat(String(center.longitude));
                        } else if (center.mapLink || center.googleMapLink) {
                          // Try to extract coordinates from map link - supports multiple formats
                          const link: string | undefined = center.mapLink || center.googleMapLink;
                          if (link) {
                          
                          // Format 1: @lat,lng pattern (e.g., https://www.google.com/maps/@19.0760,72.8777,15z)
                          let coordMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                          if (coordMatch) {
                            lat = parseFloat(coordMatch[1]);
                            lng = parseFloat(coordMatch[2]);
                          }
                          
                          // Format 2: ?q=lat,lng pattern (e.g., https://www.google.com/maps?q=19.0760,72.8777)
                          if (!lat && !lng) {
                            coordMatch = link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
                            if (coordMatch) {
                              lat = parseFloat(coordMatch[1]);
                              lng = parseFloat(coordMatch[2]);
                            }
                          }
                          
                          // Format 3: /place/ or /dir/ with coordinates (e.g., https://www.google.com/maps/place/@19.0760,72.8777)
                          if (!lat && !lng) {
                            coordMatch = link.match(/\/(?:place|dir)\/[^/]*@?(-?\d+\.\d+),(-?\d+\.\d+)/);
                            if (coordMatch) {
                              lat = parseFloat(coordMatch[1]);
                              lng = parseFloat(coordMatch[2]);
                            }
                          }
                          
                          // Format 4: ll= pattern (e.g., https://www.google.com/maps?ll=19.0760,72.8777)
                          if (!lat && !lng) {
                            coordMatch = link.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
                            if (coordMatch) {
                              lat = parseFloat(coordMatch[1]);
                              lng = parseFloat(coordMatch[2]);
                            }
                          }
                          }
                          
                          // Format 5: Shortened links (maps.app.goo.gl) or links without coordinates
                          // Use Geocoding API as fallback
                          if (!lat && !lng) {
                            try {
                              const geocoder = new window.google.maps.Geocoder();
                              const address = `${center.centerName}, ${center.address}, ${center.city}, ${center.state} ${center.pincode}`;
                              const result = await new Promise<any>((resolve, reject) => {
                                geocoder.geocode({ address }, (results: any[] | null, status: string) => {
                                  if (status === 'OK' && results && results[0]) {
                                    resolve(results[0]);
                                  } else {
                                    reject(status);
                                  }
                                });
                              });
                              lat = result.geometry.location.lat();
                              lng = result.geometry.location.lng();
                            } catch (error) {
                              console.warn(`Could not geocode ${center.centerName}:`, error);
                            }
                          }
                        }

                        return { center, lat, lng };
                      });

                      // Wait for all geocoding to complete
                      Promise.all(geocodePromises).then((results) => {
                        results.forEach(({ center, lat, lng }) => {
                          if (lat && lng) {
                          const position = { lat, lng };
                          
                          // Create marker
                          const marker = new window.google.maps.Marker({
                            position,
                            map,
                            title: center.centerName,
                            animation: window.google.maps.Animation.DROP,
                          });

                          // Create info window with contacts
                          let contactsHtml = '';
                          if (center.contacts && center.contacts.length > 0) {
                            contactsHtml = '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">';
                            contactsHtml += '<p style="margin: 4px 0; font-size: 12px; font-weight: bold; color: #374151;">Additional Contacts:</p>';
                            center.contacts.forEach((contact) => {
                              contactsHtml += `<div style="margin: 4px 0; font-size: 12px; color: #6b7280;">
                                <strong>${contact.name}</strong>${contact.role ? ` (${contact.role})` : ''}<br/>
                                📞 ${contact.mobile}${contact.email ? ` | ✉️ ${contact.email}` : ''}
                              </div>`;
                            });
                            contactsHtml += '</div>';
                          }
                          
                          const infoWindow = new window.google.maps.InfoWindow({
                            content: `
                              <div style="padding: 8px; max-width: 250px;">
                                <h3 style="font-weight: bold; margin: 0 0 8px 0; color: #1f2937;">${center.centerName}</h3>
                                <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
                                  📍 ${center.address}, ${center.city}, ${center.state}
                                </p>
                                <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
                                  📞 ${center.phone}
                                </p>
                                <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
                                  🕒 ${center.workingHours}
                                </p>
                                ${contactsHtml}
                                ${center.mapLink || center.googleMapLink ? `
                                  <a 
                                    href="${center.mapLink || center.googleMapLink}" 
                                    target="_blank"
                                    style="display: inline-block; margin-top: 8px; padding: 6px 12px; background: #3b82f6; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;"
                                  >
                                    ${t('getDirections')}
                                  </a>
                                ` : ''}
                              </div>
                            `,
                          });

                          marker.addListener('click', () => {
                            infoWindow.open(map, marker);
                          });

                          bounds.extend(position);
                          hasMarkers = true;
                          }
                        });

                        // Fit bounds to show all markers
                        if (hasMarkers) {
                          map.fitBounds(bounds);
                          
                          // Don't zoom in too much for single marker
                          const listener = window.google.maps.event.addListener(map, 'idle', () => {
                            if (map.getZoom() > 15) map.setZoom(15);
                            window.google.maps.event.removeListener(listener);
                          });
                        }

                        // Add user's current location
                        if (navigator.geolocation) {
                          navigator.geolocation.getCurrentPosition(
                            (position) => {
                              const userPos = {
                                lat: position.coords.latitude,
                                lng: position.coords.longitude,
                              };

                              // User location marker (blue dot)
                              new window.google.maps.Marker({
                                position: userPos,
                                map,
                                title: 'Your Location',
                                icon: {
                                  path: window.google.maps.SymbolPath.CIRCLE,
                                  scale: 8,
                                  fillColor: '#4285F4',
                                  fillOpacity: 1,
                                  strokeColor: '#ffffff',
                                  strokeWeight: 2,
                                },
                              });

                              // Center map on user if no centers with coordinates
                              if (!hasMarkers) {
                                map.setCenter(userPos);
                                map.setZoom(12);
                              }
                            },
                            () => {
                              console.log('Geolocation permission denied');
                            }
                          );
                        }
                      });
                    }
                  }}
                ></div>
                
                {filteredCenters.filter(c => !c.latitude && !c.longitude && !c.mapLink && !c.googleMapLink).length > 0 && (
                  <div className="absolute top-4 left-4 right-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                    ⚠️ Some centers don't have location coordinates. Please add latitude/longitude or map links to show them on the map.
                  </div>
                )}
              </div>
            )}

            {/* Centers List */}
            {viewMode === 'list' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {filteredCenters.length === 0 ? (
                <div className="col-span-2 text-center py-12">
                  <MapPinIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">No centers found matching your search</p>
                </div>
              ) : (
                filteredCenters.map((center, idx) => (
                  <div
                    key={idx}
                    className="bg-white border-2 border-gray-400 rounded-xl sm:rounded-2xl p-4 sm:p-6 hover-lift hover:border-gray-600 transition-all duration-300 shadow-md hover:shadow-xl"
                  >
                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 break-words">
                          {center.centerName}
                        </h3>
                        {/* Show distance if sorting by distance */}
                        {sortBy === 'distance' && userLocation && (() => {
                          // Try to get coordinates from direct values or geocoded values
                          let lat = center.latitude;
                          let lng = center.longitude;
                          
                          if (!lat || !lng) {
                            const key = `${center.centerName}-${center.address}`;
                            const coords = centerCoordinates.get(key);
                            if (coords) {
                              lat = coords.lat;
                              lng = coords.lng;
                            }
                          }
                          
                          if (lat && lng) {
                            return (
                              <p className="text-sm text-gray-500 mt-1 flex items-center space-x-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>
                                  {calculateDistance(
                                    userLocation.lat,
                                    userLocation.lng,
                                    lat,
                                    lng
                                  ).toFixed(1)} km away
                                </span>
                              </p>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${projectBranding.primaryColor}15 0%, ${projectBranding.secondaryColor}25 100%)`,
                        }}
                      >
                        <MapPinIcon 
                          className="w-6 h-6"
                          style={{ color: projectBranding.primaryColor }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-start space-x-3">
                        <MapPinIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">{t('address')}</p>
                          <p className="text-sm text-gray-600">
                            {center.address}, {center.city}, {center.state} - {center.pincode}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <PhoneIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">{t('phone')}</p>
                          <p className="text-sm text-gray-600">{center.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <EnvelopeIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">{t('email')}</p>
                          <p className="text-sm text-gray-600">{center.email}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <ClockIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">{t('workingHours')}</p>
                          <p className="text-sm text-gray-600">{center.workingHours}</p>
                        </div>
                      </div>
                    </div>

                    {/* Features Section */}
                    {center.features && center.features.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-2">Available Features</p>
                        <div className="flex flex-wrap gap-2">
                          {center.features.map((feature, featureIdx) => (
                            <span
                              key={featureIdx}
                              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contact Details Section */}
                    {center.contacts && center.contacts.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-3">Contact Details</p>
                        <div className="space-y-3">
                          {center.contacts.map((contact, contactIdx) => (
                            <div key={contactIdx} className="bg-gray-50 p-3 rounded-lg">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{contact.name}</p>
                                  {contact.role && (
                                    <p className="text-xs text-gray-500 mt-0.5">{contact.role}</p>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 space-y-1">
                                {contact.mobile && (
                                  <div className="flex items-center space-x-2">
                                    <PhoneIcon className="w-4 h-4 text-gray-400" />
                                    <a href={`tel:${contact.mobile}`} className="text-sm text-gray-600 hover:text-gray-900">{contact.mobile}</a>
                                  </div>
                                )}
                                {contact.email && (
                                  <div className="flex items-center space-x-2">
                                    <EnvelopeIcon className="w-4 h-4 text-gray-400" />
                                    <a href={`mailto:${contact.email}`} className="text-sm text-gray-600 hover:text-gray-900">{contact.email}</a>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Get Directions Button */}
                    <div className="mt-6 pt-4 border-t border-gray-200">
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
                        className="w-full py-3 px-4 rounded-xl text-white font-bold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all flex items-center justify-center space-x-2 group"
                        style={{
                          background: `linear-gradient(135deg, ${projectBranding?.primaryColor} 0%, ${projectBranding?.secondaryColor} 100%)`,
                        }}
                      >
                        <MapPinIcon className="w-5 h-5 group-hover:animate-bounce" />
                        <span>{t('getDirections')}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            )}
              </div>
            </div>
          )}

          {/* Knowledge Base View */}
          {projectBranding.knowledgeBase && activeTab === 'kb' && (
            <div className="p-8 md:p-12">
              {!selectedArticle ? (
                <>
                  <div className="mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">Knowledge Base</h2>
                    <p className="text-gray-600">Browse articles and find answers to common questions</p>
                  </div>

                  {/* Search Bar */}
                  <div className="mb-6">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search articles..."
                        value={kbSearchQuery}
                        onChange={(e) => setKbSearchQuery(e.target.value)}
                        className="w-full px-5 py-4 pl-12 rounded-xl border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-lg"
                      />
                      <svg 
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>

                  {/* Loading State */}
                  {kbLoading && (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: projectBranding.primaryColor }}></div>
                      <p className="text-gray-600">Loading articles...</p>
                    </div>
                  )}

                  {/* Articles List */}
                  {!kbLoading && kbArticles.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 rounded-2xl">
                      <BookOpenIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">No articles available yet</p>
                    </div>
                  )}

                  {!kbLoading && kbArticles.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {kbArticles
                        .filter(article => 
                          (article.status === 'published' || article.status === 'archived') && 
                          (kbSearchQuery === '' || 
                           article.title?.toLowerCase().includes(kbSearchQuery.toLowerCase()) ||
                           article.content?.toLowerCase().includes(kbSearchQuery.toLowerCase()))
                        )
                        .map((article, idx) => (
                          <div
                            key={article._id || idx}
                            onClick={() => setSelectedArticle(article)}
                            className="bg-white border-2 border-gray-200 rounded-xl p-6 hover-lift cursor-pointer transition-all duration-300 hover:border-blue-300"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <h3 className="text-lg font-bold text-gray-900 line-clamp-2 flex-1">
                                {article.title}
                              </h3>
                              <svg 
                                className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2"
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            
                            {article.category && (
                              <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-3">
                                {article.category}
                              </span>
                            )}
                            
                            <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                              {article.content?.replace(/<[^>]*>/g, '').substring(0, 150)}...
                            </p>
                            
                            <div className="flex items-center text-xs text-gray-500">
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {article.updatedAt ? new Date(article.updatedAt).toLocaleDateString() : 'Recently updated'}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                /* Article Detail View - Inline */
                <div>
                  <button
                    onClick={() => setSelectedArticle(null)}
                    className="mb-6 flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Articles
                  </button>

                  <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg p-8 md:p-12">
                    <div className="mb-6">
                      <h1 className="text-4xl font-bold text-gray-900 mb-4">{selectedArticle.title}</h1>
                      {selectedArticle.category && (
                        <span className="inline-block px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                          {selectedArticle.category}
                        </span>
                      )}
                    </div>
                    
                    <style>{`
                      .kb-article-content ol {
                        list-style-type: decimal !important;
                        padding-left: 2em !important;
                        margin: 1em 0 !important;
                      }
                      .kb-article-content ul {
                        list-style-type: disc !important;
                        padding-left: 2em !important;
                        margin: 1em 0 !important;
                      }
                      .kb-article-content ol > li,
                      .kb-article-content ul > li {
                        display: list-item !important;
                        margin-bottom: 0.5em !important;
                        line-height: 1.8 !important;
                        list-style-position: outside !important;
                      }
                      .kb-article-content ol > li {
                        list-style-type: decimal !important;
                      }
                      .kb-article-content ul > li {
                        list-style-type: disc !important;
                      }
                      .kb-article-content li.ql-indent-1 { padding-left: 3em !important; }
                      .kb-article-content li.ql-indent-2 { padding-left: 4.5em !important; }
                      .kb-article-content li.ql-indent-3 { padding-left: 6em !important; }
                      .kb-article-content li.ql-indent-4 { padding-left: 7.5em !important; }
                      .kb-article-content li.ql-indent-5 { padding-left: 9em !important; }
                      .kb-article-content h1 { font-size: 2em; font-weight: bold; margin: 1em 0 0.5em; }
                      .kb-article-content h2 { font-size: 1.5em; font-weight: bold; margin: 0.83em 0 0.5em; }
                      .kb-article-content h3 { font-size: 1.17em; font-weight: bold; margin: 1em 0 0.5em; }
                      .kb-article-content strong { font-weight: 700; }
                    `}</style>
                    
                    <div 
                      className="prose prose-lg max-w-none kb-article-content text-gray-700 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-gray-600 text-sm">{projectBranding.footerText}</p>
        </div>
      </footer>

      {/* Login Modal */}
      {projectBranding && (
        <StudentLoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          primaryColor={projectBranding.primaryColor}
          customUrlPath={customUrlPath || ''}
        />
      )}

      {/* KB Chatbot */}
      <KBChatbot />
    </div>
  );
};

export default StudentPortal;
