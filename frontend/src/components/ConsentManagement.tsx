/**
 * DPDP Act 2023 Compliance: Consent Management UI
 * 
 * Frontend component for users to manage their data processing consents
 */

import React, { useState, useEffect } from 'react';
import { MdCheckCircle, MdCancel, MdInfo, MdWarning } from 'react-icons/md';
import { API_CONFIG } from '../config/constants';
import DashboardLayout from './DashboardLayout';
import ModuleHeader from './ModuleHeader';

interface ConsentRecord {
  _id: string;
  purpose: string;
  status: 'ACTIVE' | 'WITHDRAWN' | 'EXPIRED';
  consentedAt: string;
  withdrawnAt?: string;
  expiresAt?: string;
  policyVersion: string;
  dataCategories: string[];
  sharingAllowed: boolean;
  marketingAllowed: boolean;
}

interface ConsentPurposeInfo {
  title: string;
  description: string;
  required: boolean;
  icon: string;
  dataCategories: string[];
}

const CONSENT_PURPOSES: Record<string, ConsentPurposeInfo> = {
  ACCOUNT_CREATION: {
    title: 'Account Management',
    description: 'Create and maintain your account, authenticate your identity',
    required: true,
    icon: '👤',
    dataCategories: ['basic_profile', 'contact_info'],
  },
  TICKET_MANAGEMENT: {
    title: 'Ticket & Support Services',
    description: 'Create, manage, and resolve support tickets',
    required: true,
    icon: '🎫',
    dataCategories: ['basic_profile', 'contact_info', 'communication_history'],
  },
  COMMUNICATION: {
    title: 'Notifications & Updates',
    description: 'Send you important updates, notifications, and service announcements',
    required: true,
    icon: '📧',
    dataCategories: ['contact_info'],
  },
  PROFILE_MANAGEMENT: {
    title: 'Profile Updates',
    description: 'Update and manage your personal information',
    required: true,
    icon: '✏️',
    dataCategories: ['basic_profile', 'contact_info'],
  },
  FEEDBACK_COLLECTION: {
    title: 'Feedback & Surveys',
    description: 'Collect your feedback to improve our services',
    required: false,
    icon: '⭐',
    dataCategories: ['basic_profile', 'usage_data'],
  },
  ANALYTICS: {
    title: 'Service Analytics',
    description: 'Analyze usage patterns to improve service quality',
    required: false,
    icon: '📊',
    dataCategories: ['usage_data'],
  },
  OFFLINE_REGISTRATION: {
    title: 'Offline Center Services',
    description: 'Register and manage offline center interactions',
    required: false,
    icon: '🏢',
    dataCategories: ['basic_profile', 'contact_info', 'location'],
  },
  HRMS_INTEGRATION: {
    title: 'HR Management System',
    description: 'Sync with HR system for employee data',
    required: false,
    icon: '💼',
    dataCategories: ['employment', 'identification'],
  },
  PARENT_COMMUNICATION: {
    title: 'Parent/Guardian Contact',
    description: 'Contact your parent or guardian for important updates',
    required: false,
    icon: '👨‍👩‍👧',
    dataCategories: ['parent_guardian'],
  },
};

