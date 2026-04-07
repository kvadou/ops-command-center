// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Playwright config for OpsHub E2E testing.
 *
 * Two tiers:
 *   - smoke: Runs post-deploy on every push to master (~5 min)
 *   - deep:  Runs nightly at 3 AM ET (~20 min)
 *
 * Auth: Logs in once via API, saves cookies for all authenticated tests.
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.STAGING_URL || 'https://story-time-staging-784b74d757f2.herokuapp.com',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // Generous timeouts for Heroku cold starts
    navigationTimeout: 30000,
    actionTimeout: 15000,
  },
  projects: [
    // Auth setup — runs first, saves cookies for smoke/deep
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.js/,
    },
    // Tier 1: Smoke tests (post-deploy, every push)
    {
      name: 'smoke',
      testDir: './tests/e2e/smoke',
      dependencies: ['auth-setup'],
      use: {
        storageState: 'tests/e2e/.auth/user.json',
      },
    },
    // Tier 2: Deep tests (nightly)
    {
      name: 'deep',
      testDir: './tests/e2e/deep',
      dependencies: ['auth-setup'],
      use: {
        storageState: 'tests/e2e/.auth/user.json',
      },
    },
    // Public pages (no auth needed) — booking forms
    {
      name: 'public',
      testMatch: /booking-form-smoke\.spec\.js/,
    },
  ],
});
