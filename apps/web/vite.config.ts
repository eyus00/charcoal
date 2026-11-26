import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// The newest Charcoal Helper, from the same repository: setup and Settings say when the installed one is older.
const helper = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../extension/package.json', import.meta.url), 'utf8')) as { version: string };
  } catch {
    return { version: '0.0.0' }; // built without the extension beside it: no update hints
  }
})();

// `base` MUST be absolute. The old './' made /movie/123 request
// /movie/assets/index.js on refresh, which the SPA rewrite answered with HTML.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', chunkSizeWarningLimit: 700 },
  define: { __HELPER_VERSION__: JSON.stringify(helper.version) },
});
