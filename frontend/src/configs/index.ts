import development from "./development.ts";
import docker from "./docker.ts";
import desktop from "./desktop.ts"; // DESKTOP-MODIFIED: 新增桌面模式配置


export interface ConfigProperties {
    BASE_API: string
}

const mode = import.meta.env.MODE

const configs: { [key: string]: ConfigProperties } = {
    development,
    docker,
    desktop, // DESKTOP-MODIFIED: 注册桌面模式
}

// DESKTOP-MODIFIED: fail fast when build mode is unknown; prevents a silent
// undefined from propagating into every API call.
const config = configs[mode];
if (!config) {
    throw new Error(`[config] unknown build mode: ${mode}`);
}

export default config
