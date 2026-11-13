import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '.env.test') });

/**
 * E2E configuration. The test server runs on port 3210 against the isolated TEST database
 * (.env.test) using a separate build directory (.next-test), so it never touches the development
 * server on port 3200 or the development database.
 */
const PORT = 3210;
const CUSTOMER_STATE = 'tests/e2e/.auth/customer.json';
const MANAGER_STATE = 'tests/e2e/.auth/manager.json';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx dotenv -e .env.test -- next dev -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { NEXT_DIST_DIR: '.next-test' },
  },
  projects: [
    { name: 'setup', testMatch: /auth.*\.setup\.ts/ },
    { name: 'api', testMatch: /api-.*\.spec\.ts/, dependencies: ['setup'] },
    {
      name: 'desktop-arabic-rtl',
      testMatch: /ui-.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, locale: 'ar-IQ', storageState: CUSTOMER_STATE },
    },
    {
      name: 'mobile-english-ltr',
      testMatch: /ui-.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Pixel 5'], locale: 'en-US', storageState: CUSTOMER_STATE },
    },
  ],
});
