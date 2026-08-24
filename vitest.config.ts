import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // `automatic` so component tests need no React import, matching the app's
  // own transform — without it a .tsx test fails with "React is not defined".
  esbuild: { jsx: 'automatic' },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
