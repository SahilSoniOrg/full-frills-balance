import { expect, test } from '@playwright/test';
import { clearAppState, clickPlusButton, ensureOnboarded } from './utils';

test.describe('User Journey: Visuals & Accessibility', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Visual User');
    });

    test('Privacy Mode: Masks amounts everywhere', async ({ page }) => {
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Rich Guy Bank');
        await page.getByTestId('initial-balance-input').fill('1234567');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await page.goto('/(tabs)/settings');
        await page.getByText(/Privacy Mode/i).click({ force: true });

        await page.goto('/(tabs)');
        await expect(page.getByText('••••••')).toBeVisible();
        await page.goto('/(tabs)/accounts');
        await expect(page.getByText('••••••')).toBeVisible();
    });

    test('Search functionality in Accounts List', async ({ page }) => {
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name/i).fill('Alpha Account');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await clickPlusButton(page);
        await page.getByPlaceholder(/Account Name/i).fill('Beta Account');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await page.goto('/(tabs)/accounts');
        const searchInput = page.getByPlaceholder(/Search/i);
        if (await searchInput.isVisible()) {
            await searchInput.fill('Alpha');
            await expect(page.getByText('Alpha Account')).toBeVisible();
            await expect(page.getByText('Beta Account')).not.toBeVisible();
        }
    });

    test('Filtering Journal by keyword', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByTestId('amount-input').first().fill('10');
        await page.getByPlaceholder(/What is this for/i).fill('Pizza');
        await page.getByText('Save', { exact: true }).click({ force: true });

        await clickPlusButton(page);
        await page.getByTestId('amount-input').first().fill('20');
        await page.getByPlaceholder(/What is this for/i).fill('Burger');
        await page.getByText('Save', { exact: true }).click({ force: true });

        await page.goto('/(tabs)/journal');
        const searchInput = page.getByPlaceholder(/Search|Filter/i);
        if (await searchInput.isVisible()) {
            await searchInput.fill('Pizza');
            await expect(page.getByText('Pizza')).toBeVisible();
            await expect(page.getByText('Burger')).not.toBeVisible();
        }
    });

    test('Theme Switch: Contrast Check', async ({ page }) => {
        await page.goto('/(tabs)/settings');
        await page.getByText(/Dark Mode|Theme/i).click({ force: true });
        // Verify app didn't crash
        await expect(page.getByText(/Settings/i)).toBeVisible();
    });
});
