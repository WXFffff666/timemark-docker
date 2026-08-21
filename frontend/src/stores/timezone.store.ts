import { create } from 'zustand';
import { api } from '@/lib/api';
import { DEFAULT_TIMEZONE } from '@/lib/timezone-utils';
import { refreshTimeSync } from '@/lib/time-sync';

interface TimezoneState {
  timezone: string;
  loaded: boolean;
  timeSynced: boolean;
  calendarVerifyOk: boolean | null;
  load: () => Promise<void>;
  setTimezone: (tz: string) => Promise<void>;
  syncTime: (force?: boolean) => Promise<void>;
}

export const useTimezoneStore = create<TimezoneState>((set, get) => ({
  timezone: DEFAULT_TIMEZONE,
  loaded: false,
  timeSynced: false,
  calendarVerifyOk: null,
  load: async () => {
    try {
      const config = await api.get<{ timezone?: string }>('/config');
      const tz = config?.timezone?.trim() || DEFAULT_TIMEZONE;
      set({ timezone: tz, loaded: true });
      await get().syncTime();
    } catch {
      set({ loaded: true });
    }
  },
  setTimezone: async (tz: string) => {
    const value = tz.trim() || DEFAULT_TIMEZONE;
    set({ timezone: value });
    try {
      await api.post('/config', { timezone: value });
      await get().syncTime(true);
    } catch (error) {
      console.error('Failed to save timezone:', error);
      throw error;
    }
  },
  syncTime: async (force = false) => {
    try {
      const status = await refreshTimeSync(get().timezone, { force });
      set({
        timeSynced: true,
        calendarVerifyOk: status.calendarVerify?.ok ?? null,
      });
    } catch {
      set({ timeSynced: false });
    }
  },
}));
