import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

const storageState = fs.existsSync('auth.json') ? 'auth.json' : undefined;

export default defineConfig({
  // globalSetup ensures an authenticated `auth.json` exists before tests run when possible
  globalSetup: './tests/global-setup.ts',
  testDir: './tests',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: 'https://dev-admin.wellityhealth.com',
    // Only load storage state file if it exists to avoid failing test context creation
    ...(storageState ? { storageState } : {}),
    headless: false,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    // Allure reporter (writes results into `allure-results`)
    ['allure-playwright'],
  ],
  projects: [
    {
      name: 'Chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
