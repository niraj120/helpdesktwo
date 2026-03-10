import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import {
  XMarkIcon,
  EnvelopeIcon,
  ServerIcon,
  SignalIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

// Provider and auth method types
type EmailProvider = 'google' | 'microsoft' | 'other';
type AuthMethod = 'basic' | 'app_password';
type InboundMethod = 'imap' | 'sendgrid';

interface EmailConfig {
  _id: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  provider?: EmailProvider;
  authMethod?: AuthMethod;
}

interface EmailConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  editingConfig?: EmailConfig | null;
}

interface FormData {
  emailAddress: string;
  inboundMethod: InboundMethod;
  imapHost: string;
  imapPort: number | string;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: number | string;
  smtpUsername: string;
  smtpPassword: string;
  provider: EmailProvider;
  authMethod: AuthMethod;
}

interface ValidationErrors {
  [key: string]: string;
}

// Detect email provider from email address
const detectEmailProvider = (email: string): EmailProvider => {
  const lowerEmail = email.toLowerCase();
  if (lowerEmail.includes('@gmail.com') || lowerEmail.includes('@googlemail.com')) {
    return 'google';
  }
  if (lowerEmail.includes('@outlook.') || lowerEmail.includes('@hotmail.') || 
      lowerEmail.includes('@live.') || lowerEmail.includes('@msn.') ||
      lowerEmail.includes('@microsoft.com')) {
    return 'microsoft';
  }
  return 'other';
};

// Get provider defaults
const getProviderDefaults = (provider: EmailProvider) => {
  switch (provider) {
    case 'google':
      return {
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
      };
    case 'microsoft':
      return {
        imapHost: 'outlook.office365.com',
        imapPort: 993,
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
      };
    default:
      return {
        imapHost: '',
        imapPort: 993,
        smtpHost: '',
        smtpPort: 587,
      };
  }
};

