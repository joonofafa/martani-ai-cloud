import { create } from 'zustand';
import type { User } from '@/types';
import { authApi } from './api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);

    const user = await authApi.me();
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  setUser: (user: User) => set({ user }),

  checkAuth: async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      const user = await authApi.me();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));


interface SidebarState {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: false,
  isMobileOpen: false,

  toggleSidebar: () =>
    set((state) => {
      const next = !state.isCollapsed;
      if (typeof window !== 'undefined') {
        localStorage.setItem('sidebar_collapsed', String(next));
      }
      return { isCollapsed: next };
    }),

  setSidebarCollapsed: (collapsed: boolean) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar_collapsed', String(collapsed));
    }
    set({ isCollapsed: collapsed });
  },

  setMobileOpen: (open: boolean) => set({ isMobileOpen: open }),
}));


interface AiProcessingState {
  isProcessing: boolean;
  activeSessionId: string | null;
  activeMessageId: string | null;
  setProcessing: (sessionId: string, messageId: string) => void;
  clearProcessing: () => void;
}

export const useAiProcessingStore = create<AiProcessingState>((set) => ({
  isProcessing: false,
  activeSessionId: null,
  activeMessageId: null,

  setProcessing: (sessionId: string, messageId: string) =>
    set({ isProcessing: true, activeSessionId: sessionId, activeMessageId: messageId }),

  clearProcessing: () =>
    set({ isProcessing: false, activeSessionId: null, activeMessageId: null }),
}));
