import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Template Marketplace Store
interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: 'layout' | 'subtitle' | 'intro' | 'full';
  config: any;
  isBuiltIn: boolean;
  isFavorite: boolean;
  createdAt: string;
}

interface TemplateMarketplaceState {
  templates: TemplateItem[];
  favorites: string[];

  addTemplate: (template: Omit<TemplateItem, 'id' | 'createdAt' | 'isBuiltIn'>) => void;
  removeTemplate: (id: string) => void;
  toggleFavorite: (id: string) => void;
  importTemplate: (template: TemplateItem) => void;
}

export const useTemplateMarketplaceStore = create<TemplateMarketplaceState>()(
  persist(
    (set) => ({
      templates: [],
      favorites: [],

      addTemplate: (template) => set((state) => ({
        templates: [...state.templates, {
          ...template,
          id: `custom-${Date.now()}`,
          createdAt: new Date().toISOString(),
          isBuiltIn: false,
        }],
      })),

      removeTemplate: (id) => set((state) => ({
        templates: state.templates.filter(t => t.id !== id),
        favorites: state.favorites.filter(f => f !== id),
      })),

      toggleFavorite: (id) => set((state) => ({
        favorites: state.favorites.includes(id)
          ? state.favorites.filter(f => f !== id)
          : [...state.favorites, id],
      })),

      importTemplate: (template) => set((state) => ({
        templates: [...state.templates, {
          ...template,
          id: `imported-${Date.now()}`,
          isBuiltIn: false,
        }],
      })),
    }),
    { name: 'forge-template-marketplace' }
  )
);

// Analytics Store
interface AnalyticsData {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagement: number;
  totalClips: number;
}

interface AnalyticsState {
  data: AnalyticsData | null;
  loading: boolean;
  lastUpdated: string | null;

  setData: (data: AnalyticsData) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  data: null,
  loading: false,
  lastUpdated: null,

  setData: (data) => set({ data, lastUpdated: new Date().toISOString() }),
  setLoading: (loading) => set({ loading }),
  clear: () => set({ data: null, lastUpdated: null }),
}));
