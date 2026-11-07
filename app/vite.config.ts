import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/** The pack this build holds (engine.md, section 3); history is the default one. */
const PACKS: Record<string, { port: number; outDir: string; publicDir: string }> = {
  // History keeps the folders its deploy already uses.
  history: { port: 8800, outDir: '../dist', publicDir: 'public' },
  'geo-history': {
    port: 8801,
    outDir: '../dist-geo-history',
    publicDir: 'packs/geo-history/public',
  },
};

export default defineConfig(({ mode }) => {
  const packId = process.env.PACK ?? 'history';
  const pack = PACKS[packId];
  if (!pack)
    throw new Error(`Unknown pack "${packId}"; known packs: ${Object.keys(PACKS).join(', ')}`);
  // 8800 is the development checkout's server; app/.env.local or, winning over
  // it, the environment can set another, as the browser tests do (spec section
  // 11, milestone 1 section 2.5). Other packs serve on their own port.
  const port = Number(
    process.env.MINIWORLD_PORT ?? loadEnv(mode, root, '').MINIWORLD_PORT ?? pack.port,
  );
  return {
    root,
    // Relative URLs, so the build works from any folder, such as GitHub Pages'
    // /miniworld/ (spec section 11).
    base: './',
    publicDir: pack.publicDir,
    resolve: {
      // The entry imports the chosen pack, so the other packs' code is not in the bundle.
      alias: { '@pack': fileURLToPath(new URL(`./src/packs/${packId}/index.ts`, import.meta.url)) },
    },
    build: {
      outDir: pack.outDir,
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
