import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base: the gateway serves this build under /data/ignite/s/<mount>/ (ADR-005 section 8).
  base: './',
  build: { outDir: 'dist' },
});
