// DESKTOP-MODIFIED: 为 Electron 预加载脚本暴露的 window.electronAPI 提供类型
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
