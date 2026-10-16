const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  timeout: 180000,
  expect: { timeout: 30000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  outputDir: '../../test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video:
      process.env.PLAYWRIGHT_RECORD_VIDEO === '1'
        ? { mode: 'on', size: { width: 1280, height: 900 } }
        : 'retain-on-failure',
    launchOptions: { slowMo: process.env.PLAYWRIGHT_RECORD_VIDEO === '1' ? 250 : 0 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: 'npx --yes serve@14 -s dist-e2e/web -l 4173',
    cwd: '../..',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
