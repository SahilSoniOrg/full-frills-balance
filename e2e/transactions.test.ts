import { expect, test } from './fixtures';

test.describe('Transaction Management', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ onboardingPage, accountsPage, dashboardPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Transaction User');

    // Create initial accounts with unique names for this suite
    await accountsPage.createAccount('Checking T', 'Asset');
    await accountsPage.createAccount('Food T', 'Expense');
    await accountsPage.createAccount('Salary T', 'Income');
    await dashboardPage.switchToActivity();
  });

  test('should create an expense transaction', async ({ dashboardPage, journalEntryPage }) => {
    await dashboardPage.clickPlusButton();

    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('50.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Food T');
    await journalEntryPage.enterDescription('Lunch');
    await journalEntryPage.save();

    // Verify on activity feed
    await dashboardPage.switchToActivity();
    await expect(dashboardPage.page.getByText('Lunch')).toBeVisible({ timeout: 15000 });
    await expect(dashboardPage.page.getByText(/50\.00/).first()).toBeVisible();
  });

  test('should create an income transaction', async ({ dashboardPage, journalEntryPage }) => {
    await dashboardPage.clickPlusButton();

    await journalEntryPage.selectType('INCOME');
    await journalEntryPage.enterAmount('2000');
    await journalEntryPage.selectSourceAccount('Salary T');
    await journalEntryPage.selectDestinationAccount('Checking T');
    await journalEntryPage.enterDescription('Monthly Pay');
    await journalEntryPage.save();

    // Verify on dashboard
    await dashboardPage.switchToActivity();
    await expect(dashboardPage.page.getByText('Monthly Pay')).toBeVisible({ timeout: 15000 });
    // Matches + $2,000.00 or +$2,000.00 etc
    await expect(dashboardPage.page.getByText(/2,000\.00/).first()).toBeVisible();
  });

  test.fixme('should create a transfer transaction', async ({
    dashboardPage,
    journalEntryPage,
  }) => {
    await dashboardPage.clickPlusButton();

    await journalEntryPage.selectType('TRANSFER');
    await journalEntryPage.enterDescription('Emergency Fund Transfer');
    await journalEntryPage.enterAmount('300.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Bank');
    await journalEntryPage.save();

    // Verify on dashboard
    await dashboardPage.switchToActivity();
    await expect(dashboardPage.page.getByText('Emergency Fund Transfer')).toBeVisible({
      timeout: 15000,
    });
  });

  test('should edit a transaction', async ({ dashboardPage, journalEntryPage, page }) => {
    // Create one first
    await dashboardPage.clickPlusButton();
    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('10.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Food T');
    await journalEntryPage.enterDescription('Coffee');
    await journalEntryPage.save();

    // Click to details
    await dashboardPage.switchToActivity();
    await dashboardPage.clickTransaction('Coffee');

    // Click edit
    await expect(page.getByTestId('edit-button')).toBeVisible();
    await page.getByTestId('edit-button').click();

    // Now in edit mode
    await journalEntryPage.enterAmount('12.50');
    await journalEntryPage.enterDescription('Coffee Edit');
    await journalEntryPage.save();

    await expect(page.getByText('Transaction Details')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Coffee Edit', { exact: true }).nth(1)).toBeVisible({
      timeout: 15000,
    });
  });

  test('should delete a transaction', async ({ dashboardPage, journalEntryPage, page }) => {
    // Create one first
    await dashboardPage.clickPlusButton();
    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('100.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Food T');
    await journalEntryPage.enterDescription('Groceries');
    await journalEntryPage.save();

    // Click to details
    await dashboardPage.switchToActivity();
    await dashboardPage.clickTransaction('Groceries');

    // Click delete and confirm in-app dialog
    await expect(page.getByTestId('delete-button')).toBeVisible();
    await page.getByTestId('delete-button').click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    // Verify gone
    await dashboardPage.switchToActivity();
    await expect(dashboardPage.page.getByText('Groceries')).not.toBeVisible({ timeout: 15000 });
  });
});
