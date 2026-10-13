import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ mode }) => {
  // Dev only: the gateway does not send CORS headers for the dev origin, so `npm run dev` talks to it
  // through a same-origin proxy. Set DEV_PROXY_TARGET (and leave VITE_GATEWAY_URL empty) in .env.development.local.
  const target = loadEnv(mode, process.cwd(), 'DEV_').DEV_PROXY_TARGET;
  return {
    plugins: [svelte()],
    // Relative base: the gateway serves this build under /data/ignite/s/<mount>/ (ADR-005 section 8).
    base: './',
    build: { outDir: 'dist' },
    server: target ? { proxy: { '/data/ignite': { target, changeOrigin: true } } } : {},
  };
});
