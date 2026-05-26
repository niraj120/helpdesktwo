/**
 * React-Query Hooks for Data Fetching with Caching
 *
 * PERFORMANCE OPTIMIZATION:
 * These hooks use @tanstack/react-query to:
 * 1. Cache API responses (staleTime: 5min, cacheTime: 10min)
 * 2. Deduplicate concurrent requests
 * 3. Background refetching for stale data
 * 4. Optimistic updates
 *
 * Usage:
 * import { useProjects, useRoles, useCurrentUser } from '@/hooks/useQueryHooks';
 *
 * const { data: projects, isLoading } = useProjects();
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { API_CONFIG } from "../config/constants";

// =============================================================================
// Query Keys - Centralized for cache invalidation
// =============================================================================
export const queryKeys = {
  projects: ["projects"] as const,
  roles: ["roles"] as const,
  currentUser: ["currentUser"] as const,
  centers: (projectId: string) => ["centers", projectId] as const,
  categories: (projectId: string) => ["categories", projectId] as const,
  ticketSettings: (projectId: string) => ["ticketSettings", projectId] as const,
  users: (filters?: Record<string, any>) => ["users", filters] as const,
  tickets: (filters?: Record<string, any>) => ["tickets", filters] as const,
};

// =============================================================================
// Helper - Get auth headers
// =============================================================================
const getAuthHeaders = () => {
  const token = localStorage.getItem("authToken");
  return { Authorization: `Bearer ${token}` };
};

// =============================================================================
// useProjects - Cached projects list
// =============================================================================
interface Project {
  _id: string;
  name: string;
  code: string;
  customUrlPath?: string;
  isActive: boolean;
  logo?: string;
  colorTheme?: {
    primary: string;
    secondary: string;
  };
}

export const useProjects = () => {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: async (): Promise<Project[]> => {
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects?limit=100`,
        {
          headers: getAuthHeaders(),
        },
      );
      return (
        response.data.data?.projects ||
        response.data.data ||
        response.data ||
        []
      );
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
};

// =============================================================================
// useRoles - Cached roles list
// =============================================================================
interface Role {
  _id: string;
  name: string;
  description?: string;
  permissions: string[];
  isDefault?: boolean;
}

export const useRoles = () => {
  return useQuery({
    queryKey: queryKeys.roles,
    queryFn: async (): Promise<Role[]> => {
      const response = await axios.get(`${API_CONFIG.API_URL}/roles`, {
        headers: getAuthHeaders(),
      });
      return response.data.data || response.data || [];
    },
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

// =============================================================================
// useCurrentUser - Cached current user data (replaces /auth/me calls)
// =============================================================================
interface CurrentUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  projects: string[];
  permissions: string[];
  centers: string[]; // ObjectId strings for assigned centers
}

export const useCurrentUser = () => {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: async (): Promise<CurrentUser | null> => {
      const token = localStorage.getItem("authToken");
      if (!token) return null;

      const response = await axios.get(`${API_CONFIG.API_URL}/auth/me`, {
        headers: getAuthHeaders(),
      });

      if (response.data.success && response.data.data) {
        const user = response.data.data;
        return {
          ...user,
          permissions: user.role?.permissions || [],
        };
      }
      return null;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - user data changes rarely
    cacheTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    retry: false, // Don't retry on 401
  });
};

// =============================================================================
// useCenters - Cached centers by project
// =============================================================================
interface Center {
  _id: string;
  name: string;
  code: string;
  city?: string;
  state?: string;
  isActive: boolean;
}

export const useCenters = (projectId: string | undefined) => {
  return useQuery({
    queryKey: queryKeys.centers(projectId || ""),
    queryFn: async (): Promise<Center[]> => {
      if (!projectId) return [];
      const response = await axios.get(
        `${API_CONFIG.API_URL}/centers?projectId=${projectId}&isActive=true`,
        { headers: getAuthHeaders() },
      );
      return response.data.data || [];
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
  });
};

// =============================================================================
// useTicketSettings - Cached ticket settings by project
// =============================================================================
interface TicketSettings {
  categories: string[];
  allowedStatuses: Array<{ name: string; code: string }>;
  allowedPriorities: string[];
  slaRules: Array<{
    priority: { name: string; code: string };
    resolutionTime: { value: number; unit: string };
  }>;
}

export const useTicketSettings = (projectId: string | undefined) => {
  return useQuery({
    queryKey: queryKeys.ticketSettings(projectId || ""),
    queryFn: async (): Promise<TicketSettings | null> => {
      if (!projectId) return null;
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/${projectId}/ticket-settings`,
        { headers: getAuthHeaders() },
      );
      if (response.data.success) {
        return response.data.data;
      }
      return null;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
  });
};

// =============================================================================
// useUsers - Cached users list with pagination
// =============================================================================
interface UsersParams {
  page?: number;
  limit?: number;
  search?: string;
  projectId?: string;
  roleId?: string;
}

export const useUsers = (params: UsersParams = {}) => {
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append("page", String(params.page));
      if (params.limit) queryParams.append("limit", String(params.limit));
      if (params.search) queryParams.append("search", params.search);
      if (params.projectId) queryParams.append("projectId", params.projectId);
      if (params.roleId) queryParams.append("roleId", params.roleId);

      const response = await axios.get(
        `${API_CONFIG.API_URL}/users?${queryParams.toString()}`,
        { headers: getAuthHeaders() },
      );
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - users may change more frequently
    cacheTime: 5 * 60 * 1000,
    keepPreviousData: true, // Better pagination UX
  });
};

// =============================================================================
// useTickets - Cached tickets list with filters
// =============================================================================
interface TicketsParams {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  projectId?: string;
  assignedTo?: string;
}

export const useTickets = (params: TicketsParams = {}) => {
  return useQuery({
    queryKey: queryKeys.tickets(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value) queryParams.append(key, String(value));
      });

      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets?${queryParams.toString()}`,
        { headers: getAuthHeaders() },
      );
      return response.data;
    },
    staleTime: 1 * 60 * 1000, // 1 minute - tickets are frequently updated
    cacheTime: 5 * 60 * 1000,
    keepPreviousData: true,
  });
};

// =============================================================================
// Cache Invalidation Helpers
// =============================================================================
export const useInvalidateProjects = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(queryKeys.projects);
};

export const useInvalidateRoles = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(queryKeys.roles);
};

export const useInvalidateUsers = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(["users"]);
};

export const useInvalidateTickets = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(["tickets"]);
};

// =============================================================================
// Prefetch Helpers - Preload data before navigation
// =============================================================================
export const usePrefetchProjects = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.projects,
      queryFn: async () => {
        const response = await axios.get(
          `${API_CONFIG.API_URL}/projects?limit=100`,
          {
            headers: getAuthHeaders(),
          },
        );
        return response.data.data?.projects || response.data.data || [];
      },
    });
  };
};

export const usePrefetchRoles = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.roles,
      queryFn: async () => {
        const response = await axios.get(`${API_CONFIG.API_URL}/roles`, {
          headers: getAuthHeaders(),
        });
        return response.data.data || [];
      },
    });
  };
};
