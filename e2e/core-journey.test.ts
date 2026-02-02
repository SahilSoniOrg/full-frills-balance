import { expect, test } from '@playwright/test';
import { clearAppState, clickPlusButton, ensureOnboarded } from './utils';

test.describe('User Journey: Core Usage', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Core User');
    });

    test('should create account and transaction', async ({ page }) => {
        await page.goto('/account-creation');

        // Fill Name
        const nameInput = page.getByPlaceholder(/Account Name|e\.g\./i);
        await nameInput.waitFor({ state: 'visible' });
        await nameInput.fill('Main Checking');

        // Select Account Type
        await page.getByText('Asset', { exact: true }).click();

        // Scroll to and click Create Account
        const createBtn = page.getByText(/Create Account/i);
        await createBtn.scrollIntoViewIfNeeded();
        await createBtn.click({ force: true });

        // Verify account exists in list
        await expect(page.getByText('Main Checking')).toBeVisible({ timeout: 15000 });

        // Tap FAB (The big '+' button)
        await clickPlusButton(page);

        // Wait for entry screen to load
        await page.getByTestId('amount-input').first().waitFor({ state: 'visible', timeout: 15000 });

        // Fill Transaction
        await page.getByTestId('amount-input').first().fill('50');
        await page.getByTestId('description-input').fill('Groceries');

        // Save Transaction
        const saveBtn = page.getByTestId('save-button');
        await saveBtn.scrollIntoViewIfNeeded();
        await saveBtn.click({ force: true });

        // Verify result
        await expect(page.getByText('Groceries', { exact: true })).toBeVisible({ timeout: 10000 });
    });
});
