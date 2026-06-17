import {ConfigProperties} from "./index";

declare global {
    interface Window {
        electronAPI?: {
            backendUrl?: string;
        };
    }
}

const config: ConfigProperties = {
    BASE_API: window.electronAPI?.backendUrl || "http://127.0.0.1:8000/api",
}

export default config
