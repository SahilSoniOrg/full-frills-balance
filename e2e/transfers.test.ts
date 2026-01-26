import { expect, test } from '@playwright/test';
import { clearAppState, ensureOnboarded } from './utils';

test.describe('User Journey: Transfers', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Transfer User');
    });

    test('should transfer money between two accounts', async ({ page }) => {
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./).fill('Checking');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./).fill('Savings');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        // Add Income to Checking
        await page.getByText('+', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('1000');
        await page.getByText('Income', { exact: true }).click();
        await page.getByText('Checking', { exact: true }).first().click();
        await page.getByPlaceholder(/What is this for/i).fill('Initial Deposit');
        await page.getByText('Save', { exact: true }).click({ force: true });

        // Perform Transfer
        await page.getByText('+', { exact: true }).click({ force: true });
        await page.getByText('Transfer', { exact: true }).click();
        await page.getByTestId('amount-input').first().fill('200');

        await page.getByText('From', { exact: true }).click();
        await page.getByText('Checking', { exact: true }).click();

        await page.getByText('To', { exact: true }).click();
        await page.getByText('Savings', { exact: true }).click();

        await page.getByPlaceholder(/What is this for/i).fill('Monthly Savings');
        await page.getByText('Save', { exact: true }).click({ force: true });

        await expect(page.getByText('Checking')).toBeVisible();
        await expect(page.getByText('$800')).toBeVisible();
        await expect(page.getByText('Savings')).toBeVisible();
        await expect(page.getByText('$200')).toBeVisible();
    });
});
