import { defineConfig } from 'vite';

// Plain multi-module game served from the repo root. Static files that are
// fetched by URL at runtime (music, generated sprite atlases) live in public/.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: { port: 8080, strictPort: true },
  preview: { port: 8080, strictPort: true },
  build: {
    target: 'es2022', // top-level await in js/main.js
    outDir: 'dist',
    emptyOutDir: true,
  },
});
