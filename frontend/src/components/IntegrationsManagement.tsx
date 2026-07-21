import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../constants/permissions';
import DashboardLayout from './DashboardLayout';
import ModuleHeader from './ModuleHeader';
import {
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  ArrowRightIcon,
  CircleStackIcon
} from '@heroicons/react/24/outline';

interface IntegrationCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  permission: string;
  status: 'available' | 'coming-soon';
  badge?: string;
}

const IntegrationsManagement: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const integrations: IntegrationCard[] = [
    {
      id: 'email-to-ticket',
      title: 'Email-to-Ticket',
      description: 'Configure email accounts to automatically convert incoming emails into support tickets.',
      icon: <EnvelopeIcon className="w-8 h-8" />,
      path: '/integrations/email-to-ticket',
      permission: PERMISSIONS.EMAIL_CONFIG_VIEW,
      status: 'available',
      badge: 'Active'
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp Integration',
      description: 'Connect WhatsApp Business API to handle support requests via WhatsApp.',
      icon: <ChatBubbleLeftRightIcon className="w-8 h-8" />,
      path: '/integrations/whatsapp',
      permission: 'INTEGRATION_WHATSAPP_VIEW',
      status: 'coming-soon',
      badge: 'Coming Soon'
    },
    {
      id: 'sms',
      title: 'SMS Gateway',
      description: 'Configure SMS gateway for sending notifications and updates to students.',
      icon: <PhoneIcon className="w-8 h-8" />,
      path: '/integrations/sms',
      permission: 'INTEGRATION_SMS_VIEW',
      status: 'coming-soon',
      badge: 'Coming Soon'
    },
    {
      id: 'tata-voice',
      title: 'TATA Voice (Click-to-Call)',
      description: 'Configure SmartFlo credentials to call customers back directly from the IVR inbox.',
      icon: <PhoneIcon className="w-8 h-8" />,
      path: '/integrations/tata-voice',
      permission: 'PROJECT_MANAGE_SETTINGS',
      status: 'available',
      badge: 'Active'
    }
  ];

  const handleNavigate = (integration: IntegrationCard) => {
    if (integration.status === 'available' && hasPermission(integration.permission)) {
      navigate(integration.path);
    }
  };

  return (
    <DashboardLayout>
      <ModuleHeader
        title="Integrations"
        subtitle="Connect external services and automate workflows with various integration options"
      />

      <div className="p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => {
            const hasAccess = hasPermission(integration.permission);
            const isAvailable = integration.status === 'available';
            const isClickable = isAvailable && hasAccess;

            return (
              <div
                key={integration.id}
                onClick={() => isClickable && handleNavigate(integration)}
                className={`bg-white border border-gray-200 rounded-lg shadow-sm transition-all ${
                  isClickable
                    ? 'hover:shadow-md hover:border-blue-300 cursor-pointer'
                    : 'opacity-60 cursor-not-allowed'
                }`}
              >
                {/* Card Header */}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`p-3 rounded-lg ${
                        isAvailable ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'
                      }`}
                    >
                      {integration.icon}
                    </div>
                    {integration.badge && (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          integration.status === 'available'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {integration.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {integration.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {integration.description}
                  </p>

                  {/* Action */}
                  {isClickable ? (
                    <div className="flex items-center text-blue-600 text-sm font-medium group">
                      <span>Configure</span>
                      <ArrowRightIcon className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </div>
                  ) : integration.status === 'coming-soon' ? (
                    <div className="text-sm text-gray-500">
                      Available in future release
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      No access
                    </div>
                  )}
                </div>

                {/* Permission Info */}
                {!hasAccess && isAvailable && (
                  <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-100">
                    <p className="text-xs text-yellow-800">
                      You don't have permission to access this integration.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">
            About Integrations
          </h4>
          <p className="text-sm text-blue-800">
            Integrations allow you to connect external services and automate various workflows. 
            Each integration can be configured separately per project and can be enabled or disabled as needed.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default IntegrationsManagement;
