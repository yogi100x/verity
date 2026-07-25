import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    // @ts-expect-error — @vitejs/plugin-react types resolve against vite 7 while
    // vitest bundles vite 8 (rollup vs rolldown PluginContext). Runtime is fine;
    // this is the documented typings-lag exception in docs/stack-freeze.md.
    react(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
  },
});
