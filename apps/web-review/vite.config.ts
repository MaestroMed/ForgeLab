import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/v1': 'http://localhost:8420',
      '/clips': 'http://localhost:8420',
      '/health': 'http://localhost:8420',
    },
  },
});
