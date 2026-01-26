import { Page, expect } from '@playwright/test';

/**
 * Resets the application state by clearing all local storage and IndexedDB.
 * Essential for WatermelonDB (LokiJS/IndexedDB) persistence between tests.
 */
export async function clearAppState(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    // For WatermelonDB/IndexedDB, we rely on the app's own reset or automated clearing if possible.
    // But since we can't easily trigger it from outside, we'll just reload.
    await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * Bypasses onboarding if already on an inner screen, 
 * or completes it quickly if needed.
 */
export async function ensureOnboarded(page: Page, userName: string = 'Test User') {
    await page.goto('/');
    // Check if we need to onboard. The "Welcome" text is a good indicator.
    const isWelcomeVisible = await page.getByText('Welcome to Balance').isVisible({ timeout: 30000 }).catch(() => false);

    if (isWelcomeVisible) {
        // Complete Name Step
        await page.getByPlaceholder('Enter your name').fill(userName);
        // Buttons in React Native Web often lack role="button" or are tricky.
        // We use text-based selection which is more resilient to RN-Web's DOM structure.
        await page.getByText('Continue', { exact: true }).click({ force: true });

        // Complete Currency Step
        await expect(page.getByText('Default Currency', { exact: true })).toBeVisible({ timeout: 10000 });
        await page.getByText('USD').first().click();
        await page.getByText('Get Started').click({ force: true });

        // Final verify: Should be on Account Creation or Dashboard
        await expect(page.getByText(/New Account|Account Name|Dashboard|Journal/i).first()).toBeVisible({ timeout: 15000 });
    }
}

/**
 * Click the main FAB + button robustly.
 */
export async function clickPlusButton(page: Page) {
    // Try testID first
    const fab = page.locator('[data-testid="fab-button"], [testID="fab-button"]').first();
    // 15s is better for slow CI/Dev environments with navigation transitions
    await fab.waitFor({ state: 'visible', timeout: 15000 });
    await fab.click({ force: true });
}

/**
 * Robustly selects an account from the AccountSelector modal.
 */
export async function selectAccount(page: Page, accountName: string) {
    const selector = page.getByText(accountName, { exact: true });
    await selector.scrollIntoViewIfNeeded();
    await selector.click({ force: true });
}
