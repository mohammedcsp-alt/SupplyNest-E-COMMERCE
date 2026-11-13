import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/load/**/*.test.ts'],
    setupFiles: ['tests/setup/env.ts'],
    globalSetup: ['tests/setup/global-setup.ts'],
    // Integration tests share one database: run files sequentially for deterministic state.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 180000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
