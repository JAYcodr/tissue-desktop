import {defineConfig, type PluginOption} from 'vite'
import react from '@vitejs/plugin-react'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import tailwindcss from "@tailwindcss/vite";
import fs from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// DESKTOP-MODIFIED: Vite's default 5173 is widely used and frequently
// collides with other dev servers. We pin 5273 as a less-collision-prone
// primary port and let strictPort:false fall forward (5274, 5275, ...)
// if it's also taken. The actual bound port is written to
// .dev-server-port so the Electron main process can discover the URL
// dynamically (see electron/main/index.ts).
const DEV_PORT_PRIMARY = 5273
// DESKTOP-MODIFIED: resolve path relative to vite.config.ts itself using
// import.meta.url so the file is written in the correct place regardless of
// the process cwd (e.g. when Vite is invoked from the repo root).
const DEV_PORT_FILE = resolve(fileURLToPath(import.meta.url), '..', '.dev-server-port')

function writeDevServerPort(): PluginOption {
    return {
        name: 'tissue-write-dev-server-port',
        apply: 'serve',
        configureServer(server) {
            const writePort = () => {
                const addr = server.httpServer?.address()
                if (addr && typeof addr === 'object') {
                    try {
                        fs.writeFileSync(DEV_PORT_FILE, String(addr.port))
                    } catch (error) {
                        // Don't fail Vite startup on a write error — Electron
                        // will fall back to DEV_PORT_PRIMARY.
                        console.warn(`[vite] failed to write ${DEV_PORT_FILE}:`, error)
                    }
                }
            }
            server.httpServer?.once('listening', writePort)
        },
    }
}

// https://vitejs.dev/config/
export default defineConfig(({mode}) => ({
    // DESKTOP-MODIFIED: 桌面生产环境使用相对路径，避免 file:// 协议下绝对路径资源加载失败
    base: mode === 'desktop' ? './' : '/',
    server: {
        host: '0.0.0.0',
        port: DEV_PORT_PRIMARY,
        // strictPort:false → Vite auto-increments if 5273 is taken.
        strictPort: false,
    },
    plugins: [
        tanstackRouter({target: 'react', autoCodeSplitting: false}),
        tailwindcss(),
        react(),
        writeDevServerPort(),
    ],
}))
