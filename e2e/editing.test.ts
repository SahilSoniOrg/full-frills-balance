import { expect, test } from '@playwright/test';
import { clearAppState, ensureOnboarded } from './utils';

test.describe('User Journey: Editing Data', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Editor User');
    });

    test('should edit existing transaction amount', async ({ page }) => {
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./).fill('Cash');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await page.getByText('+', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('50');
        await page.getByPlaceholder(/What is this for/i).fill('Initial Lunch');
        await page.getByText('Save', { exact: true }).click({ force: true });

        await page.getByText('Initial Lunch', { exact: true }).click({ force: true });
        await expect(page.getByText('Transaction Details')).toBeVisible();

        // Manual edit click (icon-based often flakes, targeting header action index)
        await page.locator('header button, header div[role="button"]').first().click({ force: true });

        await expect(page.getByText('EDITING')).toBeVisible();
        await page.getByPlaceholder('50').fill('45');
        await page.getByText('Save', { exact: true }).click({ force: true });

        await expect(page.getByText('$45')).toBeVisible();
    });
});
