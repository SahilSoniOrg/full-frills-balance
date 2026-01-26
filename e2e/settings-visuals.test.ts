import { expect, test } from '@playwright/test';
import { clearAppState, ensureOnboarded } from './utils';

test.describe('User Journey: Settings & Visuals', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Visual User');
    });

    test('should toggle privacy mode and hide amounts', async ({ page }) => {
        // 1. Create data
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Secret stash');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await page.getByText('+', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('1000000');
        await page.getByText('Save', { exact: true }).click({ force: true });

        await expect(page.getByText(/\$1,000,000/)).toBeVisible();

        // 2. Go to Settings and Toggle Privacy
        await page.goto('/(tabs)/settings');
        // RN-Web toggle is often a checkbox or a div with label
        await page.getByLabel(/Privacy Mode/i).click({ force: true }).catch(() => page.getByText(/Privacy Mode/i).click({ force: true }));

        // 3. Return to Dashboard and Verify
        await page.goto('/(tabs)');
        await expect(page.getByText('••••••')).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(/\$1,000,000/)).not.toBeVisible();
    });
});
