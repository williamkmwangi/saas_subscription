import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../utils/api';
import type { User, AuthTokens } from '@shared/types';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setTokens: (tokens: AuthTokens | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  initializeAuth: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: true,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      
      setTokens: (tokens) => set({ tokens }),

      login: async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        const { user, data: tokens } = response.data;
        
        set({ user, tokens, isAuthenticated: true });
        api.setAuthToken(tokens.accessToken);
      },

      register: async (data) => {
        const response = await api.post('/auth/register', data);
        const { user, data: tokens } = response.data;
        
        set({ user, tokens, isAuthenticated: true });
        api.setAuthToken(tokens.accessToken);
      },

      logout: async () => {
        const { tokens } = get();
        
        try {
          if (tokens?.refreshToken) {
            await api.post('/auth/logout', { refreshToken: tokens.refreshToken });
          }
        } catch {
          // Ignore logout errors
        }
        
        set({ user: null, tokens: null, isAuthenticated: false });
        api.setAuthToken(null);
      },

      refreshToken: async () => {
        const { tokens } = get();
        
        if (!tokens?.refreshToken) {
          return false;
        }

        try {
          const response = await api.post('/auth/refresh', {
            refreshToken: tokens.refreshToken,
          });
          
          const newTokens = response.data.data;
          set({ tokens: newTokens });
          api.setAuthToken(newTokens.accessToken);
          
          return true;
        } catch {
          // Refresh failed, logout user
          set({ user: null, tokens: null, isAuthenticated: false });
          api.setAuthToken(null);
          return false;
        }
      },

      initializeAuth: async () => {
        const { tokens } = get();
        
        if (!tokens?.accessToken) {
          set({ isLoading: false });
          return;
        }

        api.setAuthToken(tokens.accessToken);

        try {
          // Try to get current user
          const response = await api.get('/auth/me');
          set({ user: response.data.data, isAuthenticated: true, isLoading: false });
        } catch {
          // Try to refresh token
          const refreshed = await get().refreshToken();
          
          if (refreshed) {
            try {
              const response = await api.get('/auth/me');
              set({ user: response.data.data, isAuthenticated: true, isLoading: false });
            } catch {
              set({ isLoading: false });
            }
          } else {
            set({ isLoading: false });
          }
        }
      },

      updateUser: (data) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...data } });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ tokens: state.tokens }),
    }
  )
);
