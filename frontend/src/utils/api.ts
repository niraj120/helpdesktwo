/**
 * Centralized API Service
 * Handles all HTTP requests with automatic token injection, error handling, and logout on 401
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

import { API_CONFIG } from '../config/constants';

const API_BASE_URL = API_CONFIG.API_URL;

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Don't use withCredentials for now to avoid CORS issues
  // The token is in Authorization header which is sufficient
});

/**
 * Request interceptor - Automatically adds Authorization header
 */
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const token = localStorage.getItem('authToken');
    
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    console.log(`📡 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Request error:', error);
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - Handles 401 errors globally
 */
apiClient.interceptors.response.use(
  (response) => {
    // Success response
    console.log(`✅ API Response: ${response.config.url} - ${response.status}`);
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url;
    const errorData = error.response?.data as any;
    const errorMessage = errorData?.message;
    const errorCode = errorData?.code;
    
    console.error(`❌ API Error: ${url} - ${status}`);
    
    // Handle 401 Unauthorized - Token expired, invalid, or permissions changed
    if (status === 401 || errorMessage === 'Invalid token' || errorMessage === 'Token expired' || errorCode === 'TOKEN_VERSION_MISMATCH') {
      console.log('🔒 401 Unauthorized - Token expired or permissions changed, auto-logout...');
      
      // Determine message based on error code
      let alertMessage = 'Your session has expired. Please login again.';
      if (errorCode === 'TOKEN_VERSION_MISMATCH') {
        alertMessage = 'Your permissions have been updated. Please login again to continue.';
      }
      
      // Show alert to user
      alert(alertMessage);
      
      // Clear all auth data
      localStorage.removeItem('authToken');
      localStorage.removeItem('userName');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
      localStorage.removeItem('projectContext');
      
      // Get current path to determine correct login route
      const currentPath = window.location.pathname;
      
      // Determine login route based on current path
      let loginRoute = '/login';
      
      if (currentPath.includes('/agent')) {
        // Extract project custom URL if present
        const match = currentPath.match(/\/([^/]+)\/agent/);
        if (match && match[1]) {
          loginRoute = `/${match[1]}/agent/login`;
        } else {
          loginRoute = '/login';
        }
      } else if (currentPath.includes('/submit-ticket') || currentPath.includes('/student')) {
        // Student portal - redirect to submit ticket page
        const match = currentPath.match(/\/([^/]+)\//);
        if (match && match[1]) {
          loginRoute = `/${match[1]}/submit-ticket`;
        }
      }
      
      // Redirect to login
      window.location.href = loginRoute;
      
      return Promise.reject(error);
    }
    
    // Handle 403 Forbidden - Insufficient permissions
    if (status === 403) {
      console.warn('⛔ 403 Forbidden - Insufficient permissions');
      // You can show a toast/alert here if needed
    }
    
    return Promise.reject(error);
  }
);

/**
 * API Service Methods
 */
export const api = {
  // GET request
  get: <T = any>(url: string, config?: AxiosRequestConfig) => 
    apiClient.get<T>(url, config),
  
  // POST request
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => 
    apiClient.post<T>(url, data, config),
  
  // PUT request
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => 
    apiClient.put<T>(url, data, config),
  
  // PATCH request
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => 
    apiClient.patch<T>(url, data, config),
  
  // DELETE request
  delete: <T = any>(url: string, config?: AxiosRequestConfig) => 
    apiClient.delete<T>(url, config),
  
  // Raw axios instance for special cases (file uploads, etc.)
  client: apiClient,
};

/**
 * Auth-specific helper functions
 */
export const authUtils = {
  /**
   * Get current auth token
   */
  getToken: (): string | null => {
    return localStorage.getItem('authToken');
  },
  
  /**
   * Save auth token
   */
  setToken: (token: string): void => {
    localStorage.setItem('authToken', token);
  },
  
  /**
   * Remove auth token
   */
  removeToken: (): void => {
    localStorage.removeItem('authToken');
  },
  
  /**
   * Check if user is authenticated
   */
  isAuthenticated: (): boolean => {
    const token = localStorage.getItem('authToken');
    if (!token) return false;
    
    try {
      // Decode JWT to check expiration
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isExpired = payload.exp * 1000 < Date.now();
      
      if (isExpired) {
        console.log('⏰ Token expired, clearing...');
        authUtils.removeToken();
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Invalid token format:', error);
      authUtils.removeToken();
      return false;
    }
  },
  
  /**
   * Decode JWT token to get user info
   */
  decodeToken: (): any | null => {
    const token = localStorage.getItem('authToken');
    if (!token) return null;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload;
    } catch (error) {
      console.error('❌ Failed to decode token:', error);
      return null;
    }
  },
  
  /**
   * Logout user - clear token and redirect
   */
  logout: async (customUrlPath?: string): Promise<void> => {
    try {
      // Call backend logout API to log the activity
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      // Clear all auth data
      authUtils.removeToken();
      localStorage.removeItem('userName');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
      localStorage.removeItem('projectContext');
      
      // Redirect to login
      const loginRoute = customUrlPath ? `/${customUrlPath}/agent/login` : '/login';
      window.location.href = loginRoute;
    }
  },

  /**
   * Setup automatic logout when token expires
   * Call this after successful login
   */
  setupAutoLogout: (customUrlPath?: string): (() => void) => {
    const token = localStorage.getItem('authToken');
    if (!token) return () => {};

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expirationTime = payload.exp * 1000;
      const currentTime = Date.now();
      const timeUntilExpiry = expirationTime - currentTime;

      if (timeUntilExpiry <= 0) {
        // Token already expired
        console.log('⏰ Token already expired');
        authUtils.logout(customUrlPath);
        return () => {};
      }

      console.log(`⏰ Token will expire in ${Math.round(timeUntilExpiry / 1000 / 60)} minutes`);

      // Set timer for auto-logout
      const logoutTimer = setTimeout(() => {
        console.log('⏰ Token expired - Auto logout');
        alert('Your session has expired. Please login again.');
        authUtils.logout(customUrlPath);
      }, timeUntilExpiry);

      // Return cleanup function
      return () => {
        clearTimeout(logoutTimer);
      };
    } catch (error) {
      console.error('❌ Error setting up auto-logout:', error);
      return () => {};
    }
  },
};

export default api;
