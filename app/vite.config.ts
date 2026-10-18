import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
// Each preview on the devenv has its own port, 8800 for main (spec section 11).
const port = Number(process.env.MINIWORLD_PORT ?? 8800);

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
    port,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port,
  },
});
