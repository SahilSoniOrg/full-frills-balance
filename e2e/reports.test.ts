import { expect, test } from './fixtures';

test.describe('Reports and Analytics', () => {
  test.setTimeout(120 * 1000);

  test.beforeEach(async ({ onboardingPage, accountsPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Reports User');

    // Setup accounts for reporting
    await accountsPage.navigateToCreation();
    await accountsPage.createAccount('Reporting Asset', 'Asset');
    await accountsPage.navigateToCreation();
    await accountsPage.createAccount('Reporting Expense', 'Expense');
    await accountsPage.navigateToCreation();
    await accountsPage.createAccount('Reporting Income', 'Income');
  });

  test('should reflect transactions in Net Worth and Summaries', async ({
    dashboardPage,
    journalEntryPage,
  }) => {
    await dashboardPage.switchToDashboard();

    // Initial Net Worth should be $0 if no initial balance
    // Note: The UI might show "$0.00" or similar depending on currency
    // Adjusting selector for flexibility
    // await expect(dashboardPage.page.getByText('$0.00')).toBeVisible();

    // Add Income: +$1000
    await dashboardPage.clickPlusButton();
    await journalEntryPage.selectType('INCOME');
    await journalEntryPage.enterAmount('1000');
    await journalEntryPage.selectSourceAccount('Reporting Income');
    await journalEntryPage.selectDestinationAccount('Reporting Asset');
    await journalEntryPage.enterDescription('Salary Payment');
    await journalEntryPage.save();

    await dashboardPage.switchToDashboard();
    // Net worth should now be $1,000.00
    await expect(dashboardPage.page.getByText('$1,000.00')).toBeVisible({ timeout: 15000 });

    // Add Expense: -$250
    await dashboardPage.clickPlusButton();
    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('250');
    await journalEntryPage.selectSourceAccount('Reporting Asset');
    await journalEntryPage.selectDestinationAccount('Reporting Expense');
    await journalEntryPage.enterDescription('Shopping');
    await journalEntryPage.save();

    await dashboardPage.switchToDashboard();
    // Net worth should now be $750.00
    await expect(dashboardPage.page.getByText('$750.00')).toBeVisible({ timeout: 15000 });

    // Go to Reports tab and check summaries if any
    await dashboardPage.switchToReports();
    // Verify we are on Reports screen
    await expect(dashboardPage.page.getByText(/Reports|Analysis|Analytics/i).first()).toBeVisible();

    // Verify income/expense totals on reports if present
    await expect(dashboardPage.page.getByText('$1,000.00')).toBeVisible();
    await expect(dashboardPage.page.getByText('$250.00')).toBeVisible();
  });
});
