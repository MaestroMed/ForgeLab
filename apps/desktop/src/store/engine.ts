import { create } from 'zustand';

// Engine status store
export interface EngineState {
  connected: boolean;
  port: number;
  services: {
    ffmpeg: boolean;
    whisper: boolean;
    nvenc: boolean;
    database: boolean;
  };
  setConnected: (connected: boolean) => void;
  setServices: (services: EngineState['services']) => void;
}

export const useEngineStore = create<EngineState>((set) => ({
  connected: false,
  port: 8420,
  services: {
    ffmpeg: false,
    whisper: false,
    nvenc: false,
    database: false,
  },
  setConnected: (connected) => set({ connected }),
  setServices: (services) => set({ services }),
}));
