/// <reference types="vite/client" />

// Explicit ImportMeta augmentation so TS picks up env regardless of whether
// the triple-slash reference above resolves in all contexts.
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_CHANNEL?: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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
  };
}









