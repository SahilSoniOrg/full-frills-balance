import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60 * 1000, // Global test timeout: 60s
    expect: {
        timeout: 10 * 1000,
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
        // Explicitly specify port 8081 for consistency
        command: 'npx expo start --web --port 8081',
        url: 'http://localhost:8081',
        // Reuse existing server in local dev, start fresh in CI
        reuseExistingServer: !process.env.CI,
        // Increased timeout for slower environments and initial bundling
        timeout: 240 * 1000,
        // Log server output for debugging
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
