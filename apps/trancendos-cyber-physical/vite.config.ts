import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3062,
    proxy: {
      '/api/ber': 'http://localhost:3061',
      '/api/depin': 'http://localhost:3081',
      '/api/sentinel': 'http://localhost:3060',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
