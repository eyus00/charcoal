import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Enable minification and optimization
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    // Enable code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
          'state': ['zustand'],
          'query': ['@tanstack/react-query'],
        },
      },
    },
    // Enable source maps for production
    sourcemap: true,
    // Reduce chunk size
    chunkSizeWarningLimit: 1000,
  },
  // Enable caching
  server: {
    hmr: {
      overlay: false,
    },
  },
});