import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend lives in web/, builds to ./dist which the Worker serves as static assets.
// In dev, /api is proxied to `wrangler dev` on :8787.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: true,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  test: {
    root: '.',
    include: ['worker/**/*.test.ts', 'shared/**/*.test.ts', 'web/src/**/*.test.ts'],
  },
} as any);
