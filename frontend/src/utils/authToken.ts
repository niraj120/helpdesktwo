/**
 * Centralized authentication token management
 * This utility ensures consistent token storage across the entire application
 * 
 * IMPORTANT: Always use these functions instead of directly accessing localStorage
 */

const AUTH_TOKEN_KEY = 'authToken' as const;

export const authTokenUtils = {
  /**
   * Get the authentication token from localStorage
   * @returns {string | null} The auth token or null if not found
   */
  getToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },

  /**
   * Store the authentication token in localStorage
   * @param {string} token - The token to store
   */
  setToken(token: string): void {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  },

  /**
   * Remove the authentication token from localStorage
   * Also cleans up any legacy token keys for safety
   */
  removeToken(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    // Clean up any legacy token keys that might exist
    localStorage.removeItem('token');
  },

  /**
   * Check if a valid token exists
   * @returns {boolean} True if token exists, false otherwise
   */
  hasToken(): boolean {
    const token = this.getToken();
    return token !== null && token.length > 0;
  },

  /**
   * Get the Authorization header value for API requests
   * @returns {string | null} Bearer token header or null if no token
   */
  getAuthHeader(): string | null {
    const token = this.getToken();
    return token ? `Bearer ${token}` : null;
  },

  /**
   * Clear all authentication related data from localStorage
   * Use this for complete logout cleanup
   */
  clearAllAuthData(): void {
    this.removeToken();
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userPermissions');
    localStorage.removeItem('projectContext');
  }
} as const;

// Export individual functions for convenience
export const {
  getToken,
  setToken,
  removeToken,
  hasToken,
  getAuthHeader,
  clearAllAuthData
} = authTokenUtils;

// Default export
export default authTokenUtils;