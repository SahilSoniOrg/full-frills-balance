import { expect, test } from '@playwright/test';
import { clearAppState } from './utils';

test.describe('User Journey: Persistence', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
    });

    test('should persist user data after reload', async ({ page }) => {
        // 1. Onboard
        await page.goto('/');
        await expect(page.getByText('Welcome to Balance')).toBeVisible({ timeout: 20000 });
        await page.getByPlaceholder('Enter your name').fill('Persistent User');
        await page.getByText('Continue', { exact: true }).click({ force: true });
        await page.getByText('USD', { exact: true }).first().click();
        await page.getByText('Get Started', { exact: true }).click({ force: true });

        // 2. Create data
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Saved Bank');
        await page.getByText('Create Account', { exact: true }).click({ force: true });
        await expect(page.getByText('Saved Bank')).toBeVisible();

        // 3. Reload
        await page.reload({ waitUntil: 'networkidle' });

        // 4. Verify (should land on Dashboard, not Onboarding)
        await expect(page.getByText('Welcome to Balance')).not.toBeVisible();
        await expect(page.getByText('Saved Bank')).toBeVisible();
    });
});
