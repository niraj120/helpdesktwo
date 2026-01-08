import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import ModuleHeader from '../components/ModuleHeader';
import {
    CheckCircleIcon,
    XCircleIcon,
    Cog6ToothIcon,
    PaperAirplaneIcon,
    InformationCircleIcon,
    EyeIcon,
    EyeSlashIcon,
} from '@heroicons/react/24/outline';

/**
 * Template variable definitions for each trigger type
 * These correspond to {{1}}, {{2}}, etc. in WhatsApp templates
 */
const TRIGGER_TEMPLATE_VARIABLES: Record<string, { order: number; name: string; description: string }[]> = {
    accountCreated: [
        { order: 1, name: 'studentName', description: "Student's full name" },
        { order: 2, name: 'email', description: "Student's email address" },
        { order: 3, name: 'loginUrl', description: 'Login page URL' },
    ],
    passwordReset: [
        { order: 1, name: 'userName', description: "User's full name" },
        { order: 2, name: 'resetLink', description: 'Password reset link' },
    ],
    ticketCreatedStudent: [
        { order: 1, name: 'studentName', description: "Student's full name" },
        { order: 2, name: 'ticketNumber', description: 'Ticket number' },
        { order: 3, name: 'ticketSubject', description: 'Ticket subject/title' },
        { order: 4, name: 'ticketStatus', description: 'Current ticket status' },
    ],
    ticketCreatedAgent: [
        { order: 1, name: 'agentName', description: "Agent's full name" },
        { order: 2, name: 'ticketNumber', description: 'Ticket number' },
        { order: 3, name: 'studentName', description: "Student's name" },
        { order: 4, name: 'ticketSubject', description: 'Ticket subject/title' },
        { order: 5, name: 'ticketPriority', description: 'Ticket priority level' },
    ],
    ticketAssigned: [
        { order: 1, name: 'agentName', description: "Assigned agent's name" },
        { order: 2, name: 'ticketNumber', description: 'Ticket number' },
        { order: 3, name: 'ticketSubject', description: 'Ticket subject/title' },
        { order: 4, name: 'studentName', description: "Student's name" },
    ],
    ticketStatusChanged: [
        { order: 1, name: 'studentName', description: "Student's full name" },
        { order: 2, name: 'ticketNumber', description: 'Ticket number' },
        { order: 3, name: 'newStatus', description: 'New ticket status' },
        { order: 4, name: 'previousStatus', description: 'Previous ticket status' },
    ],
    ticketClosed: [
        { order: 1, name: 'studentName', description: "Student's full name" },
        { order: 2, name: 'ticketNumber', description: 'Ticket number' },
        { order: 3, name: 'resolution', description: 'Resolution summary' },
    ],
    studentOTP: [
        { order: 1, name: 'otpCode', description: '6-digit OTP code' },
    ],
};

interface WhatsAppTrigger {
    name: string;
    enabled: boolean;
    numberId: string;           // Pre-approved Number ID for this template
    templateName: string;
    templateLanguage: string;
    recipients: 'student' | 'agent' | 'both' | 'custom';
    customRecipients?: string[];
}

interface WhatsAppConfig {
    _id: string;
    projectId: string;
    apiBaseUrl: string;          // API Base URL (e.g., https://crmapi.wa0.in/api/meta/v19.0)
    accessToken: string;
    triggers: {
        [key: string]: WhatsAppTrigger;
    };
}

