import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('forge', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getLibraryPath: () => ipcRenderer.invoke('app:get-library-path'),

  // File operations
  openFile: () => ipcRenderer.invoke('file:open'),
  selectDirectory: () => ipcRenderer.invoke('file:select-directory'),

  // Shell
  openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),
  showItem: (path: string) => ipcRenderer.invoke('shell:show-item', path),

  // Engine
  getEngineStatus: () => ipcRenderer.invoke('engine:status'),
  startEngine: () => ipcRenderer.invoke('engine:start'),
  stopEngine: () => ipcRenderer.invoke('engine:stop'),

  // Platform info
  platform: process.platform,

  // Window controls
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Fullscreen change listener
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    ipcRenderer.on('fullscreen-changed', (_, isFullscreen) => callback(isFullscreen));
    return () => {
      ipcRenderer.removeAllListeners('fullscreen-changed');
    };
  },
});

// Types for the exposed API
declare global {
  interface Window {
    forge: {
      getVersion: () => Promise<string>;
      getLibraryPath: () => Promise<string>;
      openFile: () => Promise<string | null>;
      selectDirectory: () => Promise<string | null>;
      openPath: (path: string) => Promise<string>;
      showItem: (path: string) => void;
      getEngineStatus: () => Promise<{ running: boolean; port: number }>;
      startEngine: () => Promise<boolean>;
      stopEngine: () => Promise<boolean>;
      platform: NodeJS.Platform;
      // Window controls
      toggleFullscreen: () => Promise<boolean>;
      isFullscreen: () => Promise<boolean>;
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      closeWindow: () => Promise<void>;
      onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void;
    };
  }
}









