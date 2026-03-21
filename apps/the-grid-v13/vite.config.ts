import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3063,
    proxy: {
      '/api/covert': 'http://localhost:3080',
      '/api/cornelius': 'http://localhost:3077',
      '/api/sentinel': 'http://localhost:3060',
      '/api/upif': 'http://localhost:3078',
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
