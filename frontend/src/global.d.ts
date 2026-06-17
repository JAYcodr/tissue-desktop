// DESKTOP-MODIFIED: local duplicate of IElectronAPI defined in electron/electron.d.ts.
// Keep this in sync with the electron package; do NOT import from electron/
// here because the two files live under different tsconfig.include scopes.
interface IElectronAPI {
    backendUrl?: string;
    getBackendUrl(): Promise<string>;
    getUserDataPath(): Promise<string>;
    openDirectory(): Promise<string | undefined>;
}

declare global {
    interface Window {
        electronAPI?: IElectronAPI;
    }
}

export {};
