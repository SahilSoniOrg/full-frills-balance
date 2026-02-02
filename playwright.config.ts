import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 120 * 1000, // Global test timeout: 120s
    expect: {
        timeout: 20 * 1000,
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 1, // Retry for flakiness
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:8081',
        trace: 'on-first-retry',
        actionTimeout: 15 * 1000, // Action timeout
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
        command: 'npm run test:e2e:build && npm run serve:e2e',
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
