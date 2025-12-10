import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import {
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  InformationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';

// Variable definitions for each trigger type
const TRIGGER_VARIABLES: { [key: string]: { variable: string; description: string }[] } = {
  accountCreated: [
    { variable: '{{studentName}}', description: 'Student\'s full name' },
    { variable: '{{email}}', description: 'Student\'s email address' },
    { variable: '{{loginUrl}}', description: 'Link to student login page' },
    { variable: '{{projectName}}', description: 'Project/portal name' },
  ],
  passwordReset: [
    { variable: '{{studentName}}', description: 'Student\'s full name' },
    { variable: '{{email}}', description: 'Student\'s email address' },
    { variable: '{{otp}}', description: 'One-time password for reset' },
  ],
  ticketCreatedStudent: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{ticketSubject}}', description: 'Ticket subject (alias for ticketTitle)' },
    { variable: '{{studentName}}', description: 'Student\'s name' },
    { variable: '{{ticketStatus}}', description: 'Ticket status (Open, In Progress, etc.)' },
    { variable: '{{ticketPriority}}', description: 'Ticket priority (Low, Medium, High)' },
  ],
  ticketCreatedAgent: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{studentName}}', description: 'Student\'s name' },
    { variable: '{{agentName}}', description: 'Assigned agent\'s name' },
  ],
  ticketCreatedOnline: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{ticketSubject}}', description: 'Ticket subject (alias for ticketTitle)' },
    { variable: '{{studentName}}', description: 'Student\'s name' },
    { variable: '{{ticketStatus}}', description: 'Ticket status' },
    { variable: '{{ticketPriority}}', description: 'Ticket priority' },
  ],
  ticketCreatedOffline: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{studentName}}', description: 'Student\'s name' },
  ],
  ticketCreatedEmail: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{email}}', description: 'Sender\'s email' },
  ],
  ticketAssigned: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{agentName}}', description: 'Assigned agent\'s name' },
    { variable: '{{studentName}}', description: 'Student\'s name' },
  ],
  ticketStatusChanged: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{oldStatus}}', description: 'Previous status' },
    { variable: '{{newStatus}}', description: 'New status' },
    { variable: '{{studentName}}', description: 'Student\'s name' },
  ],
  ticketCommentAdded: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{commentAuthor}}', description: 'Person who added comment' },
    { variable: '{{commentText}}', description: 'Comment content' },
  ],
  ticketResolved: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{studentName}}', description: 'Student\'s name' },
    { variable: '{{resolutionTime}}', description: 'Time taken to resolve' },
  ],
  ticketClosed: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{studentName}}', description: 'Student\'s name' },
  ],
  ticketEscalated: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{escalationLevel}}', description: 'Current escalation level' },
    { variable: '{{agentName}}', description: 'Assigned agent\'s name' },
  ],
  slaWarning: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{timeRemaining}}', description: 'Time before SLA breach' },
    { variable: '{{agentName}}', description: 'Assigned agent\'s name' },
  ],
  slaBreach: [
    { variable: '{{ticketNumber}}', description: 'Unique ticket number' },
    { variable: '{{ticketTitle}}', description: 'Ticket subject/title' },
    { variable: '{{breachTime}}', description: 'How long SLA was breached' },
    { variable: '{{agentName}}', description: 'Assigned agent\'s name' },
  ],
};

interface EmailTrigger {
  name: string;
  enabled: boolean;
  subject: string;
  body: string;
  recipients: 'student' | 'agent' | 'both' | 'custom';
  customRecipients?: string[];
}

interface EmailConfig {
  _id: string;
  projectId: string;
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  triggers: {
    [key: string]: EmailTrigger;
  };
}

