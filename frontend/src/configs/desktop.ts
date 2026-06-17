import {ConfigProperties} from "./index";

// DESKTOP-MODIFIED: fail fast when backendUrl is missing; do NOT silently
// fall back to a hard-coded port that is likely wrong.
const api = window.electronAPI?.backendUrl;
if (!api) {
    throw new Error("[desktop] backendUrl not available from preload");
}

const config: ConfigProperties = {
    BASE_API: api,
}

export default config
