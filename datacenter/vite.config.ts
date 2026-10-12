import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // Relative base: the gateway serves this build under /data/ignite/s/<mount>/ (ADR-005 section 8).
  base: './',
  build: { outDir: 'dist' },
});
