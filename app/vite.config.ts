import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // 8800 is the staging server; a preview sets its own port in app/.env.local
  // and test runs in the environment, which wins (spec section 11, milestone 1
  // section 2.5).
  const port = Number(process.env.MINIWORLD_PORT ?? loadEnv(mode, root, '').MINIWORLD_PORT ?? 8800);
  return {
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
  };
});
