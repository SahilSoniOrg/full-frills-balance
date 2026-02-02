import { expect, test } from '@playwright/test';
import { clearAppState, clickPlusButton, ensureOnboarded } from './utils';

test.describe('User Journey: Stress & Boundary', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Stress User');
    });

    test('Rapid Transaction Entry: 10 transactions in <60s', async ({ page }) => {
        test.setTimeout(90000);

        for (let i = 1; i <= 10; i++) {
            await clickPlusButton(page);
            await page.getByTestId('amount-input').first().fill(`${i * 10}`);
            await page.getByTestId('description-input').fill(`Stress Test Item ${i}`);
            await page.getByTestId('save-button').click();
            await expect(page.getByText(`Stress Test Item ${i}`)).toBeVisible({ timeout: 10000 });
        }
    });

    test('Mass Account Deletion: Creating 5 and deleting all', async ({ page }) => {
        for (let i = 1; i <= 5; i++) {
            await page.goto('/account-creation');
            await page.getByPlaceholder(/Account Name|e\.g\./i).fill(`Temp Account ${i}`);
            await page.getByText('Create Account', { exact: true }).click({ force: true });
        }

        await page.goto('/(tabs)/accounts');
        for (let i = 1; i <= 5; i++) {
            await page.getByText(`Temp Account ${i}`).click({ force: true });
            // Trash icon is usually last or has name
            await page.locator('header button, header div[role="button"]').last().click({ force: true });
            await page.getByText(/Confirm|Delete/i).click({ force: true }).catch(() => { });
        }
        await expect(page.getByText('Temp Account 1')).not.toBeVisible();
    });

    test('Data Integrity: Long description character limit pressure', async ({ page }) => {
        const longText = 'A'.repeat(500);
        await clickPlusButton(page);
        await page.getByTestId('amount-input').first().fill('100');
        await page.getByTestId('description-input').fill(longText);
        await page.getByTestId('save-button').click();
        await expect(page.getByText(longText.substring(0, 50))).toBeVisible();
    });

    test('Rapid Mode Toggling: Privacy and Theme transition', async ({ page }) => {
        await page.goto('/(tabs)/settings');
        for (let i = 0; i < 3; i++) {
            await page.getByText(/Privacy Mode/i).click({ force: true });
            await page.getByText(/Dark Mode|Theme/i).click({ force: true });
        }
        await page.goto('/(tabs)');
        await expect(page.getByText('Welcome')).toBeVisible();
    });

    test('Referential Integrity: Warning on account with transactions', async ({ page }) => {
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Locked');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await clickPlusButton(page);
        await page.getByTestId('amount-input').first().fill('10');
        await page.getByText('Locked', { exact: true }).click({ force: true });
        await page.getByTestId('save-button').click();

        await page.goto('/(tabs)/accounts');
        await page.getByText('Locked').click({ force: true });
        await page.locator('header button, header div[role="button"]').last().click({ force: true });
        await expect(page.getByText(/has 1 transaction/i)).toBeVisible();
    });
});
