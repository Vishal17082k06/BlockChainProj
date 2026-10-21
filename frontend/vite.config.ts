import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The API (python/run_ui.py) listens on 127.0.0.1:8000. In development the browser talks to Vite on
// 5173 and Vite forwards /api to the API, so the app never needs to know the API's address.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: { outDir: 'dist' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
})
