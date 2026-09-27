import type { ApiResponse } from '@timemark/shared';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) return false;

    const data: ApiResponse<unknown> = await response.json();
    return data.success;

  } catch {
    return false;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function request<T>(url: string, options?: RequestInit, retryAfterRefresh = false): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Refresh once through the HttpOnly cookie, then retry the original request.
  const skipRefresh = url === '/auth/login' || url === '/auth/refresh';
  if (response.status === 401 && !retryAfterRefresh && !skipRefresh) {
    const pendingRefresh = refreshPromise ?? (refreshPromise = refreshSession());
    const refreshed = await pendingRefresh;
    if (refreshPromise === pendingRefresh) refreshPromise = null;

    if (refreshed) {
      return request<T>(url, options, true);
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Request failed');
  }

  return data.data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T>(url: string, body?: any) => request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(url: string, body?: any) => request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(url: string, body?: any) => request<T>(url, { method: 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) }),
};

// Channel availability types
export interface AvailableChannel {
  id: number;
  type: string;
  name: string;
  config_method: string;
  is_active: boolean;
  last_test_result: 'success' | 'failed' | null;
  last_test_at: string | null;
  connection_status: string | null;
}

export function fetchAvailableChannels() {
  return api.get<AvailableChannel[]>('/channels/available');
}