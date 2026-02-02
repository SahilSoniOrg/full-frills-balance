import { expect, test } from './fixtures';

test.skip('Transaction Management', () => {
    test.setTimeout(120000);
    test.beforeEach(async ({ onboardingPage, accountsPage }) => {
        await onboardingPage.clearAppState();
        await onboardingPage.goto('/');
        await onboardingPage.completeOnboarding('Transaction User');

        // Create initial accounts
        await accountsPage.createAccount('Checking', 'Asset');
        await accountsPage.navigateToCreation();
        await accountsPage.createAccount('Food', 'Expense');
        await accountsPage.navigateToCreation();
        await accountsPage.createAccount('Salary', 'Income');
    });

    test('should create an expense transaction', async ({ dashboardPage, journalEntryPage }) => {
        await dashboardPage.switchToDashboard();
        await dashboardPage.clickPlusButton();

        await journalEntryPage.selectType('EXPENSE');
        await journalEntryPage.enterAmount('50.00');
        await journalEntryPage.selectSourceAccount('Checking');
        await journalEntryPage.selectDestinationAccount('Food');
        await journalEntryPage.enterDescription('Lunch');
        await journalEntryPage.save();

        // Verify on dashboard
        await expect(dashboardPage.page.getByText('Lunch')).toBeVisible({ timeout: 15000 });
        await expect(dashboardPage.page.getByText('-$50.00')).toBeVisible();
    });

    test('should create an income transaction', async ({ dashboardPage, journalEntryPage }) => {
        await dashboardPage.switchToDashboard();
        await dashboardPage.clickPlusButton();

        await journalEntryPage.selectType('INCOME');
        await journalEntryPage.enterAmount('2000.00');
        await journalEntryPage.selectSourceAccount('Salary');
        await journalEntryPage.selectDestinationAccount('Checking');
        await journalEntryPage.enterDescription('Monthly Pay');
        await journalEntryPage.save();

        // Verify on dashboard
        await expect(dashboardPage.page.getByText('Monthly Pay')).toBeVisible({ timeout: 15000 });
        await expect(dashboardPage.page.getByText('+$2,000.00')).toBeVisible();
    });
});
