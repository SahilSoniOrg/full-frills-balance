import { expect, test } from '@playwright/test';
import { clearAppState } from './utils';

test.describe('User Journey: Onboarding', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
    });

    test('should complete onboarding successfully', async ({ page }) => {
        // 1. Initial Load
        await expect(page.getByText('Welcome to Balance')).toBeVisible({ timeout: 30000 });

        // 2. Name Step
        await page.getByPlaceholder('Enter your name').fill('Test User');
        // Using exact text and force click for RN-Web compatibility
        await page.getByText('Continue', { exact: true }).click({ force: true });

        // 3. Currency Step
        await expect(page.getByText('Default Currency', { exact: true })).toBeVisible({ timeout: 10000 });
        await page.getByText('USD').first().click();
        await page.getByText('Get Started').click({ force: true });

        // 4. Verify account creation
        await expect(page.getByText(/New Account|Account Name/).first()).toBeVisible({ timeout: 15000 });
    });
});
