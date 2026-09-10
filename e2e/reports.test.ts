import { expect, test } from './fixtures';

test.describe('Reports and Analytics', () => {
  test.setTimeout(120 * 1000);

  test.beforeEach(async ({ onboardingPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Reports User');
  });

  test('should not leak income into spending categories', async ({
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

    // Go to Reports and verify the income category is populated.
    await dashboardPage.switchToReports();
    await expect(dashboardPage.page.getByText('Reports', { exact: true }).first()).toBeVisible();

    // The category views share the same period deltas. Income must not appear
    // in the spending category card when no expense exists.
    await dashboardPage.page.getByRole('tab', { name: 'Spending', exact: true }).click();

    const spendingByCategory = dashboardPage.page.getByTestId('report-spending-by-category');
    await expect(spendingByCategory).toBeVisible();
    await expect(spendingByCategory).toContainText('No activity in this period');
    await expect(spendingByCategory.getByText(/\$1,000\.00/)).toHaveCount(0);

    const incomeByCategory = dashboardPage.page.getByTestId('report-income-by-category');
    await expect(incomeByCategory).toBeVisible();
    await expect(incomeByCategory.getByText(/\$1,000\.00/).first()).toBeVisible();
  });
});
