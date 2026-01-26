import { expect, test } from '@playwright/test';
import { clearAppState, clickPlusButton, ensureOnboarded } from './utils';

test.describe('User Journey: Account Management', () => {
    test.beforeEach(async ({ page }) => {
        await clearAppState(page);
        await ensureOnboarded(page, 'Manager User');
    });

    test('Creating a Liability account (Credit Card)', async ({ page }) => {
        await page.goto('/account-creation');
        const input = page.getByPlaceholder(/account name|e\.g\./i);
        await input.waitFor({ state: 'visible' });
        await input.fill('Visa Credit');

        await page.getByText('Liability', { exact: true }).first().click({ force: true });
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        // Liabilities typically show as negative or red in balances
        // Navigate to accounts list to verify
        await page.goto('/(tabs)/accounts');
        await expect(page.getByText('Visa Credit')).toBeVisible({ timeout: 15000 });
    });

    test('Paying off Liability: Asset decrease, Liability decrease', async ({ page }) => {
        // Setup Asset Account
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Checking');
        await page.getByText('Asset', { exact: true }).click({ force: true });
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        // Setup Liability Account
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Amex');
        await page.getByText('Liability', { exact: true }).click({ force: true });
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        // Add a charge (Expense paid by Amex)
        await clickPlusButton(page);
        await page.getByTestId('amount-input').first().fill('500');
        await page.getByText('Amex', { exact: true }).click({ force: true });
        await page.getByText('SAVE EXPENSE', { exact: true }).click({ force: true });

        // Transfer from Checking to Amex
        await clickPlusButton(page);
        await page.getByText('TRANSFER', { exact: true }).click({ force: true });
        await page.getByTestId('amount-input').first().fill('200');

        // From Checking (Asset)
        await page.getByText('From', { exact: true }).click({ force: true });
        // AccountSelector uses account name
        await page.getByText('Checking', { exact: true }).first().click({ force: true });

        // To Amex (Liability)
        await page.getByText('To', { exact: true }).click({ force: true });
        await page.getByText('Amex', { exact: true }).first().click({ force: true });

        await page.getByText('Amex', { exact: true }).click({ force: true });
        await page.getByText('SAVE TRANSFER', { exact: true }).click({ force: true });

        await expect(page.getByText('Amex')).toBeVisible();
        // Balance initially 500 (Liability), payment 200 -> 300
        await expect(page.getByText('$300')).toBeVisible();
    });

    test('Collision prevention: Duplicate account name', async ({ page }) => {
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Cash');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Cash');
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await expect(page.getByText(/exists|already taken|duplicate/i)).toBeVisible();
    });

    test('Income and Equity setup: Salary and Opening Balance', async ({ page }) => {
        // 1. Create Equity Account
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Opening Balance');
        await page.getByText('Equity', { exact: true }).click({ force: true });
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        // 2. Create Income Account
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Salary Income');
        await page.getByText('Income', { exact: true }).click({ force: true });
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        await expect(page.getByText('Salary Income')).toBeVisible();
        await expect(page.getByText('Opening Balance')).toBeVisible();
    });

    test('Interest Expense tracking: Debt increase', async ({ page }) => {
        // Setup Account (Loan)
        await page.goto('/account-creation');
        await page.getByPlaceholder(/Account Name|e\.g\./i).fill('Student Loan');
        await page.getByText('Liability', { exact: true }).click({ force: true });
        await page.getByText('Create Account', { exact: true }).click({ force: true });

        // Add typical loan interest (Expense + Liability Increase)
        await clickPlusButton(page);
        const amountInput = page.locator('[data-testid="amount-input"], [testID="amount-input"]');
        await amountInput.waitFor({ state: 'visible', timeout: 10000 });
        await amountInput.fill('150');
        await page.getByText('Student Loan', { exact: true }).click({ force: true });
        await page.getByText('Student Loan', { exact: true }).click({ force: true });
        await page.getByText('SAVE EXPENSE', { exact: true }).click({ force: true });

        await expect(page.getByText('Student Loan')).toBeVisible();
        await expect(page.getByText('$150')).toBeVisible();
    });
});
