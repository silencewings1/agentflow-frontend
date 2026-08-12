import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 固定端口：strictPort 让端口被占用时直接报错，
    // 而不是静默递增到 5177、5178，避免同时跑起多个开发服务器
    port: 5176,
    strictPort: true,
  },
})
