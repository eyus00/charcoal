import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base` MUST be absolute. The old './' made /movie/123 request
// /movie/assets/index.js on refresh, which the SPA rewrite answered with HTML.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', chunkSizeWarningLimit: 700 },
});
