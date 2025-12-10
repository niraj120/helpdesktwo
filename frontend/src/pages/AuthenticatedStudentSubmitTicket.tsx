import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { API_CONFIG } from '../config/constants';

interface ProjectBranding {
  projectId: string;
  name: string;
  customUrlPath: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  welcomeText: string;
  footerText: string;
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

interface TicketSubmissionSettings {
  onlineFormFields: OnlineFormField[];
  welcomeMessage?: string;
  successMessage?: string;
  announcement?: string;
}

const AuthenticatedStudentSubmitTicket: React.FC<{ hideHeader?: boolean }> = ({ hideHeader }) => {
  const { customUrlPath } = useParams<{ customUrlPath: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState<ProjectBranding | null>(null);
  const [ticketSettings, setTicketSettings] = useState<TicketSubmissionSettings | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fieldFiles, setFieldFiles] = useState<Record<string, File[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, [customUrlPath]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        navigate(`/${customUrlPath}/submit-ticket`);
        return;
      }

      // Fetch branding
      const brandingRes = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`
      );
      const brandingData = brandingRes.data.success ? brandingRes.data.data : brandingRes.data;
      setBranding(brandingData);

      // Fetch categories from master
      const categoriesRes = await axios.get(
        `${API_CONFIG.API_URL}/categories/project/${brandingData.projectId}`
      );
      const categoryList = categoriesRes.data.success ? categoriesRes.data.data : categoriesRes.data;
      const activeCategoryNames = categoryList
        .filter((cat: any) => cat.isActive)
        .map((cat: any) => cat.name);
      
      console.log('📁 Categories fetched from master:', activeCategoryNames);
      console.log('📁 Total categories:', activeCategoryNames.length);

      // Fetch ticket settings
      const settingsRes = await axios.get(
        `${API_CONFIG.API_URL}/projects/${brandingData.projectId}/ticket-settings`
      );
      const settings = settingsRes.data.success ? settingsRes.data.data : settingsRes.data;
      
      console.log('📋 Ticket settings received:', settings);
      console.log('📝 Online form fields:', settings.ticketSubmissionSettings?.onlineFormFields);
      
      // Filter out student profile fields (Name, Email, Phone/Mobile Number) and Priority
      const excludeFields = ['name', 'email', 'phone', 'mobile', 'mobile number', 'phone number', 'student name', 'student email', 'contact number', 'email address', 'full name', 'priority'];
      let formFields = settings.ticketSubmissionSettings?.onlineFormFields || [];
      
      // If no fields configured, use default fields (excluding profile fields)
      if (formFields.length === 0) {
        formFields = [
          { fieldName: 'Subject', fieldType: 'text', required: true, placeholder: 'Enter query subject' },
          { fieldName: 'Description', fieldType: 'textarea', required: true, placeholder: 'Describe your issue in detail' },
          { fieldName: 'Category', fieldType: 'dropdown', required: false, placeholder: 'Select category', options: activeCategoryNames },
        ];
      } else {
        // Update category field options with fetched categories
        formFields = formFields.map((field: OnlineFormField) => {
          if (field.fieldName.toLowerCase() === 'category' && field.fieldType === 'dropdown') {
            return { ...field, options: activeCategoryNames };
          }
          return field;
        });
      }
      
      // Set categories AFTER processing fields
      setCategories(activeCategoryNames);
      
      const filteredFields = formFields.filter(
        (field: OnlineFormField) => !excludeFields.includes(field.fieldName.toLowerCase())
      );
      
      console.log('✅ Filtered fields (without profile):', filteredFields);

      setTicketSettings({
        ...settings.ticketSubmissionSettings,
        onlineFormFields: filteredFields,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      setSubmitError('Failed to load form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleFileChange = (fieldName: string, files: FileList | null) => {
    if (!files) return;

    const filesArray = Array.from(files);
    setFieldFiles((prev) => ({
      ...prev,
      [fieldName]: filesArray,
    }));
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
    setSubmitSuccess(false);

    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setSubmitError('Please log in to submit a ticket');
        setSubmitting(false);
        return;
      }

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
      submitData.append('projectId', branding?.projectId || '');
      submitData.append('formData', JSON.stringify(formData));

      // Add file attachments with their field names
      Object.entries(fieldFiles).forEach(([fieldName, files]) => {
        files.forEach((file) => {
          submitData.append(fieldName, file);
        });
      });

      console.log('📤 Submitting ticket with data:', {
        projectId: branding?.projectId,
        formData: formData,
        fileCount: Object.values(fieldFiles).flat().length
      });

      // Submit ticket
      const response = await axios.post(
        `${API_CONFIG.API_URL}/tickets/submit`,
        submitData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...(token && { Authorization: `Bearer ${token}` }), // Add auth header if logged in
          },
        }
      );

      console.log('✅ Ticket submitted successfully:', response.data);

      setSubmitSuccess(true);
      setFormData({});
      setFieldFiles({});

      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Redirect to my tickets after 3 seconds
      setTimeout(() => {
        navigate(`/${customUrlPath}/student/my-tickets`);
      }, 3000);
    } catch (error: any) {
      console.error('Error submitting ticket:', error);
      setSubmitError(error.response?.data?.message || 'Failed to submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderFormField = (field: OnlineFormField) => {
    const value = formData[field.fieldName] || '';
    const commonClasses = 'w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2';

    switch (field.fieldType) {
      case 'textarea':
        return (
          <textarea
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            rows={4}
            className={commonClasses}
            style={{ ['--tw-ring-color' as any]: branding?.primaryColor }}
          />
        );
      
      case 'dropdown':
        return (
          <select
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            className={commonClasses}
            style={{ ['--tw-ring-color' as any]: branding?.primaryColor }}
          >
            <option value="">{field.placeholder || `Select ${field.fieldName}`}</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      
      case 'multiselect':
        return (
          <select
            multiple
            value={value}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, (option) => option.value);
              handleInputChange(field.fieldName, selected);
            }}
            required={field.required}
            className={`${commonClasses} min-h-[120px]`}
            style={{ ['--tw-ring-color' as any]: branding?.primaryColor }}
          >
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      
      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <label key={option} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name={field.fieldName}
                  value={option}
                  checked={value === option}
                  onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
                  required={field.required}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: branding?.primaryColor }}
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      
      case 'checkbox':
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <label key={option} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  value={option}
                  checked={(value || []).includes(option)}
                  onChange={(e) => {
                    const currentValue = value || [];
                    const newValue = e.target.checked
                      ? [...currentValue, option]
                      : currentValue.filter((v: string) => v !== option);
                    handleInputChange(field.fieldName, newValue);
                  }}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: branding?.primaryColor }}
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      
      case 'file':
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
              <div className="text-center">
                <DocumentArrowUpIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <span className="text-sm text-gray-600">Click to upload file(s)</span>
                {field.allowedFileTypes && field.allowedFileTypes.length > 0 && (
                  <span className="block text-xs text-gray-500 mt-1">
                    Allowed: {field.allowedFileTypes.join(', ')}
                  </span>
                )}
                {field.maxFileSizeMB && (
                  <span className="block text-xs text-gray-500">
                    Max size: {field.maxFileSizeMB}MB
                  </span>
                )}
              </div>
              <input
                type="file"
                onChange={(e) => handleFileChange(field.fieldName, e.target.files)}
                multiple={field.allowMultiple}
                accept={field.allowedFileTypes?.join(',')}
                required={field.required && (!fieldFiles[field.fieldName] || fieldFiles[field.fieldName].length === 0)}
                className="hidden"
              />
            </label>
            
            {fieldFiles[field.fieldName] && fieldFiles[field.fieldName].length > 0 && (
              <div className="space-y-2">
                {fieldFiles[field.fieldName].map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFieldFile(field.fieldName, index)}
                      className="ml-2 p-1 hover:bg-gray-200 rounded-full transition-colors"
                    >
                      <XMarkIcon className="h-4 w-4 text-gray-500" />
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
            type={field.fieldType}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            className={commonClasses}
            style={{ ['--tw-ring-color' as any]: branding?.primaryColor }}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: branding?.primaryColor || '#3b82f6' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        {!hideHeader && (
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Submit a Query</h1>
            {ticketSettings?.welcomeMessage && (
              <p className="text-gray-600">{ticketSettings.welcomeMessage}</p>
            )}
          </div>
        )}

        {/* Announcement */}
        {ticketSettings?.announcement && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-blue-900 text-sm">{ticketSettings.announcement}</p>
          </div>
        )}

        {/* Success Message */}
        {submitSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6 flex items-start space-x-4">
            <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-green-900 mb-1">
                Query Submitted Successfully!
              </h3>
              <p className="text-green-700">
                {ticketSettings?.successMessage ||
                  'Your query has been submitted. Our team will get back to you soon.'}
              </p>
              <p className="text-green-600 text-sm mt-2">Redirecting to My Queries...</p>
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

        {/* Form */}
        <div className="bg-white rounded-xl shadow-md p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {ticketSettings?.onlineFormFields && ticketSettings.onlineFormFields.length > 0 ? (
              ticketSettings.onlineFormFields.map((field) => (
                <div key={field.fieldName}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {field.fieldName}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {renderFormField(field)}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No form fields configured. Please contact the administrator.</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || submitSuccess}
              className="w-full py-4 rounded-lg font-semibold text-white shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: branding?.primaryColor
                  ? `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%)`
                  : 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
              }}
            >
              {submitting ? 'Submitting...' : submitSuccess ? 'Submitted!' : 'Submit Query'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthenticatedStudentSubmitTicket;
