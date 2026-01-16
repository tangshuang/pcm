import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';

const envs = dotenv.config({ path: '../.env' });

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': `http://localhost:${envs.parsed.PORT}`,
      '/ws': {
        target: `ws://localhost:${envs.parsed.PORT}`,
        ws: true
      }
    }
  }
});
