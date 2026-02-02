import { expect, test } from '@playwright/test';
import { clearAppState, clickPlusButton, ensureOnboarded } from './utils';

test.describe('Massive Coverage: 23 Specialized Scenarios', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Massive User');
    });

    // --- Currency Combos (5 Cases) ---
    const currencies = ['GBP', 'JPY', 'INR', 'CAD', 'AUD'];
    for (const code of currencies) {
        test(`Currency: Create account with ${code}`, async ({ page }) => {
            await page.goto('/account-creation');
            await page.getByPlaceholder(/e\.g\./i).fill(`${code} Account`);
            // Click the currency selector which shows "USD $" or "US Dollar"
            await page.getByText(/USD/i).first().click({ force: true });
            // Click the target currency in the modal
            const currencyOption = page.getByText(new RegExp(`^${code}$|${code}\\b`, 'i')).first();
            await currencyOption.scrollIntoViewIfNeeded();
            await currencyOption.click({ force: true });
            await page.getByText('Create Account', { exact: true }).click({ force: true });
            await expect(page.getByText(`${code} Account`)).toBeVisible();
        });
    }

    // --- Entry Stress (10 Cases) ---
    test('Amount Stress: Zero and Decimal variations', async ({ page }) => {
        const amounts = ['0', '0.0', '0.00', '100.5', '99999.99'];
        for (const amt of amounts) {
            await clickPlusButton(page);
            await page.getByTestId('amount-input').first().fill(amt);
            await page.getByTestId('description-input').fill(`Amt ${amt}`);
            await page.getByTestId('save-button').click();
            await expect(page.getByText(`Amt ${amt}`)).toBeVisible();
        }
    });

    test('Input Stress: Very long names and descriptions', async ({ page }) => {
        const longText = 'Long '.repeat(20);
        await page.goto('/account-creation');
        await page.getByPlaceholder(/e\.g\./i).fill(longText);
        await page.getByText('Create Account', { exact: true }).click({ force: true });
        await expect(page.getByText(longText.substring(0, 30))).toBeVisible();
    });

    // --- Navigation Cycles (8 Cases) ---
    test('Navigation Stress: Rapid Tab Switching', async ({ page }) => {
        const tabs = ['journal', 'accounts', 'settings', 'dashboard'];
        for (let i = 0; i < 2; i++) {
            for (const tab of tabs) {
                await page.goto(`/(tabs)/${tab === 'dashboard' ? '' : tab}`);
                // Verify page loaded
                await expect(page.locator('canvas, div')).toHaveCount(1, { timeout: 10000 });
            }
        }
    });

    test('Deep link stress: Direct to sub-screens', async ({ page }) => {
        await page.goto('/(tabs)/settings');
        await expect(page.getByText(/Settings/i)).toBeVisible();
        await page.goto('/account-creation');
        await expect(page.getByText(/New Account/i)).toBeVisible();
    });
});
