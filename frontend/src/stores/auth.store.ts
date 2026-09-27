import { create } from 'zustand';
import { api } from '../lib/api';
import type { User } from '@timemark/shared';

const DEVICE_ID_COOKIE = '__timemark_device_id';

let cachedFingerprint: string | null = null;

// Enhanced device fingerprint that works better with AD Guard and similar blockers
async function getEnhancedFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;

  // Try to get existing device ID from cookie first
  let deviceId = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${DEVICE_ID_COOKIE}=`))
    ?.split('=')[1];

  // Try localStorage as fallback
  if (!deviceId) {
    deviceId = localStorage.getItem('timemark_device_id') || undefined;
  }

  // Try sessionStorage as another fallback
  if (!deviceId) {
    deviceId = sessionStorage.getItem('timemark_device_id') || undefined;
  }

  // Generate new ID if none exists
  if (!deviceId) {
    deviceId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    // Try to persist with multiple fallbacks
    try {
      localStorage.setItem('timemark_device_id', deviceId);
    } catch {
      try {
        sessionStorage.setItem('timemark_device_id', deviceId);
      } catch {
        // Last resort: cookie (may be blocked by AD Guard)
        const maxAge = 365 * 24 * 3600;
        document.cookie = `${DEVICE_ID_COOKIE}=${deviceId}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
      }
    }
  }

  // Also create a more complex fingerprint from browser characteristics
  const fingerprintComponents = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    `${screen.width}x${screen.height}`,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
    navigator.hardwareConcurrency || 'unknown',
    navigator.platform,
  ].join('|');

  // Simple hash of browser characteristics
  let hash = 0;
  for (let i = 0; i < fingerprintComponents.length; i++) {
    const char = fingerprintComponents.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const browserHash = Math.abs(hash).toString(16);
  cachedFingerprint = `${browserHash}_${deviceId.slice(0, 8)}`;
  
  return cachedFingerprint;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user }),

  login: async (username, password, rememberMe = false) => {
    const fingerprint = await getEnhancedFingerprint();
    const response = await api.post<{ user: User }>('/auth/login', {
      username, 
      password, 
      deviceFingerprint: fingerprint, 
      rememberMe 
    });

    set({ user: response.user, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('cachedUser');
      sessionStorage.removeItem('cachedUser');
      sessionStorage.removeItem('lastPath');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  checkAuth: async () => {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Auth check timeout')), 5000)
    );
    try {
      const user = await Promise.race([
        api.get<User>('/auth/session'),
        timeoutPromise,
      ]);
      localStorage.setItem('cachedUser', JSON.stringify(user));
      sessionStorage.setItem('cachedUser', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      const errorMsg = error.message || '';
      const isAuthError = errorMsg.includes('401') ||
        errorMsg.includes('403') ||
        errorMsg.includes('expired') ||
        errorMsg.includes('Unauthorized') ||
        errorMsg.includes('Invalid');

      if (!isAuthError) {
        const storedUser = localStorage.getItem('cachedUser') || sessionStorage.getItem('cachedUser');
        if (storedUser) {
          try {
            set({ user: JSON.parse(storedUser), isAuthenticated: true, isLoading: false });
            return;
          } catch {}
        }
      }

      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));