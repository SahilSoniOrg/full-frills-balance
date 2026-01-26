import { expect, test } from '@playwright/test';
import { clearAppState, ensureOnboarded } from './utils';

test.describe('User Journey: Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Edge User');
    });

    test('should warn when deleting account with transactions', async ({ page }) => {
        await page.goto('/account-creation');
        await page.getByPlaceholder('Account Name').fill('Doomed Account');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await page.locator('div[role="button"]').filter({ hasText: '+' }).click();
        await page.getByTestId('amount-input').first().fill('10');
        await page.getByText('Doomed Account', { exact: true }).click();
        await page.getByText('Save', { exact: true }).click({ force: true });

        await page.goto('/(tabs)/accounts');
        await page.getByText('Doomed Account').click();

        // Use more robust selector for delete icon
        await page.getByRole('button').filter({ has: page.locator('svg, i') }).last().click();

        await expect(page.getByText('This account has 1 transaction(s)')).toBeVisible();
        await page.getByText('Cancel', { exact: true }).click({ force: true });

        await expect(page.getByText('Doomed Account')).toBeVisible();
    });
});
