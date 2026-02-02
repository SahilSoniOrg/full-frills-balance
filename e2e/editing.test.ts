import { expect, test } from '@playwright/test';
import { clearAppState, clickPlusButton, ensureOnboarded, waitForNavigation } from './utils';

test.describe('User Journey: Editing Data', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Editor User');
    });

    test('should edit existing transaction amount', async ({ page }) => {
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./).fill('Cash');
        await page.getByText('Create Account', { exact: true }).click();

        // Verify account exists and is an ASSET (should be in Assets group)
        await expect(page.getByText('ASSETS', { exact: true })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Cash', { exact: true })).toBeVisible({ timeout: 15000 });

        // Navigate to dashboard and wait for it to load
        await page.goto('/(tabs)');
        await expect(page.getByText(/Hello,/)).toBeVisible({ timeout: 15000 });

        await clickPlusButton(page);

        // Wait for entry screen to load
        await page.getByTestId('amount-input').first().waitFor({ state: 'visible', timeout: 15000 });
        await page.getByTestId('amount-input').first().fill('50');
        await page.getByTestId('description-input').fill('Initial Lunch');

        // Explicitly select the 'Cash' account if it's not auto-selected
        const cashAccount = page.getByText('Cash', { exact: true });
        await cashAccount.waitFor({ state: 'visible', timeout: 15000 });
        await cashAccount.click({ force: true });

        await page.getByTestId('save-button').click();

        // Wait for transaction to appear in list and then click
        const entry = page.getByText('Initial Lunch', { exact: true });
        await entry.waitFor({ state: 'visible', timeout: 15000 });
        await entry.click({ force: true });

        await expect(page.getByText('Transaction Details')).toBeVisible();

        // Manual edit click (using new testID)
        await page.getByTestId('edit-button').click();

        await expect(page.getByText('EDITING')).toBeVisible();
        await page.getByTestId('amount-input').fill('45');
        await page.getByTestId('save-button').click();

        // Robust wait and reload to ensure the detail screen reflects the database update
        await waitForNavigation(page, 3000);
        await page.reload();
        await page.waitForTimeout(1000);

        await expect(page.getByText('$45', { exact: true }).first()).toBeVisible();
    });
});