const EmailConfigPage: React.FC = () => {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'smtp' | 'triggers'>('smtp');
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [triggerEdits, setTriggerEdits] = useState<Partial<EmailTrigger>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  // Get projectId from context, URL, or fetch projects
  useEffect(() => {
    const getProjectId = async () => {
      // Try projectContext first
      const projectContext = JSON.parse(localStorage.getItem('projectContext') || '{}');
      if (projectContext.projectId) {
        console.log('Using projectId from projectContext:', projectContext.projectId);
        setProjectId(projectContext.projectId);
        setLoading(false);
        return;
      }

      // Try direct projectId
      const directProjectId = localStorage.getItem('projectId');
      if (directProjectId) {
        console.log('Using direct projectId:', directProjectId);
        setProjectId(directProjectId);
        setLoading(false);
        return;
      }

      // For super admin, fetch all projects and use the first one
      try {
        const token = localStorage.getItem('authToken');
        console.log('Fetching projects for email config...');
        const response = await axios.get(`${API_BASE_URL}/api/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('Projects response:', response.data);
        
        // Handle different response structures
        let projectsList = [];
        if (response.data.success && response.data.data) {
          // If data is an object with projects property
          if (response.data.data.projects && Array.isArray(response.data.data.projects)) {
            projectsList = response.data.data.projects;
          } 
          // If data itself is an array
          else if (Array.isArray(response.data.data)) {
            projectsList = response.data.data;
          }
          // If data is a single object, wrap it in an array
          else if (typeof response.data.data === 'object') {
            projectsList = [response.data.data];
          }
        } else if (Array.isArray(response.data)) {
          projectsList = response.data;
        }
        
        console.log('Parsed projects list:', projectsList);
        
        if (projectsList.length > 0) {
          setProjects(projectsList);
          setProjectId(projectsList[0]._id);
        } else {
          console.warn('No projects found');
          setLoading(false);
        }
      } catch (error: any) {
        console.error('Error fetching projects:', error);
        console.error('Error response:', error.response?.data);
        setLoading(false);
      }
    };
    getProjectId();
  }, []);

  useEffect(() => {
    if (projectId) {
      fetchEmailConfig();
    }
  }, [projectId]);

  const fetchEmailConfig = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE_URL}/api/email-config/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfig(response.data.data);
      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching email config:', error);
      console.error('Error details:', error.response?.data);
      // If config doesn't exist, it will be created by the backend
      // Set loading to false to show the form
      setLoading(false);
    }
  };

  const togglePasswordVisibility = async () => {
    if (!showPassword && config?.smtpPassword === '********') {
      // Fetch real password from backend
      try {
        const token = localStorage.getItem('authToken');
        const response = await axios.get(`${API_BASE_URL}/api/email-config/${projectId}?showPassword=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setConfig(response.data.data);
        setShowPassword(true);
      } catch (error) {
        console.error('Error fetching password:', error);
      }
    } else {
      setShowPassword(!showPassword);
    }
  };

  const handleSMTPChange = (field: string, value: any) => {
    if (config) {
      setConfig({ ...config, [field]: value });
    }
  };

  const saveSMTPConfig = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('authToken');
      
      const updates = {
        enabled: config?.enabled,
        smtpHost: config?.smtpHost,
        smtpPort: config?.smtpPort,
        smtpSecure: config?.smtpSecure,
        smtpUser: config?.smtpUser,
        fromEmail: config?.fromEmail,
        fromName: config?.fromName,
      };

      // Only include password if it's not the masked value
      if (config?.smtpPassword && config.smtpPassword !== '********') {
        (updates as any).smtpPassword = config.smtpPassword;
      }

      await axios.put(`${API_BASE_URL}/api/email-config/${projectId}`, updates, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      alert('SMTP configuration saved successfully!');
      fetchEmailConfig();
    } catch (error) {
      console.error('Error saving SMTP config:', error);
      alert('Failed to save SMTP configuration');
    } finally {
      setSaving(false);
    }
  };

  const testEmailConfiguration = async () => {
    try {
      setTestingEmail(true);
      setTestResult(null);
      const token = localStorage.getItem('authToken');
      
      const response = await axios.post(
        `${API_BASE_URL}/api/email-config/${projectId}/test`,
        { testEmail },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setTestResult({ success: true, message: response.data.message });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.response?.data?.message || 'Failed to send test email',
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const openTriggerEditor = (triggerKey: string) => {
    setSelectedTrigger(triggerKey);
    if (config) {
      setTriggerEdits(config.triggers[triggerKey]);
    }
  };

  const saveTrigger = async () => {
    if (!selectedTrigger) return;

    try {
      setSaving(true);
      const token = localStorage.getItem('authToken');
      
      await axios.put(
        `${API_BASE_URL}/api/email-config/${projectId}/triggers/${selectedTrigger}`,
        triggerEdits,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert('Trigger updated successfully!');
      fetchEmailConfig();
      setSelectedTrigger(null);
      setTriggerEdits({});
    } catch (error) {
      console.error('Error saving trigger:', error);
      alert('Failed to save trigger');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <EnvelopeIcon className="h-8 w-8 text-blue-600" />
            Email Configuration
          </h1>
          <p className="text-gray-600 mt-2">
            Configure SMTP settings and manage email triggers for your project
          </p>
        </div>

        {/* Project Selector (for super admin) */}
        {projects.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Project
            </label>
            <select
              value={projectId || ''}
              onChange={(e) => setProjectId(e.target.value)}
              className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name} ({project.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('smtp')}
              className={`${
                activeTab === 'smtp'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <Cog6ToothIcon className="h-5 w-5" />
              SMTP Settings
            </button>
            <button
              onClick={() => setActiveTab('triggers')}
              className={`${
                activeTab === 'triggers'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <PaperAirplaneIcon className="h-5 w-5" />
              Email Triggers
            </button>
          </nav>
        </div>

        {/* SMTP Settings Tab */}
        {activeTab === 'smtp' && config && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="space-y-6">
              {/* Enable/Disable Email */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Email Integration</h3>
                  <p className="text-sm text-gray-600">Enable or disable email notifications</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => handleSMTPChange('enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* SMTP Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SMTP Host *
                  </label>
                  <input
                    type="text"
                    value={config.smtpHost}
                    onChange={(e) => handleSMTPChange('smtpHost', e.target.value)}
                    placeholder="smtp.gmail.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SMTP Port *
                  </label>
                  <input
                    type="number"
                    value={config.smtpPort}
                    onChange={(e) => handleSMTPChange('smtpPort', parseInt(e.target.value))}
                    placeholder="587"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SMTP Username *
                  </label>
                  <input
                    type="text"
                    value={config.smtpUser}
                    onChange={(e) => handleSMTPChange('smtpUser', e.target.value)}
                    placeholder="your-email@gmail.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SMTP Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={config.smtpPassword}
                      onChange={(e) => handleSMTPChange('smtpPassword', e.target.value)}
                      placeholder="********"
                      className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-5 w-5" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Email *
                  </label>
                  <input
                    type="email"
                    value={config.fromEmail}
                    onChange={(e) => handleSMTPChange('fromEmail', e.target.value)}
                    placeholder="noreply@example.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Name
                  </label>
                  <input
                    type="text"
                    value={config.fromName}
                    onChange={(e) => handleSMTPChange('fromName', e.target.value)}
                    placeholder="SAC Helpdesk"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="smtpSecure"
                    checked={config.smtpSecure}
                    onChange={(e) => handleSMTPChange('smtpSecure', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="smtpSecure" className="ml-2 block text-sm text-gray-700">
                    Use SSL/TLS (Port 465)
                  </label>
                </div>
              </div>

              {/* Test Email */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Email Configuration</h3>
                <div className="flex gap-4">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="Enter email to send test"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={testEmailConfiguration}
                    disabled={testingEmail || !testEmail}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {testingEmail ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <PaperAirplaneIcon className="h-5 w-5" />
                        Send Test Email
                      </>
                    )}
                  </button>
                </div>
                {testResult && (
                  <div
                    className={`mt-4 p-4 rounded-lg flex items-center gap-3 ${
                      testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircleIcon className="h-6 w-6" />
                    ) : (
                      <XCircleIcon className="h-6 w-6" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="flex justify-end border-t pt-6">
                <button
                  onClick={saveSMTPConfig}
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save SMTP Configuration'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Email Triggers Tab */}
        {activeTab === 'triggers' && config && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="space-y-4">
              {Object.entries(config.triggers).map(([key, trigger]) => (
                <div key={key} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">{trigger.name}</h3>
                        <span
                          className={`px-3 py-1 text-xs font-medium rounded-full ${
                            trigger.enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {trigger.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          {trigger.recipients}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">Subject: {trigger.subject}</p>
                    </div>
                    <button
                      onClick={() => openTriggerEditor(key)}
                      className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg font-medium"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trigger Editor Modal */}
        {selectedTrigger && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Edit Email Trigger: {triggerEdits.name}
                </h2>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={triggerEdits.enabled}
                        onChange={(e) => setTriggerEdits({ ...triggerEdits, enabled: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-700">Enable this trigger</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                    <input
                      type="text"
                      value={triggerEdits.subject}
                      onChange={(e) => setTriggerEdits({ ...triggerEdits, subject: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Body</label>
                    <textarea
                      value={triggerEdits.body}
                      onChange={(e) => setTriggerEdits({ ...triggerEdits, body: e.target.value })}
                      rows={10}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>

                  {/* Available Variables Reference */}
                  {selectedTrigger && TRIGGER_VARIABLES[selectedTrigger] && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <InformationCircleIcon className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-blue-900 mb-2">Available Variables</h4>
                          <p className="text-xs text-blue-700 mb-3">
                            Use these variables in your subject and body. They will be automatically replaced with actual values when the email is sent.
                          </p>
                          <div className="grid grid-cols-1 gap-2">
                            {TRIGGER_VARIABLES[selectedTrigger].map((v, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs">
                                <code className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono whitespace-nowrap">
                                  {v.variable}
                                </code>
                                <span className="text-blue-700">- {v.description}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-blue-200">
                            <p className="text-xs text-blue-700 font-medium mb-1">Example Usage:</p>
                            <code className="block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                              Subject: {TRIGGER_VARIABLES[selectedTrigger][0]?.variable} - Action Required
                            </code>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Recipients</label>
                    <select
                      value={triggerEdits.recipients}
                      onChange={(e) => setTriggerEdits({ ...triggerEdits, recipients: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="student">Student Only</option>
                      <option value="agent">Agent Only</option>
                      <option value="both">Both Student & Agent</option>
                      <option value="custom">Custom Recipients</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-4 mt-6 pt-6 border-t">
                  <button
                    onClick={() => {
                      setSelectedTrigger(null);
                      setTriggerEdits({});
                    }}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveTrigger}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Trigger'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailConfigPage;
