import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../config/api';

/**
 * Custom hook to dynamically update the browser tab title based on project branding
 */
export const useDynamicTitle = () => {
  const location = useLocation();

  useEffect(() => {
    const updateTitle = async () => {
      try {
        // Extract customUrlPath from location (e.g., /mhcet/portal/dashboard)
        const pathParts = location.pathname.split('/').filter(Boolean);
        const customUrlPath = pathParts[0];

        // List of internal admin routes that should NOT trigger branding fetch
        const internalRoutes = [
          'login',
          'dashboard',
          'reports',
          'tickets',
          'projects',
          'users',
          'roles',
          'permissions',
          'master-data',
          'offline-module',
          'settings',
          'profile',
          'categories',
          'priorities',
          'statuses',
          'sla-policies',
          'approval-workflows',
          'feedback-surveys',
          'register',
          'forgot-password',
          'reset-password'
        ];

        // Check if it's a project-specific route (NOT an internal admin route)
        if (customUrlPath && !internalRoutes.includes(customUrlPath)) {
          try {
            const response = await axios.get(`${API_BASE_URL}/projects/branding/${customUrlPath}`);
            if (response.data.success) {
              // Priority: browserTitle > headerText (Portal Name) > projectName
              const browserTitle = response.data.data.branding?.browserTitle || 
                                   response.data.data.branding?.headerText || 
                                   response.data.data.projectName || 
                                   'Helpdesk Portal';
              document.title = `${browserTitle}`;
              return;
            }
          } catch (error) {
            // Silently fail, use default title
          }
        }

        // Check if projectContext exists in localStorage (for agent/super admin)
        const projectContext = localStorage.getItem('projectContext');
        if (projectContext) {
          try {
            const { projectName } = JSON.parse(projectContext);
            if (projectName) {
              document.title = `${projectName}`;
              return;
            }
          } catch (error) {
            // Invalid JSON, ignore
          }
        }

        // Default title for main system
        document.title = 'SAC Helpdesk Portal';
      } catch (error) {
        console.error('Error updating page title:', error);
        document.title = 'SAC Helpdesk Portal';
      }
    };

    updateTitle();
  }, [location.pathname]);
};
