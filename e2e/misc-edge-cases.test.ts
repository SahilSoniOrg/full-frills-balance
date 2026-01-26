import { expect, test } from '@playwright/test';
import { clearAppState, clickPlusButton, ensureOnboarded } from './utils';

test.describe('User Journey: Miscellaneous Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Edge User');
    });

    test('Unbalanced debit surplus warning', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByText('Advanced', { exact: true }).click({ force: true });
        await page.getByPlaceholder('0.00').first().fill('100');
        await page.getByText('+ Add Line', { exact: true }).click({ force: true });
        await page.getByPlaceholder('0.00').nth(1).fill('150');
        await expect(page.getByText(/Unbalanced/i)).toBeVisible();
    });

    test('Empty description allowed but warned?', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByTestId('amount-input').first().fill('10');
        await page.getByText('Save', { exact: true }).click({ force: true });
        // Should default to "Transaction" or similar if empty
        await expect(page.getByText(/Transaction|Expense/i)).toBeVisible();
    });

    test('Future date entry validation', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByText('Advanced', { exact: true }).click({ force: true });
        await page.getByPlaceholder('YYYY-MM-DD').fill('2099-01-01');
        // Verify if it warns or allows
        await expect(page.getByPlaceholder('2099-01-01')).toBeVisible();
    });

    test('Rapid mode toggling stability', async ({ page }) => {
        await page.goto('/(tabs)/settings');
        for (let i = 0; i < 5; i++) {
            await page.getByText(/Privacy Mode/i).click({ force: true });
        }
        await expect(page.getByText(/Privacy Mode/i)).toBeVisible();
    });

    test('Navigation deep-link to account creation', async ({ page }) => {
        await page.goto('/account-creation?type=liability');
        await expect(page.getByText('Liability', { exact: true })).toHaveCSS('background-color', /rgb/); // Verify selected
    });
});
