/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

/* ─────────────────────────────────────────────
   Infinity OS — Vitest Configuration
   Unit, integration, E2E, and chaos testing
   with coverage thresholds and path aliases.
   ───────────────────────────────────────────── */

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.spec.ts',
      'packages/*/src/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      '.turbo',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'packages/*/src/**/*.ts',
        'workers/*/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 30000,
    hookTimeout: 15000,
    teardownTimeout: 5000,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,
        minForks: 1,
      },
    },
    reporters: ['verbose', 'json'],
    outputFile: {
      json: './test-results/results.json',
    },
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
    },
    sequence: {
      shuffle: true,
    },
  },
  resolve: {
    alias: {
      '@infinity-os/types': path.resolve(__dirname, 'packages/types/src'),
      '@infinity-os/kernel': path.resolve(__dirname, 'packages/kernel/src'),
      '@infinity-os/self-healing': path.resolve(__dirname, 'packages/self-healing/src'),
      '@infinity-os/cli': path.resolve(__dirname, 'packages/cli/src'),
      '@infinity-os/integrations': path.resolve(__dirname, 'packages/integrations/src'),
      '@infinity-os/sandbox': path.resolve(__dirname, 'packages/sandbox/src'),
      '@infinity-os/git-hub': path.resolve(__dirname, 'packages/git-hub/src'),
    },
  },
});