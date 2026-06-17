import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig(({mode}) => ({
    // DESKTOP-MODIFIED: 桌面生产环境使用相对路径，避免 file:// 协议下绝对路径资源加载失败
    base: mode === 'desktop' ? './' : '/',
    plugins: [tanstackRouter({target: 'react', autoCodeSplitting: false}), tailwindcss(), react()],
}))