const WhatsAppConfigPage: React.FC = () => {
    const [config, setConfig] = useState<WhatsAppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testPhone, setTestPhone] = useState('');
    const [testingTrigger, setTestingTrigger] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
    const [triggerEdits, setTriggerEdits] = useState<Partial<WhatsAppTrigger>>({});
    const [projectId, setProjectId] = useState<string | null>(null);
    const [projects, setProjects] = useState<any[]>([]);
    const [showAccessToken, setShowAccessToken] = useState(false);
    const [showApiSettings, setShowApiSettings] = useState(false);

    // Get projectId from context, URL, or fetch projects
    useEffect(() => {
        const getProjectId = async () => {
            const projectContext = JSON.parse(localStorage.getItem('projectContext') || '{}');
            if (projectContext.projectId) {
                setProjectId(projectContext.projectId);
                setLoading(false);
                return;
            }

            const directProjectId = localStorage.getItem('projectId');
            if (directProjectId) {
                setProjectId(directProjectId);
                setLoading(false);
                return;
            }

            try {
                const token = localStorage.getItem('authToken');
                const response = await axios.get(`${API_BASE_URL}/projects`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                let projectsList = [];
                if (response.data.success && response.data.data) {
                    if (response.data.data.projects && Array.isArray(response.data.data.projects)) {
                        projectsList = response.data.data.projects;
                    } else if (Array.isArray(response.data.data)) {
                        projectsList = response.data.data;
                    } else if (typeof response.data.data === 'object') {
                        projectsList = [response.data.data];
                    }
                } else if (Array.isArray(response.data)) {
                    projectsList = response.data;
                }

                if (projectsList.length > 0) {
                    setProjects(projectsList);
                    setProjectId(projectsList[0]._id);
                } else {
                    setLoading(false);
                }
            } catch (error: any) {
                console.error('Error fetching projects:', error);
                setLoading(false);
            }
        };
        getProjectId();
    }, []);

    useEffect(() => {
        if (projectId) {
            fetchWhatsAppConfig();
        }
    }, [projectId]);

    const fetchWhatsAppConfig = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('authToken');
            const response = await axios.get(`${API_BASE_URL}/whatsapp-config/${projectId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setConfig(response.data.data);
        } catch (error: any) {
            console.error('Error fetching WhatsApp config:', error);
            alert('Failed to load WhatsApp configuration');
        } finally {
            setLoading(false);
        }
    };

    const saveApiSettings = async () => {
        if (!config || !projectId) return;

        try {
            setSaving(true);
            const token = localStorage.getItem('authToken');

            await axios.put(
                `${API_BASE_URL}/whatsapp-config/${projectId}/settings`,
                {
                    apiBaseUrl: config.apiBaseUrl,
                    accessToken: config.accessToken,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            alert('WhatsApp API settings saved successfully!');
        } catch (error: any) {
            console.error('Error saving settings:', error);
            alert('Failed to save WhatsApp settings');
        } finally {
            setSaving(false);
        }
    };

    const openTriggerEditor = (triggerKey: string) => {
        if (config?.triggers[triggerKey]) {
            setSelectedTrigger(triggerKey);
            setTriggerEdits({ ...config.triggers[triggerKey] });
        }
    };

    const saveTrigger = async () => {
        if (!selectedTrigger || !projectId) return;

        try {
            setSaving(true);
            const token = localStorage.getItem('authToken');

            await axios.put(
                `${API_BASE_URL}/whatsapp-config/${projectId}/triggers/${selectedTrigger}`,
                triggerEdits,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Update local state
            if (config) {
                setConfig({
                    ...config,
                    triggers: {
                        ...config.triggers,
                        [selectedTrigger]: { ...config.triggers[selectedTrigger], ...triggerEdits }
                    }
                });
            }

            setSelectedTrigger(null);
            setTriggerEdits({});
            alert('Trigger saved successfully!');
        } catch (error: any) {
            console.error('Error saving trigger:', error);
            alert('Failed to save trigger');
        } finally {
            setSaving(false);
        }
    };

    const testTrigger = async (triggerKey: string) => {
        if (!testPhone || !projectId) {
            alert('Please enter a test phone number');
            return;
        }

        try {
            setTestingTrigger(triggerKey);
            setTestResult(null);
            const token = localStorage.getItem('authToken');

            const response = await axios.post(
                `${API_BASE_URL}/whatsapp-config/${projectId}/triggers/${triggerKey}/test`,
                { testPhoneNumber: testPhone },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setTestResult({ success: true, message: response.data.message || 'Test message sent!' });
        } catch (error: any) {
            setTestResult({
                success: false,
                message: error.response?.data?.message || 'Failed to send test message'
            });
        } finally {
            setTestingTrigger(null);
        }
    };

    const toggleTriggerEnabled = async (triggerKey: string, enabled: boolean) => {
        if (!projectId) return;

        try {
            const token = localStorage.getItem('authToken');
            await axios.put(
                `${API_BASE_URL}/whatsapp-config/${projectId}/triggers/${triggerKey}`,
                { enabled },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (config) {
                setConfig({
                    ...config,
                    triggers: {
                        ...config.triggers,
                        [triggerKey]: { ...config.triggers[triggerKey], enabled }
                    }
                });
            }
        } catch (error: any) {
            console.error('Error toggling trigger:', error);
            alert('Failed to update trigger');
        }
    };

    const updateTriggerField = async (triggerKey: string, field: string, value: string) => {
        if (!projectId || !config) return;

        // Update local state
        setConfig({
            ...config,
            triggers: {
                ...config.triggers,
                [triggerKey]: { ...config.triggers[triggerKey], [field]: value }
            }
        });

        // Save to server
        try {
            const token = localStorage.getItem('authToken');
            await axios.put(
                `${API_BASE_URL}/whatsapp-config/${projectId}/triggers/${triggerKey}`,
                { [field]: value },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (error) {
            console.error(`Error updating ${field}:`, error);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
            </div>
        );
    }

    if (!config) {
        return (
            <div className="text-center py-12">
                <h3 className="text-lg font-medium text-gray-900">No configuration found</h3>
                <p className="text-gray-500 mt-2">Please select a project to configure WhatsApp.</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <ModuleHeader
                title="WhatsApp Configuration"
                subtitle="Configure WhatsApp Business API settings and message triggers"
            />

            {/* Project Selector (if multiple projects available) */}
            {projects.length > 1 && (
                <div className="bg-white rounded-lg shadow p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Project</label>
                    <select
                        value={projectId || ''}
                        onChange={(e) => setProjectId(e.target.value)}
                        className="w-full md:w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                    >
                        {projects.map((project) => (
                            <option key={project._id} value={project._id}>
                                {project.name} ({project.code})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* API Settings Section (Collapsible) */}
            <div className="bg-white rounded-lg shadow">
                <button
                    onClick={() => setShowApiSettings(!showApiSettings)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left"
                >
                    <div className="flex items-center gap-3">
                        <Cog6ToothIcon className="h-5 w-5 text-gray-400" />
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">WhatsApp API Settings</h2>
                            <p className="text-sm text-gray-500">
                                {config.apiBaseUrl ? 'Configured' : 'Not configured'} - Click to {showApiSettings ? 'collapse' : 'expand'}
                            </p>
                        </div>
                    </div>
                    <svg
                        className={`h-5 w-5 text-gray-400 transform transition-transform ${showApiSettings ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {showApiSettings && (
                    <div className="px-6 pb-6 border-t border-gray-100">
                        <div className="grid grid-cols-1 gap-4 mt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    API Base URL <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={config.apiBaseUrl}
                                    onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })}
                                    placeholder="https://crmapi.wa0.in/api/meta/v19.0"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Base URL for WhatsApp API. The Number ID will be appended to this URL.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Access Token <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showAccessToken ? 'text' : 'password'}
                                        value={config.accessToken}
                                        onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
                                        placeholder="Enter API access token"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:ring-green-500 focus:border-green-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAccessToken(!showAccessToken)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showAccessToken ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                                    </button>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">Bearer token for API authentication</p>
                            </div>
                        </div>

                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-800">
                                <strong>API URL Format:</strong> {config.apiBaseUrl || 'https://crmapi.wa0.in/api/meta/v19.0'}/{'{numberId}'}/messages
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                                Each template has its own Number ID that is provided after WhatsApp approval.
                            </p>
                        </div>

                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={saveApiSettings}
                                disabled={saving}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save API Settings'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Test Result */}
            {testResult && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {testResult.success ? <CheckCircleIcon className="h-5 w-5" /> : <XCircleIcon className="h-5 w-5" />}
                    <span>{testResult.message}</span>
                    <button onClick={() => setTestResult(null)} className="ml-auto text-sm underline">Dismiss</button>
                </div>
            )}

            {/* Message Triggers Section */}
            <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900">Message Triggers</h2>
                    <p className="text-sm text-gray-500">
                        Configure WhatsApp templates for each event. Each template requires a pre-approved Number ID.
                    </p>
                </div>

                <div className="divide-y divide-gray-100">
                    {Object.entries(config.triggers).map(([key, trigger]) => (
                        <div key={key} className="px-6 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-3">
                                        <h3 className="font-medium text-gray-900">{trigger.name}</h3>
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${trigger.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                            {trigger.enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                                            {trigger.recipients}
                                        </span>
                                    </div>

                                    {/* Number ID and Template Name Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">
                                                Number ID <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={trigger.numberId || ''}
                                                onChange={(e) => updateTriggerField(key, 'numberId', e.target.value)}
                                                placeholder="e.g., 952415067947914"
                                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500 focus:border-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">
                                                Template Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={trigger.templateName || ''}
                                                onChange={(e) => updateTriggerField(key, 'templateName', e.target.value)}
                                                placeholder="e.g., test_otp"
                                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500 focus:border-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Language</label>
                                            <select
                                                value={trigger.templateLanguage || 'en'}
                                                onChange={(e) => updateTriggerField(key, 'templateLanguage', e.target.value)}
                                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500 focus:border-green-500"
                                            >
                                                <option value="en">English</option>
                                                <option value="hi">Hindi</option>
                                                <option value="mr">Marathi</option>
                                            </select>
                                        </div>

                                        {/* Test Section */}
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Test Phone</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={testPhone}
                                                    onChange={(e) => setTestPhone(e.target.value)}
                                                    placeholder="919876543210"
                                                    className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500 focus:border-green-500"
                                                />
                                                <button
                                                    onClick={() => testTrigger(key)}
                                                    disabled={testingTrigger === key || !trigger.numberId || !trigger.templateName}
                                                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <PaperAirplaneIcon className="h-4 w-4" />
                                                    {testingTrigger === key ? '...' : 'Test'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Variable Info */}
                                    {TRIGGER_TEMPLATE_VARIABLES[key] && (
                                        <button
                                            onClick={() => openTriggerEditor(key)}
                                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                        >
                                            <InformationCircleIcon className="h-4 w-4" />
                                            View template variables ({TRIGGER_TEMPLATE_VARIABLES[key].length} params)
                                        </button>
                                    )}
                                </div>

                                {/* Toggle & Edit */}
                                <div className="flex flex-col items-end gap-2">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={trigger.enabled}
                                            onChange={(e) => toggleTriggerEnabled(key, e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                    </label>
                                    <button
                                        onClick={() => openTriggerEditor(key)}
                                        className="text-sm text-gray-600 hover:text-gray-900"
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Trigger Edit Modal */}
            {selectedTrigger && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">
                                Edit Trigger: {config.triggers[selectedTrigger]?.name}
                            </h2>
                            <button onClick={() => setSelectedTrigger(null)} className="text-gray-400 hover:text-gray-600">
                                <XCircleIcon className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="triggerEnabled"
                                    checked={triggerEdits.enabled || false}
                                    onChange={(e) => setTriggerEdits({ ...triggerEdits, enabled: e.target.checked })}
                                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                                />
                                <label htmlFor="triggerEnabled" className="text-sm font-medium text-gray-700">
                                    Enable this trigger
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Number ID <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={triggerEdits.numberId || ''}
                                    onChange={(e) => setTriggerEdits({ ...triggerEdits, numberId: e.target.value })}
                                    placeholder="e.g., 952415067947914"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Pre-approved Number ID from WhatsApp. This is used in the API URL path.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Template Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={triggerEdits.templateName || ''}
                                    onChange={(e) => setTriggerEdits({ ...triggerEdits, templateName: e.target.value })}
                                    placeholder="e.g., test_otp"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Pre-approved WhatsApp template name
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Template Language</label>
                                <select
                                    value={triggerEdits.templateLanguage || 'en'}
                                    onChange={(e) => setTriggerEdits({ ...triggerEdits, templateLanguage: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                                >
                                    <option value="en">English</option>
                                    <option value="hi">Hindi</option>
                                    <option value="mr">Marathi</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Recipients</label>
                                <select
                                    value={triggerEdits.recipients || 'student'}
                                    onChange={(e) => setTriggerEdits({ ...triggerEdits, recipients: e.target.value as any })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                                >
                                    <option value="student">Student</option>
                                    <option value="agent">Agent</option>
                                    <option value="both">Both</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </div>

                            {/* Template Variables Reference */}
                            {TRIGGER_TEMPLATE_VARIABLES[selectedTrigger] && (
                                <div className="bg-blue-50 rounded-lg p-4">
                                    <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                                        <InformationCircleIcon className="h-5 w-5" />
                                        Template Variables Reference
                                    </h4>
                                    <p className="text-xs text-blue-700 mb-3">
                                        When creating your template in WhatsApp Business, use these placeholders:
                                    </p>
                                    <div className="space-y-1">
                                        {TRIGGER_TEMPLATE_VARIABLES[selectedTrigger].map((variable) => (
                                            <div key={variable.order} className="flex items-center gap-2 text-sm">
                                                <code className="bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                                    {`{{${variable.order}}}`}
                                                </code>
                                                <span className="text-blue-600">→</span>
                                                <span className="text-blue-800">{variable.description}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                onClick={() => setSelectedTrigger(null)}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveTrigger}
                                disabled={saving}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppConfigPage;
