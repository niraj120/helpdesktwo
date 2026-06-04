/**
 * Centralized authentication token management
 * This utility ensures consistent token storage across the entire application
 * 
 * IMPORTANT: Always use these functions instead of directly accessing localStorage
 */

const AUTH_TOKEN_KEY = 'authToken' as const;

/** Role code assigned to student accounts. */
const STUDENT_ROLE_CODE = 'STUDENT' as const;

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
   * Get the current user's role code from localStorage, if stored.
   * @returns {string | null} The role code (e.g. "STUDENT", "COUNSELOR") or null
   */
  getUserRole(): string | null {
    return localStorage.getItem('userRole');
  },

  /**
   * Whether the current session belongs to a student.
   *
   * The student-facing pages (submit-ticket, my-tickets, dashboard) share the
   * same `authToken` localStorage key with the admin/project portal logins, and
   * localStorage is shared across all tabs of the same origin. Without this
   * check, a counselor/admin already logged into the project portal would be
   * treated as a logged-in student when they open a student page in another tab.
   *
   * A session counts as a student session only when a token exists AND the
   * stored role is STUDENT (or no role is stored, which only happens for student
   * logins — the project/admin logins always store a non-student role code).
   *
   * @returns {boolean} True only for an authenticated student session
   */
  isStudentSession(): boolean {
    // Note: referenced via localStorage directly (not `this.*`) so this still
    // works when imported/called as a standalone destructured function.
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return false;
    const role = localStorage.getItem('userRole');
    return !role || role === STUDENT_ROLE_CODE;
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
  getUserRole,
  isStudentSession,
  clearAllAuthData
} = authTokenUtils;

// Default export
export default authTokenUtils;