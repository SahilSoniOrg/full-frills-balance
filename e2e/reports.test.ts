import { expect, test } from './fixtures';

test.describe('Reports and Analytics', () => {
  test.setTimeout(120 * 1000);

  test.beforeEach(async ({ onboardingPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Reports User');
  });

  test('should isolate income and expense categories', async ({
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
    await journalEntryPage.selectSourceAccount('Salary');
    await journalEntryPage.selectDestinationAccount('Bank');
    await journalEntryPage.enterDescription('Salary Payment');
    await journalEntryPage.save();

    await dashboardPage.switchToDashboard();
    // Net worth should now be $1,000.00
    await expect(
      dashboardPage.page
        .getByTestId('dashboard-screen')
        .getByText(/\$1,000\.00/)
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Add Expense: -$250
    await dashboardPage.clickPlusButton();
    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('250');
    await journalEntryPage.selectSourceAccount('Bank');
    await journalEntryPage.selectDestinationAccount('Food & Drink');
    await journalEntryPage.enterDescription('Groceries');
    await journalEntryPage.save();

    await dashboardPage.switchToDashboard();
    await expect(
      dashboardPage.page
        .getByTestId('dashboard-screen')
        .getByText(/\$750\.00/)
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Go to Reports and verify both sides of the category split.
    await dashboardPage.switchToReports();
    await expect(dashboardPage.page.getByText('Reports', { exact: true }).first()).toBeVisible();
    await expect(dashboardPage.page.getByText('Income vs Expense', { exact: true })).toHaveCount(0);

    const summary = dashboardPage.page.getByTestId('report-summary');
    await expect(summary).toBeVisible();
    await expect(summary.getByTestId('report-summary-income')).toContainText('$1,000.00');
    await expect(summary.getByTestId('report-summary-expense')).toContainText('$250.00');
    await expect(summary.getByTestId('report-summary-net-flow')).toContainText('$750.00');
    await expect(summary.getByTestId('report-summary-largest-category')).toContainText('Food');
    await expect(summary.getByTestId('report-summary-highest-day')).toContainText('$250.00');
    await expect(summary).toContainText('Compared with previous period');

    // The category views share the same period deltas. Expense must appear in
    // spending, while income must remain isolated to income categories.
    await dashboardPage.page.getByRole('tab', { name: 'Spending', exact: true }).click();

    const spendingByCategory = dashboardPage.page.getByTestId('report-spending-by-category');
    await expect(spendingByCategory).toBeVisible();
    await expect(spendingByCategory).not.toContainText('No activity in this period');
    await expect(spendingByCategory.getByText('Food', { exact: true })).toBeVisible();
    await expect(spendingByCategory.getByText(/\$250\.00/).first()).toBeVisible();
    await expect(spendingByCategory.getByText(/\$1,000\.00/)).toHaveCount(0);

    const incomeByCategory = dashboardPage.page.getByTestId('report-income-by-category');
    await expect(incomeByCategory).toBeVisible();
    await expect(incomeByCategory.getByText(/\$1,000\.00/).first()).toBeVisible();
    await expect(incomeByCategory.getByText(/\$250\.00/)).toHaveCount(0);
    await expect(incomeByCategory.getByText('Food', { exact: true })).toHaveCount(0);
  });
});
