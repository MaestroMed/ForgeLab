declare global {
    interface Window {
        forge: {
            getVersion: () => Promise<string>;
            getLibraryPath: () => Promise<string>;
            openFile: () => Promise<string | null>;
            selectDirectory: () => Promise<string | null>;
            openPath: (path: string) => Promise<string>;
            showItem: (path: string) => void;
            getEngineStatus: () => Promise<{
                running: boolean;
                port: number;
            }>;
            startEngine: () => Promise<boolean>;
            stopEngine: () => Promise<boolean>;
            platform: NodeJS.Platform;
            getApiUrl: () => string;
            toggleFullscreen: () => Promise<boolean>;
            isFullscreen: () => Promise<boolean>;
            minimize: () => Promise<void>;
            maximize: () => Promise<void>;
            closeWindow: () => Promise<void>;
            onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void;
        };
    }
}
export {};
