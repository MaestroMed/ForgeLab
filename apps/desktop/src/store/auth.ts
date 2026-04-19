import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  username?: string;
  plan: 'free' | 'pro' | 'enterprise';
  exports_this_month: number;
  can_export: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  saasMode: boolean;
  setAuth: (token: string, user: User) => void;
  setSaasMode: (enabled: boolean) => void;
  logout: () => void;
  refreshUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      saasMode: false,
      setAuth: (token, user) => set({ token, user }),
      setSaasMode: (saasMode) => set({ saasMode }),
      logout: () => set({ token: null, user: null }),
      refreshUser: (user) => set({ user }),
    }),
    { name: 'forge-auth' }
  )
);
