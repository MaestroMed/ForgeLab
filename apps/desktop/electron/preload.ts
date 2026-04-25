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

  // Engine supervisor info (opt-in path)
  getEngineInfo: () => ipcRenderer.invoke('engine:getInfo'),

  // Secure credential vault (keytar-backed — OS keychain)
  vault: {
    set: (namespace: string, account: string, value: string) =>
      ipcRenderer.invoke('vault:set', { namespace, account, value }),
    get: (namespace: string, account: string) =>
      ipcRenderer.invoke('vault:get', { namespace, account }),
    delete: (namespace: string, account: string) =>
      ipcRenderer.invoke('vault:delete', { namespace, account }),
    list: (namespace: string) =>
      ipcRenderer.invoke('vault:list', { namespace }),
    available: () => ipcRenderer.invoke('vault:available'),
  },

  // Platform info
  platform: process.platform,

  // Window controls
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Spec-named window controls (used by the custom TitleBar)
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  getWindowState: () => ipcRenderer.invoke('window:getState'),

  // Fullscreen change listener
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    ipcRenderer.on('fullscreen-changed', (_, isFullscreen) => callback(isFullscreen));
    return () => {
      ipcRenderer.removeAllListeners('fullscreen-changed');
    };
  },

  // Maximize state change listener
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('maximize-changed', (_, isMaximized) => callback(isMaximized));
    return () => {
      ipcRenderer.removeAllListeners('maximize-changed');
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
      getEngineInfo: () => Promise<{
        pid: number;
        port: number;
        version: string;
        started_at: string;
        status: 'starting' | 'healthy' | 'unhealthy' | 'stopped';
      } | null>;
      vault: {
        set: (namespace: string, account: string, value: string) => Promise<void>;
        get: (namespace: string, account: string) => Promise<string | null>;
        delete: (namespace: string, account: string) => Promise<boolean>;
        list: (namespace: string) => Promise<Array<{ account: string }>>;
        available: () => Promise<boolean>;
      };
      platform: NodeJS.Platform;
      // Window controls
      toggleFullscreen: () => Promise<boolean>;
      isFullscreen: () => Promise<boolean>;
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      closeWindow: () => Promise<void>;
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      getWindowState: () => Promise<boolean>;
      onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void;
      onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
    };
  }
}









