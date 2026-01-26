import { contextBridge, ipcRenderer } from 'electron';
// Expose protected methods to renderer
contextBridge.exposeInMainWorld('forge', {
    // App info
    getVersion: function () { return ipcRenderer.invoke('app:get-version'); },
    getLibraryPath: function () { return ipcRenderer.invoke('app:get-library-path'); },
    // File operations
    openFile: function () { return ipcRenderer.invoke('file:open'); },
    selectDirectory: function () { return ipcRenderer.invoke('file:select-directory'); },
    // Shell
    openPath: function (path) { return ipcRenderer.invoke('shell:open-path', path); },
    showItem: function (path) { return ipcRenderer.invoke('shell:show-item', path); },
    // Engine
    getEngineStatus: function () { return ipcRenderer.invoke('engine:status'); },
    startEngine: function () { return ipcRenderer.invoke('engine:start'); },
    stopEngine: function () { return ipcRenderer.invoke('engine:stop'); },
    // Platform info
    platform: process.platform,
    // API URL helper
    getApiUrl: function () { return 'http://localhost:8420'; },
    // Window controls
    toggleFullscreen: function () { return ipcRenderer.invoke('window:toggle-fullscreen'); },
    isFullscreen: function () { return ipcRenderer.invoke('window:is-fullscreen'); },
    minimize: function () { return ipcRenderer.invoke('window:minimize'); },
    maximize: function () { return ipcRenderer.invoke('window:maximize'); },
    closeWindow: function () { return ipcRenderer.invoke('window:close'); },
    // Fullscreen change listener
    onFullscreenChange: function (callback) {
        ipcRenderer.on('fullscreen-changed', function (_, isFullscreen) { return callback(isFullscreen); });
        return function () {
            ipcRenderer.removeAllListeners('fullscreen-changed');
        };
    },
});
