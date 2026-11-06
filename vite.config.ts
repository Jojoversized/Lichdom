import { defineConfig } from 'vite';

// Generated art/audio live in /assets and are served from the site root,
// so the game loads e.g. "sprites/units/skeleton.png".
export default defineConfig({
  base: './',
  publicDir: 'assets',
  server: { port: 5173, open: true },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
