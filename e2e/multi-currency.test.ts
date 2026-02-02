import { expect, test } from '@playwright/test';
import { clearAppState, clickPlusButton, ensureOnboarded } from './utils';

test.describe('User Journey: Multi-Currency', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Travel User');
    });

    test('should allow creating and using a non-default currency account', async ({ page }) => {
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./).fill('Euro Wallet');

        await page.getByText('USD', { exact: true }).click();
        await page.getByText(/EUR|Euro/i).click();

        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await clickPlusButton(page);
        await page.getByTestId('amount-input').first().waitFor({ state: 'visible', timeout: 15000 });
        await page.getByTestId('amount-input').first().fill('15');
        await page.getByText('Euro Wallet', { exact: true }).click();
        await page.getByTestId('save-button').click();

        // Verify currency symbol or formatting
        await expect(page.getByText(/€|EUR/)).toBeVisible();
    });
});