const ConsentManagement: React.FC = () => {
  const [consents, setConsents] = useState<Record<string, ConsentRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchConsents();
  }, []);

  const fetchConsents = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/dpdp/consent`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setConsents(data.data.consents);
      } else {
        showMessage('error', 'Failed to load consent data');
      }
    } catch (error) {
      console.error('Fetch consents error:', error);
      showMessage('error', 'Failed to load consent data');
    } finally {
      setLoading(false);
    }
  };

  const giveConsent = async (purpose: string) => {
    try {
      const purposeInfo = CONSENT_PURPOSES[purpose];
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_CONFIG.API_URL}/dpdp/consent`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purposes: [purpose],
          dataCategories: purposeInfo.dataCategories,
          sharingAllowed: false,
          marketingAllowed: false,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showMessage('success', `Consent granted for ${purposeInfo.title}`);
        fetchConsents();
      } else {
        showMessage('error', data.error || 'Failed to grant consent');
      }
    } catch (error) {
      console.error('Give consent error:', error);
      showMessage('error', 'Failed to grant consent');
    }
  };

  const withdrawConsent = async (purpose: string) => {
    try {
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_CONFIG.API_URL}/dpdp/consent/withdraw`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purpose }),
      });

      const data = await response.json();
      if (data.success) {
        showMessage('info', `Consent withdrawn. ${data.warning || ''}`);
        fetchConsents();
      } else {
        showMessage('error', data.error || 'Failed to withdraw consent');
      }
    } catch (error) {
      console.error('Withdraw consent error:', error);
      showMessage('error', 'Failed to withdraw consent');
    } finally {
      setShowWithdrawConfirm(null);
    }
  };

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const getActiveConsent = (purpose: string): ConsentRecord | undefined => {
    const purposeConsents = consents[purpose] || [];
    return purposeConsents.find(c => c.status === 'ACTIVE');
  };

  const hasActiveConsent = (purpose: string): boolean => {
    return !!getActiveConsent(purpose);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <ModuleHeader
          title="Privacy & Consent Management"
          subtitle="Manage how your personal data is processed (DPDP Act 2023 Compliance)"
        />

        {/* Success/Error Messages */}
        {message && (
          <div className={`rounded-lg p-4 ${
            message.type === 'success' ? 'bg-green-50 border border-green-200' :
            message.type === 'error' ? 'bg-red-50 border border-red-200' :
            'bg-blue-50 border border-blue-200'
          }`}>
            <div className="flex items-start">
              {message.type === 'success' && <MdCheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-2" />}
              {message.type === 'error' && <MdCancel className="w-5 h-5 text-red-600 mt-0.5 mr-2" />}
              {message.type === 'info' && <MdInfo className="w-5 h-5 text-blue-600 mt-0.5 mr-2" />}
              <p className={`text-sm ${
                message.type === 'success' ? 'text-green-800' :
                message.type === 'error' ? 'text-red-800' :
                'text-blue-800'
              }`}>{message.text}</p>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <MdInfo className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Your Data Rights (DPDP Act 2023)</p>
              <p>You have the right to control how your personal data is used. You can grant or withdraw consent at any time. Required consents are necessary for service functionality.</p>
            </div>
          </div>
        </div>

        {/* Consent Purposes */}
        <div className="space-y-4">
          {Object.entries(CONSENT_PURPOSES).map(([purposeKey, purposeInfo]) => {
            const active = hasActiveConsent(purposeKey);
            const activeConsent = getActiveConsent(purposeKey);

            return (
              <div key={purposeKey} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <span className="text-2xl mr-3">{purposeInfo.icon}</span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {purposeInfo.title}
                            {purposeInfo.required && (
                              <span className="ml-2 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">
                                Required
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">{purposeInfo.description}</p>
                        </div>
                      </div>
                      
                      <div className="mt-3 flex items-center text-xs text-gray-500">
                        <span className="font-medium mr-2">Data categories:</span>
                        {purposeInfo.dataCategories.map(cat => (
                          <span key={cat} className="bg-gray-100 px-2 py-1 rounded mr-1">
                            {cat.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>

                      {active && activeConsent && (
                        <div className="mt-3 text-xs text-gray-500">
                          <span className="font-medium">Consented on:</span>{' '}
                          {new Date(activeConsent.consentedAt).toLocaleDateString()}
                          {activeConsent.expiresAt && (
                            <>
                              {' • '}
                              <span className="font-medium">Expires:</span>{' '}
                              {new Date(activeConsent.expiresAt).toLocaleDateString()}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="ml-6 flex-shrink-0">
                      {active ? (
                        <div className="text-center">
                          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-2">
                            <MdCheckCircle className="w-10 h-10 text-green-600" />
                          </div>
                          <p className="text-xs font-medium text-green-700 mb-2">Active</p>
                          {!purposeInfo.required && (
                            <button
                              onClick={() => setShowWithdrawConfirm(purposeKey)}
                              className="text-xs text-red-600 hover:text-red-800 font-medium"
                            >
                              Withdraw
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-2">
                            <MdCancel className="w-10 h-10 text-gray-400" />
                          </div>
                          <p className="text-xs font-medium text-gray-500 mb-2">Not given</p>
                          <button
                            onClick={() => giveConsent(purposeKey)}
                            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 font-medium"
                          >
                            Grant Consent
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Withdraw Confirmation */}
                {showWithdrawConfirm === purposeKey && (
                  <div className="border-t border-gray-200 bg-red-50 p-4">
                    <div className="flex items-start">
                      <MdWarning className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-900 mb-1">Confirm Withdrawal</p>
                        <p className="text-xs text-red-700 mb-3">
                          Withdrawing this consent may affect your ability to use related services.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => withdrawConsent(purposeKey)}
                            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 font-medium"
                          >
                            Confirm Withdrawal
                          </button>
                          <button
                            onClick={() => setShowWithdrawConfirm(null)}
                            className="text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-300 font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Your Rights Under DPDP Act 2023</h4>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• Right to access all your personal data</li>
            <li>• Right to correct inaccurate information</li>
            <li>• Right to request deletion of your data</li>
            <li>• Right to withdraw consent at any time</li>
            <li>• Right to be informed about data breaches</li>
          </ul>
          <div className="mt-3 pt-3 border-t border-gray-300">
            <p className="text-xs text-gray-500">
              For more information, read our{' '}
              <a href="/privacy-policy" className="text-blue-600 hover:underline">Privacy Policy</a>
              {' '}or contact our Data Protection Officer at{' '}
              <a href="mailto:dpo@yourcompany.com" className="text-blue-600 hover:underline">dpo@yourcompany.com</a>
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ConsentManagement;
