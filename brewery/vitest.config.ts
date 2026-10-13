import { defineConfig } from 'vitest/config';

// Pure unit tests (paths, timeline parsing): no DOM, and no Solid plugin.
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'] } });
