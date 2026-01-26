import { expect, test } from '@playwright/test';
import { clearAppState, ensureOnboarded } from './utils';

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

        await page.getByText('+', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('15');
        await page.getByText('Euro Wallet', { exact: true }).click();
        await page.getByText('Save', { exact: true }).click({ force: true });

        // Verify currency symbol or formatting
        await expect(page.getByText(/€|EUR/)).toBeVisible();
    });
});
