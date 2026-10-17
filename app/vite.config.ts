import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: '0.0.0.0',
    port: 8800,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 8800,
  },
});