const EmailConfigModal: React.FC<EmailConfigModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  editingConfig
}) => {
  // Initialize form data based on edit mode
  const getInitialFormData = (): FormData => {
    if (editingConfig) {
      return {
        emailAddress: editingConfig.emailAddress,
        inboundMethod: (editingConfig as any).inboundMethod || 'imap',
        imapHost: editingConfig.imapHost,
        imapPort: editingConfig.imapPort,
        imapUsername: editingConfig.imapUsername,
        imapPassword: '', // Don't pre-fill passwords for security
        smtpHost: editingConfig.smtpHost,
        smtpPort: editingConfig.smtpPort,
        smtpUsername: editingConfig.smtpUsername,
        smtpPassword: '', // Don't pre-fill passwords for security
        provider: editingConfig.provider || detectEmailProvider(editingConfig.emailAddress),
        authMethod: editingConfig.authMethod || 'basic',
      };
    }
    return {
      emailAddress: '',
      inboundMethod: 'imap' as InboundMethod,
      imapHost: '',
      imapPort: 993,
      imapUsername: '',
      imapPassword: '',
      smtpHost: '',
      smtpPort: 587,
      smtpUsername: '',
      smtpPassword: '',
      provider: 'other',
      authMethod: 'basic',
    };
  };

  const [formData, setFormData] = useState<FormData>(getInitialFormData());

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Update form data when editingConfig changes
  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData());
      setErrors({});
      setTestResult(null);
    }
  }, [isOpen, editingConfig]);

  if (!isOpen) return null;

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};

    // Email validation
    if (!formData.emailAddress.trim()) {
      newErrors.emailAddress = 'Email address is required';
    } else if (!validateEmail(formData.emailAddress)) {
      newErrors.emailAddress = 'Invalid email format';
    }

    // IMAP validations — only when using IMAP inbound
    if (formData.inboundMethod === 'imap') {
      if (!formData.imapHost.trim()) {
        newErrors.imapHost = 'IMAP host is required';
      }
      const imapPort = Number(formData.imapPort);
      if (!formData.imapPort || isNaN(imapPort) || imapPort < 1 || imapPort > 65535) {
        newErrors.imapPort = 'Valid IMAP port is required (1-65535)';
      }
      if (!formData.imapUsername.trim()) {
        newErrors.imapUsername = 'IMAP username is required';
      }
      if (!editingConfig && !formData.imapPassword.trim()) {
        newErrors.imapPassword = 'IMAP password is required';
      }
    }

    // SMTP validations
    if (!formData.smtpHost.trim()) {
      newErrors.smtpHost = 'SMTP host is required';
    }
    const smtpPort = Number(formData.smtpPort);
    if (!formData.smtpPort || isNaN(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      newErrors.smtpPort = 'Valid SMTP port is required (1-65535)';
    }
    if (!formData.smtpUsername.trim()) {
      newErrors.smtpUsername = 'SMTP username is required';
    }
    // In edit mode, password is optional (only required if changing)
    if (!editingConfig && !formData.smtpPassword.trim()) {
      newErrors.smtpPassword = 'SMTP password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    let updatedData = { ...formData, [field]: value };
    
    // Auto-detect provider and set defaults when email changes
    if (field === 'emailAddress' && typeof value === 'string') {
      const provider = detectEmailProvider(value);
      if (provider !== formData.provider) {
        const defaults = getProviderDefaults(provider);
        updatedData = {
          ...updatedData,
          provider,
          imapHost: defaults.imapHost,
          imapPort: defaults.imapPort,
          smtpHost: defaults.smtpHost,
          smtpPort: defaults.smtpPort,
          imapUsername: value,
          smtpUsername: value,
          // Recommend app_password for Google/Microsoft
          authMethod: (provider === 'google' || provider === 'microsoft') ? 'app_password' : 'basic',
        };
      }
    }
    
    setFormData(updatedData);
    // Clear error for this field when user types
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    // Clear test result when any field changes
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!validateForm()) {
      setTestResult({
        success: false,
        message: 'Please fix validation errors before testing connection'
      });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const token = localStorage.getItem('authToken');

      // Test credentials without saving
      const response = await axios.post(
        `${API_CONFIG.API_URL}/projects/${projectId}/email-configs/test-credentials`,
        {
          emailAddress: formData.emailAddress,
          imapHost: formData.imapHost,
          imapPort: Number(formData.imapPort),
          imapUsername: formData.imapUsername,
          imapPassword: formData.imapPassword,
          smtpHost: formData.smtpHost,
          smtpPort: Number(formData.smtpPort),
          smtpUsername: formData.smtpUsername,
          smtpPassword: formData.smtpPassword,
          provider: formData.provider,
          authMethod: formData.authMethod,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true // Accept all status codes
        }
      );

      if (response.data.success) {
        setTestResult({
          success: true,
          message: '✅ Connection test successful! Both IMAP and SMTP connections are working.'
        });
      } else {
        const imapError = response.data.data?.imap?.error || '';
        const smtpError = response.data.data?.smtp?.error || '';
        const details = [
          imapError && `IMAP: ${imapError}`,
          smtpError && `SMTP: ${smtpError}`
        ].filter(Boolean).join('; ');
        setTestResult({
          success: false,
          message: `❌ Connection test failed: ${response.data.message}${details ? ` - ${details}` : ''}`
        });
      }
    } catch (error: any) {
      console.error('Error testing connection:', error);
      setTestResult({
        success: false,
        message: `❌ Connection test failed: ${error.response?.data?.message || error.message}`
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');

      // Prepare payload - only include passwords if provided
      const payload: any = {
        email_address: formData.emailAddress,
        inbound_method: formData.inboundMethod,
        imap_host: formData.inboundMethod === 'imap' ? formData.imapHost : undefined,
        imap_port: formData.inboundMethod === 'imap' ? Number(formData.imapPort) : undefined,
        imap_username: formData.inboundMethod === 'imap' ? formData.imapUsername : undefined,
        smtp_host: formData.smtpHost,
        smtp_port: Number(formData.smtpPort),
        smtp_username: formData.smtpUsername,
        provider: formData.provider,
        authMethod: formData.authMethod,
      };

      // Only include passwords if provided
      if (formData.inboundMethod === 'imap' && formData.imapPassword.trim()) {
        payload.imap_password = formData.imapPassword;
      }
      if (formData.smtpPassword.trim()) {
        payload.smtp_password = formData.smtpPassword;
      }

      console.log('Sending payload:', { projectId, editingConfig: editingConfig?._id, payload });

      let response;
      if (editingConfig) {
        console.log('PUT URL:', `${API_CONFIG.API_URL}/projects/${projectId}/email-configs/${editingConfig._id}`);
        // Update existing config
        response = await axios.put(
          `${API_CONFIG.API_URL}/projects/${projectId}/email-configs/${editingConfig._id}`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
      } else {
        console.log('POST URL:', `${API_CONFIG.API_URL}/projects/${projectId}/email-configs`);
        // Create new config
        response = await axios.post(
          `${API_CONFIG.API_URL}/projects/${projectId}/email-configs`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
      }

      if (response.data.success) {
        // Show success message
        alert(editingConfig 
          ? '✅ Email configuration updated successfully!'
          : '✅ Email configuration added successfully!'
        );
        
        // Reset form
        setFormData(getInitialFormData());
        setErrors({});
        setTestResult(null);
        
        // Call success callback
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      console.error('Error saving email config:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      alert(`❌ Failed to ${editingConfig ? 'update' : 'save'} email configuration:\n${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset form
    setFormData(getInitialFormData());
    setErrors({});
    setTestResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center">
              <EnvelopeIcon className="w-6 h-6 text-blue-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">
                {editingConfig ? 'Edit Email Configuration' : 'Add Email Configuration'}
              </h2>
            </div>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Email Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.emailAddress}
                onChange={(e) => handleInputChange('emailAddress', e.target.value)}
                className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.emailAddress
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-gray-300 focus:border-blue-500'
                }`}
                placeholder="support@example.com"
              />
              {errors.emailAddress && (
                <p className="mt-1 text-sm text-red-600">{errors.emailAddress}</p>
              )}
            </div>

            {/* Inbound Method Selector */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">Incoming Email Method</h3>
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="inboundMethod"
                    value="imap"
                    checked={formData.inboundMethod === 'imap'}
                    onChange={() => handleInputChange('inboundMethod', 'imap')}
                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">Direct IMAP Polling</span>
                    <p className="text-xs text-gray-500 mt-0.5">System polls your mailbox via IMAP at regular intervals (Gmail, Outlook, custom mail server)</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="inboundMethod"
                    value="sendgrid"
                    checked={formData.inboundMethod === 'sendgrid'}
                    onChange={() => handleInputChange('inboundMethod', 'sendgrid')}
                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">SendGrid Inbound Parse</span>
                    <span className="ml-2 text-xs text-green-700 font-medium bg-green-100 px-1.5 py-0.5 rounded">No IMAP needed</span>
                    <p className="text-xs text-gray-500 mt-0.5">SendGrid receives email and pushes it to this system via webhook — no IMAP credentials required</p>
                  </div>
                </label>
              </div>
            </div>

            {/* SendGrid Inbound Parse setup instructions */}
            {formData.inboundMethod === 'sendgrid' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="w-5 h-5 text-green-700 flex-shrink-0" />
                  <h4 className="text-sm font-semibold text-green-900">SendGrid Inbound Parse Setup</h4>
                </div>
                <ol className="text-xs text-green-800 space-y-1.5 list-decimal list-inside">
                  <li>Go to <a href="https://app.sendgrid.com/settings/parse" target="_blank" rel="noreferrer" className="underline font-medium">SendGrid → Settings → Inbound Parse</a></li>
                  <li>Click <strong>Add Host &amp; URL</strong></li>
                  <li>Set the receiving domain/subdomain that matches this email address</li>
                  <li>Set the <strong>Destination URL</strong> to:</li>
                </ol>
                <div className="flex items-center gap-2 bg-white border border-green-300 rounded px-3 py-2">
                  <code className="text-xs text-green-900 flex-1 break-all">
                    {window.location.origin.replace(':3000', ':5000').replace(':3001', ':5000')}/api/email/inbound/sendgrid
                  </code>
                </div>
                <p className="text-xs text-green-700">Emails sent to <strong>{formData.emailAddress || 'this address'}</strong> will be delivered to SAC Helpdesk automatically.</p>
              </div>
            )}

            {/* Provider Info Banner */}
            {formData.provider !== 'other' && (
              <div className={`flex items-start p-4 rounded-lg ${
                formData.provider === 'google' 
                  ? 'bg-blue-50 border border-blue-200' 
                  : 'bg-sky-50 border border-sky-200'
              }`}>
                <InformationCircleIcon className={`w-5 h-5 mt-0.5 mr-3 flex-shrink-0 ${
                  formData.provider === 'google' ? 'text-blue-600' : 'text-sky-600'
                }`} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    formData.provider === 'google' ? 'text-blue-800' : 'text-sky-800'
                  }`}>
                    {formData.provider === 'google' ? 'Google Gmail Detected' : 'Microsoft Outlook Detected'}
                  </p>
                  <p className={`text-sm mt-1 ${
                    formData.provider === 'google' ? 'text-blue-700' : 'text-sky-700'
                  }`}>
                    {formData.provider === 'google' ? (
                      <>
                        Gmail requires an <strong>App Password</strong> instead of your regular password.
                        <a 
                          href="https://myaccount.google.com/apppasswords" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="ml-1 underline hover:text-blue-900"
                        >
                          Create App Password
                        </a>
                        <span className="block mt-1 text-xs">
                          Note: You must have 2-Step Verification enabled to create App Passwords.
                        </span>
                      </>
                    ) : (
                      <>
                        Microsoft Outlook requires an <strong>App Password</strong> instead of your regular password.
                        <a 
                          href="https://account.live.com/proofs/AppPassword" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="ml-1 underline hover:text-sky-900"
                        >
                          Create App Password
                        </a>
                        <span className="block mt-1 text-xs">
                          Note: You must have 2-Step Verification enabled to create App Passwords.
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Authentication Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Authentication Method
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="authMethod"
                    value="basic"
                    checked={formData.authMethod === 'basic'}
                    onChange={() => handleInputChange('authMethod', 'basic')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Basic Password</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="authMethod"
                    value="app_password"
                    checked={formData.authMethod === 'app_password'}
                    onChange={() => handleInputChange('authMethod', 'app_password')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">App Password</span>
                  {(formData.provider === 'google' || formData.provider === 'microsoft') && (
                    <span className="ml-1 text-xs text-green-600 font-medium">(Recommended)</span>
                  )}
                </label>
              </div>
              {formData.authMethod === 'app_password' && (
                <p className="mt-1 text-xs text-gray-500">
                  App Passwords are 16-character codes that give apps access to your email without your main password.
                </p>
              )}
            </div>

            {/* IMAP Settings Section — only for IMAP inbound */}
            {formData.inboundMethod === 'imap' && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center mb-4">
                <ServerIcon className="w-5 h-5 text-gray-600 mr-2" />
                <h3 className="text-sm font-semibold text-gray-900">IMAP Settings (Incoming Mail)</h3>
              </div>

              <div className="space-y-4">
                {/* IMAP Host */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    IMAP Host <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.imapHost}
                    onChange={(e) => handleInputChange('imapHost', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.imapHost
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder="imap.gmail.com"
                  />
                  {errors.imapHost && (
                    <p className="mt-1 text-sm text-red-600">{errors.imapHost}</p>
                  )}
                </div>

                {/* IMAP Port */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    IMAP Port <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.imapPort}
                    onChange={(e) => handleInputChange('imapPort', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.imapPort
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder="993"
                    min="1"
                    max="65535"
                  />
                  {errors.imapPort && (
                    <p className="mt-1 text-sm text-red-600">{errors.imapPort}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">Common: 993 (SSL) or 143 (non-SSL)</p>
                </div>

                {/* IMAP Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    IMAP Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.imapUsername}
                    onChange={(e) => handleInputChange('imapUsername', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.imapUsername
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder="support@example.com"
                  />
                  {errors.imapUsername && (
                    <p className="mt-1 text-sm text-red-600">{errors.imapUsername}</p>
                  )}
                </div>

                {/* IMAP Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    IMAP Password {!editingConfig && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="password"
                    value={formData.imapPassword}
                    onChange={(e) => handleInputChange('imapPassword', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.imapPassword
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder={editingConfig ? '••••••••' : '••••••••'}
                  />
                  {errors.imapPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.imapPassword}</p>
                  )}
                  {editingConfig && (
                    <p className="mt-1 text-xs text-gray-500">Leave blank to keep existing password</p>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* SMTP Settings Section */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center mb-4">
                <ServerIcon className="w-5 h-5 text-gray-600 mr-2" />
                <h3 className="text-sm font-semibold text-gray-900">SMTP Settings (Outgoing Mail)</h3>
              </div>

              <div className="space-y-4">
                {/* SMTP Host */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SMTP Host <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.smtpHost}
                    onChange={(e) => handleInputChange('smtpHost', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.smtpHost
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder="smtp.gmail.com"
                  />
                  {errors.smtpHost && (
                    <p className="mt-1 text-sm text-red-600">{errors.smtpHost}</p>
                  )}
                </div>

                {/* SMTP Port */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SMTP Port <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.smtpPort}
                    onChange={(e) => handleInputChange('smtpPort', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.smtpPort
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder="587"
                    min="1"
                    max="65535"
                  />
                  {errors.smtpPort && (
                    <p className="mt-1 text-sm text-red-600">{errors.smtpPort}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">Common: 587 (TLS) or 465 (SSL)</p>
                </div>

                {/* SMTP Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SMTP Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.smtpUsername}
                    onChange={(e) => handleInputChange('smtpUsername', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.smtpUsername
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder="support@example.com"
                  />
                  {errors.smtpUsername && (
                    <p className="mt-1 text-sm text-red-600">{errors.smtpUsername}</p>
                  )}
                </div>

                {/* SMTP Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SMTP Password {!editingConfig && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="password"
                    value={formData.smtpPassword}
                    onChange={(e) => handleInputChange('smtpPassword', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.smtpPassword
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder={editingConfig ? '••••••••' : '••••••••'}
                  />
                  {errors.smtpPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.smtpPassword}</p>
                  )}
                  {editingConfig && (
                    <p className="mt-1 text-xs text-gray-500">Leave blank to keep existing password</p>
                  )}
                </div>
              </div>
            </div>

            {/* Test Result */}
            {testResult && (
              <div
                className={`p-4 rounded-md flex items-start ${
                  testResult.success
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
                ) : (
                  <ExclamationCircleIcon className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                )}
                <p
                  className={`text-sm ${
                    testResult.success ? 'text-green-800' : 'text-red-800'
                  }`}
                >
                  {testResult.message}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              {/* Test Connection Button — only for IMAP inbound */}
              {formData.inboundMethod === 'imap' ? (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || loading}
                className="inline-flex items-center px-4 py-2 border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {testing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Testing...
                  </>
                ) : (
                  <>
                    <SignalIcon className="w-4 h-4 mr-2" />
                    Test Connection
                  </>
                )}
              </button>
              ) : (
                <div />
              )}

              {/* Save & Cancel Buttons */}
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading || testing}
                  className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || testing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {editingConfig ? 'Updating...' : 'Saving...'}
                    </>
                  ) : (
                    editingConfig ? 'Update Configuration' : 'Save Configuration'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EmailConfigModal;
