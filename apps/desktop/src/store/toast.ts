import { create } from 'zustand';

// Toast notifications
export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    // Fire-and-forget sound cue. Dynamic import avoids pulling Web Audio into
    // this store's module graph and keeps the circular dep off the table
    // (sfx.ts imports from the store index).
    try {
      import('@/lib/sfx')
        .then((m) => {
          if (toast.type === 'error') m.sfxError();
          else if (toast.type === 'success') m.sfxNotify();
        })
        .catch(() => {});
    } catch {}
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }],
    }));
  },
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
}));
