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
  preview: {
    // 部署形态：构建产物由 vite preview 提供，与 dev 同占 5176
    port: 5176,
    strictPort: true,
    // 服务器上需对外可访问，故监听所有网卡（本地开发不受影响）
    host: true,
    // 通过域名访问时 vite 会校验 Host 头，显式放行部署域名
    allowedHosts: ['snowflow.cloud'],
  },
})
