export interface IElectronAPI {
  backendUrl?: string;
  getBackendUrl(): Promise<string>;
  getUserDataPath(): Promise<string>;
  openDirectory(): Promise<string | undefined>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

export {};
