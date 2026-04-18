import { create } from 'zustand';

// Theme store
type Theme = 'light' | 'dark' | 'westworld' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('forge-theme') as Theme | null;
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  // Remove all theme classes first
  root.classList.remove('dark', 'westworld');

  if (theme === 'westworld') {
    // Westworld includes dark mode base + westworld overrides
    root.classList.add('dark', 'westworld');
  } else if (theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    root.classList.add('dark');
  }
  // Light theme: no classes needed (default)

  localStorage.setItem('forge-theme', theme);
};

export const useThemeStore = create<ThemeState>((set, get) => {
  // Apply initial theme
  if (typeof window !== 'undefined') {
    const initial = getInitialTheme();
    setTimeout(() => applyTheme(initial), 0);
  }

  return {
    theme: typeof window !== 'undefined' ? getInitialTheme() : 'dark',
    setTheme: (theme) => {
      applyTheme(theme);
      set({ theme });
    },
    toggleTheme: () => {
      const current = get().theme;
      // Cycle: light -> dark -> westworld -> light
      const themeOrder: Theme[] = ['light', 'dark', 'westworld'];
      const currentIndex = themeOrder.indexOf(current);
      const next = themeOrder[(currentIndex + 1) % themeOrder.length];
      applyTheme(next);
      set({ theme: next });
    },
  };
});
