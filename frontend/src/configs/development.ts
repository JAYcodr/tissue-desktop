import {ConfigProperties} from "./index";

// DESKTOP-MODIFIED: development mode points to a locally-running backend.
// Unlike desktop mode (which reads backendUrl from Electron preload and
// already includes /api), this config assumes the backend at 127.0.0.1:8000
// mounts routes at the root. When using app.desktop_main.py (which adds
// /api prefix), update BASE_API to include "/api" suffix or use --mode desktop.
const config: ConfigProperties = {
    BASE_API: "http://127.0.0.1:8000",
}

export default config
