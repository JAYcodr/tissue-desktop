export function isDesktop(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.openDirectory;
}

export async function selectDirectory(): Promise<string | undefined> {
    if (!isDesktop()) {
        return undefined;
    }
    return window.electronAPI!.openDirectory();
}
