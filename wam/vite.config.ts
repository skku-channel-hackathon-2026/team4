import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  plugins: [react()],
  build: {
    outDir: './dist',
  },
  server: {
    // 개발용 bridge의 server 모드(?bridge=server)가 App Function 호출을 로컬 Worker로 넘긴다.
    proxy: {
      '/functions': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
})
