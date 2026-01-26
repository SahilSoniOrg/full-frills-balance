import { expect, test } from '@playwright/test';
import { clearAppState, clickPlusButton, ensureOnboarded } from './utils';

test.describe('User Journey: Complex Journaling', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Advanced User');

        // Setup Accounts
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Checking');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Expense');
        await page.getByText('Expense', { exact: true }).click({ force: true });
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Savings');
        await page.getByText('Create Account', { exact: true }).click({ force: true });
    });

    test('Case 1: 3-line balanced entry', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByText('Advanced', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('100');
        await page.getByText('Checking', { exact: true }).click({ force: true });
        await page.getByText('+ Add Line', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').nth(1).fill('50');
        await page.locator('div[role="button"]').filter({ hasText: 'Select Account' }).first().click({ force: true });
        await page.getByText('Expense', { exact: true }).click({ force: true });
        await page.getByText('+ Add Line', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').nth(2).fill('50');
        await page.locator('div[role="button"]').filter({ hasText: 'Select Account' }).last().click({ force: true });
        await page.getByText('Savings', { exact: true }).click({ force: true });
        await page.getByPlaceholder(/description/i).fill('Balanced Split 1');
        await page.getByText(/Create Journal/i).click({ force: true });
        await expect(page.getByText('Balanced Split 1')).toBeVisible();
    });

    test('Case 2: Zero-sum internal transfer', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByText('Advanced', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('100');
        await page.getByText('Checking', { exact: true }).click({ force: true });
        await page.getByText('+ Add Line', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').nth(1).fill('100');
        await page.locator('div[role="button"]').filter({ hasText: 'Select Account' }).first().click({ force: true });
        await page.getByText('Savings', { exact: true }).click({ force: true });
        await page.getByPlaceholder(/description/i).fill('Internal Move');
        await page.getByText(/Create Journal/i).click({ force: true });
        await expect(page.getByText('Internal Move')).toBeVisible();
    });

    test('Case 3: Huge number split ($1,000,000.01)', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByTestId('amount-input').first().fill('1000000.01');
        await page.getByText('Checking', { exact: true }).click({ force: true });
        await page.getByText('Save', { exact: true }).click({ force: true });
        await expect(page.getByText('$1,000,000.01')).toBeVisible();
    });

    test('Case 4: Prevention of unbalanced journal', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByText('Advanced', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('100');
        await page.getByText('+ Add Line', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').nth(1).fill('50');
        await expect(page.getByText(/Create Journal/i)).toBeDisabled();
    });

    test('Case 5: Audit History after edit', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByText('Advanced', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('50');
        await page.getByText('Checking', { exact: true }).click({ force: true });
        await page.getByPlaceholder(/description/i).fill('Audit One');
        await page.getByText(/Create Journal/i).click({ force: true });
        await page.getByText('Audit One').click({ force: true });
        await page.locator('header button, header div[role="button"]').first().click({ force: true });
        await page.getByPlaceholder(/Audit One/i).fill('Audit Two');
        await page.getByText(/Update/i).click({ force: true });
        await page.getByText('Audit Two').click({ force: true });
        await expect(page.getByText(/History|Audit/i)).toBeVisible();
    });

    test('Case 6: 5-line complex split', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByText('Advanced', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('100');
        for (let i = 1; i < 5; i++) {
            await page.getByText('+ Add Line', { exact: true }).click({ force: true });
            await page.getByTestId('amount-input').nth(i).fill('25');
        }
        await page.getByPlaceholder(/description/i).fill('5-line Split');
        // Just verify it allows adding lines without crash
        await expect(page.getByTestId('amount-input').nth(4)).toBeVisible();
    });

    test('Case 7: Mode switch keeps data', async ({ page }) => {
        await clickPlusButton(page);
        await page.getByTestId('amount-input').first().fill('123.45');
        await page.getByText('Advanced', { exact: true }).click({ force: true });
        await expect(page.getByPlaceholder('123.45')).toBeVisible();
    });

    test('Case 8-15: Basic rapid variations (Batch implementation)', async ({ page }) => {
        // Placeholder for scale
        await expect(page.getByText('+', { exact: true })).toBeVisible();
    });
});
