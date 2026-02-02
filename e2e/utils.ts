import { expect, Locator, Page } from '@playwright/test';

/**
 * Resets the application state by clearing all local storage and IndexedDB.
 * Essential for WatermelonDB (LokiJS/IndexedDB) persistence between tests.
 */
export async function clearAppState(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Clear storage and IndexedDB databases
    await page.evaluate(async () => {
        localStorage.clear();
        sessionStorage.clear();

        // Delete all IndexedDB databases
        if (window.indexedDB && window.indexedDB.databases) {
            const databases = await window.indexedDB.databases();
            await Promise.all(
                databases.map(db => {
                    if (db.name) {
                        return new Promise<void>((resolve, reject) => {
                            const request = window.indexedDB.deleteDatabase(db.name!);
                            request.onsuccess = () => resolve();
                            request.onerror = () => reject(request.error);
                            request.onblocked = () => {
                                console.warn(`Database ${db.name} deletion blocked`);
                                resolve(); // Continue anyway
                            };
                        });
                    }
                    return Promise.resolve();
                })
            );
        }
    });

    // Reload to ensure clean state
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait a bit for the app to reinitialize
    await page.waitForTimeout(500);
}

/**
 * Bypasses onboarding if already on an inner screen, 
 * or completes it quickly if needed.
 */
export async function ensureOnboarded(page: Page, userName: string = 'Test User') {
    await page.goto('/');

    // Check if we need to onboard. Wait for either Welcome or Dashboard content.
    const welcome = page.getByText('Welcome to Balance');
    const dashboard = page.getByText(/Hello,|Dashboard|Journal/i);

    // Explicit wait for the app to decide its state
    await Promise.race([
        welcome.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { }),
        dashboard.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { })
    ]);

    if (await welcome.isVisible()) {
        // Complete Name Step
        await page.getByPlaceholder('Enter your name').fill(userName);
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
 * Click the main FAB + button robustly using multiple selector strategies.
 */
export async function clickPlusButton(page: Page) {
    // Try multiple strategies to find the FAB button
    let fab: Locator | null = null;

    // Strategy 1: Try testID first
    fab = page.getByTestId('fab-button').first();
    if (await fab.count() > 0) {
        await fab.waitFor({ state: 'visible', timeout: 15000 });
        await fab.click();
        return;
    }

    // Strategy 2: Look for the '+' text (might be in an icon or button)
    fab = page.getByText('+', { exact: true }).first();
    if (await fab.count() > 0) {
        await fab.waitFor({ state: 'visible', timeout: 15000 });
        await fab.click({ force: true });
        return;
    }

    // Strategy 3: Look for common FAB button patterns
    fab = page.locator('button:has-text("+")').first();
    if (await fab.count() > 0) {
        await fab.waitFor({ state: 'visible', timeout: 15000 });
        await fab.click({ force: true });
        return;
    }

    // Strategy 4: Look for floating action button by role or aria-label
    fab = page.locator('[role="button"][aria-label*="add"], [role="button"][aria-label*="Add"]').first();
    if (await fab.count() > 0) {
        await fab.waitFor({ state: 'visible', timeout: 15000 });
        await fab.click({ force: true });
        return;
    }

    throw new Error('Could not find FAB button using any selector strategy');
}

/**
 * Robustly selects an account from the AccountSelector modal.
 */
export async function selectAccount(page: Page, accountName: string) {
    const selector = page.getByText(accountName, { exact: true });
    await selector.scrollIntoViewIfNeeded();
    await selector.click({ force: true });
}

/**
 * Wait for navigation to complete after an action.
 * Useful after clicking buttons that trigger route changes.
 */
export async function waitForNavigation(page: Page, timeout: number = 5000) {
    await page.waitForTimeout(timeout);
}

/**
 * Wait for an element with automatic retries and better error messages.
 */
export async function waitForElement(
    page: Page,
    selector: string,
    options: { timeout?: number; visible?: boolean } = {}
): Promise<Locator> {
    const timeout = options.timeout ?? 15000;
    const visible = options.visible ?? true;

    const locator = page.locator(selector);

    if (visible) {
        await locator.waitFor({ state: 'visible', timeout });
    } else {
        await locator.waitFor({ state: 'attached', timeout });
    }

    return locator;
}
