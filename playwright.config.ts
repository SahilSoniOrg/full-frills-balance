import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.test.ts',
  testIgnore: [
    '**/specs/**',
    '**/actions/**',
    '**/screens/**',
    '**/constants/**',
    '**/utils/**',
    '**/config.js',
  ],
  timeout: 120 * 1000, // Global test timeout: 120s
  expect: {
    timeout: 20000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
    actionTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Build and serve the app.
    // On CI: Always build and serve.
    // Locally: If port 8081 is taken, reuse it. If not, build and serve.
    command: 'bun run test:e2e:build && bun run serve:e2e',
    url: 'http://localhost:8081',
    // Reuse existing server in local dev, start fresh in CI
    reuseExistingServer: !process.env.CI,
    // Increased timeout significantly to account for build time (bundling can be slow)
    timeout: 300 * 1000,
    // Log server output for debugging
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
