import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // 8800 is the development checkout's server; app/.env.local or, winning over
  // it, the environment can set another, as the browser tests do (spec section
  // 11, milestone 1 section 2.5).
  const port = Number(process.env.MINIWORLD_PORT ?? loadEnv(mode, root, '').MINIWORLD_PORT ?? 8800);
  return {
    root,
    // Relative URLs, so the build works from any folder, such as GitHub Pages'
    // /miniworld/ (spec section 11).
    base: './',
    publicDir: 'public',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      target: 'es2022',
      chunkSizeWarningLimit: 800,
    },
    // The terrain workers are ES modules (milestone 1 section 11.5).
    worker: { format: 'es' },
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port,
    },
  };
});
