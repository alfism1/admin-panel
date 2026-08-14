import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Deliberately not `vite.config.ts`: the Tailwind plugin costs seconds per run
// and produces CSS no assertion ever reads.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    // `lucide-react` is a barrel over ~1500 single-icon modules. Left to Vite's
    // per-module transform a single import of it stalls collection for minutes;
    // esbuild pre-bundles the same graph in about a second.
    deps: {
      optimizer: {
        web: {
          enabled: true,
          include: ['lucide-react', 'react-day-picker', 'date-fns'],
        },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/**/types.ts'],
      // The suite covers every branch today. Anything a test cannot reach is
      // marked `/* v8 ignore next */` at the source with the reason, so a drop
      // here means new code arrived without a test rather than a bad threshold.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
