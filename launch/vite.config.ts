import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  // Dev only: VITE_GATEWAY_URL points at the lab gateway, whose CORS list does not include the dev server.
  // The dev server proxies /data/ignite to it and main.tsx switches the client to same-origin.
  const gateway = command === 'serve' ? loadEnv(mode, process.cwd(), 'VITE_').VITE_GATEWAY_URL : '';
  return {
    plugins: [react()],
    // Relative base: the gateway serves this build under /data/ignite/s/<mount>/ (ADR-005 section 8).
    base: './',
    // Production builds never read .env files: the gateway injects window.__IGNITE_ENV__, and a local
    // dev key (launch/.env.local) must not be baked into dist/.
    envDir: command === 'serve' ? undefined : false,
    server: gateway
      ? {
          proxy: {
            '/data/ignite': {
              target: gateway,
              changeOrigin: true,
              configure: (proxy: { on: (ev: string, fn: (req: { removeHeader: (h: string) => void }) => void) => void }) => {
                proxy.on('proxyReq', (req) => req.removeHeader('origin'));
              },
            },
          },
        }
      : undefined,
    build: {
      outDir: 'dist',
      // The three.js core alone is ~0.7 MB minified and cannot shrink, so the warning limit sits just above it.
      chunkSizeWarningLimit: 900,
      rolldownOptions: {
        output: {
          // Long-lived vendor chunks: the three.js core, and the React-Three wrappers + post-processing.
          codeSplitting: {
            groups: [
              // ECharts is only imported by the lazy telemetry panel, so this chunk loads on first open.
              { name: 'echarts', test: /node_modules[\\/](echarts|zrender)[\\/]/, priority: 20 },
              { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 20 },
              {
                name: 'r3f',
                test: /node_modules[\\/](three-stdlib|postprocessing|@react-three|three-mesh-bvh|troika[^\\/]*|maath|meshline|camera-controls|react-use-measure|zustand|its-fine|suspend-react|use-sync-external-store|scheduler)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
  };
});
