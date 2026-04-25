import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// UI state store
export type AppMode = 'creator' | 'operator';

interface UIState {
  sidebarCollapsed: boolean;
  currentPanel: 'ingest' | 'analyze' | 'forge' | 'export';
  jobDrawerOpen: boolean;
  shortcutsModalOpen: boolean;
  isFullscreen: boolean;
  /**
   * UI mode:
   *  - 'creator' = animations, ceremony, SFX, ambient effects (default)
   *  - 'operator' = dense, keyboard-first, zero-ceremony for power users
   */
  mode: AppMode;
  toggleSidebar: () => void;
  setCurrentPanel: (panel: UIState['currentPanel']) => void;
  setJobDrawerOpen: (open: boolean) => void;
  setShortcutsModalOpen: (open: boolean) => void;
  setFullscreen: (fullscreen: boolean) => void;
  toggleFullscreen: () => Promise<void>;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      currentPanel: 'ingest',
      jobDrawerOpen: false,
      shortcutsModalOpen: false,
      isFullscreen: false,
      mode: 'creator',
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCurrentPanel: (panel) => set({ currentPanel: panel }),
      setJobDrawerOpen: (open) => set({ jobDrawerOpen: open }),
      setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
      setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
      toggleFullscreen: async () => {
        const result = await (window.forge as any)?.toggleFullscreen();
        set({ isFullscreen: result });
      },
      setMode: (mode) => set({ mode }),
      toggleMode: () =>
        set((state) => ({ mode: state.mode === 'operator' ? 'creator' : 'operator' })),
    }),
    {
      name: 'forge-ui',
      // Only persist the user's mode preference — sidebar/fullscreen/etc.
      // are session-scoped.
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);

// Batch selection store for segments
interface BatchSelectionState {
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setSelectionMode: (active: boolean) => void;
}

export const useBatchSelectionStore = create<BatchSelectionState>((set) => ({
  selectedIds: new Set(),
  isSelectionMode: false,
  toggleSelection: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedIds: newSet };
    }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set(), isSelectionMode: false }),
  setSelectionMode: (active) =>
    set({ isSelectionMode: active, selectedIds: active ? new Set() : new Set() }),
}));

// Floating Widget store
interface FloatingWidgetState {
  visible: boolean;
  collapsed: boolean;
  position: { x: number; y: number };
  setVisible: (visible: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  setPosition: (position: { x: number; y: number }) => void;
  toggleCollapsed: () => void;
}

export const useFloatingWidgetStore = create<FloatingWidgetState>()(
  persist(
    (set) => ({
      visible: true,
      collapsed: false,
      position: { x: 20, y: 100 },
      setVisible: (visible) => set({ visible }),
      setCollapsed: (collapsed) => set({ collapsed }),
      setPosition: (position) => set({ position }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    { name: 'forge-floating-widget' }
  )
);

// Onboarding Store
interface OnboardingState {
  completed: boolean;
  currentStep: number;
  completedSteps: string[];

  setCompleted: (completed: boolean) => void;
  setCurrentStep: (step: number) => void;
  completeStep: (stepId: string) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      currentStep: 0,
      completedSteps: [],

      setCompleted: (completed) => set({ completed }),
      setCurrentStep: (currentStep) => set({ currentStep }),
      completeStep: (stepId) => set((state) => ({
        completedSteps: [...new Set([...state.completedSteps, stepId])],
      })),
      reset: () => set({ completed: false, currentStep: 0, completedSteps: [] }),
    }),
    { name: 'forge-onboarding' }
  )
);
