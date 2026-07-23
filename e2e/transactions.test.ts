import { expect, test } from './fixtures';

test.describe('Transaction Management', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ onboardingPage, accountsPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Transaction User');

    // Create initial accounts with unique names for this suite
    await accountsPage.navigateToCreation();
    await accountsPage.createAccount('Checking T', 'Asset');
    await accountsPage.navigateToCreation();
    await accountsPage.createAccount('Food T', 'Expense');
    await accountsPage.navigateToCreation();
    await accountsPage.createAccount('Salary T', 'Income');
  });

  test('should create an expense transaction', async ({
    dashboardPage,
    journalEntryPage,
    accountsPage,
  }) => {
    // DEBUG: Verify all accounts exist
    await accountsPage.switchToAccounts();
    await expect(accountsPage.page.getByText('Checking T')).toBeVisible();
    await expect(accountsPage.page.getByText('Food T')).toBeVisible();
    await expect(accountsPage.page.getByText('Salary T')).toBeVisible();

    await dashboardPage.switchToDashboard();
    await dashboardPage.clickPlusButton();

    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('50.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Food T');
    await journalEntryPage.enterDescription('Lunch');
    await journalEntryPage.save();

    // Verify on dashboard
    await expect(dashboardPage.page.getByText('Lunch')).toBeVisible({ timeout: 15000 });
    await expect(dashboardPage.page.getByText(/50\.00/).first()).toBeVisible();
  });

  test('should create an income transaction', async ({ dashboardPage, journalEntryPage }) => {
    await dashboardPage.switchToDashboard();
    await dashboardPage.clickPlusButton();

    await journalEntryPage.selectType('INCOME');
    await journalEntryPage.enterAmount('2000');
    await journalEntryPage.selectSourceAccount('Salary T');
    await journalEntryPage.selectDestinationAccount('Checking T');
    await journalEntryPage.enterDescription('Monthly Pay');
    await journalEntryPage.save();

    // Verify on dashboard
    await expect(dashboardPage.page.getByText('Monthly Pay')).toBeVisible({ timeout: 15000 });
    // Matches + $2,000.00 or +$2,000.00 etc
    await expect(dashboardPage.page.getByText(/2,000\.00/).first()).toBeVisible();
  });

  test('should edit a transaction', async ({ dashboardPage, journalEntryPage, page }) => {
    // Create one first
    await dashboardPage.switchToDashboard();
    await dashboardPage.clickPlusButton();
    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('10.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Food T');
    await journalEntryPage.enterDescription('Coffee');
    await journalEntryPage.save();

    // Click to details
    await dashboardPage.clickTransaction('Coffee');

    // Click edit
    await expect(page.getByTestId('edit-button')).toBeVisible();
    await page.getByTestId('edit-button').click();

    // Now in edit mode
    await journalEntryPage.enterAmount('12.50');
    await journalEntryPage.enterDescription('Coffee Edit');
    await journalEntryPage.save();

    // Verify update
    await expect(dashboardPage.page.getByText('Coffee Edit')).toBeVisible({ timeout: 15000 });
    await expect(dashboardPage.page.getByText(/12\.50/).first()).toBeVisible();
  });

  test('should delete a transaction', async ({ dashboardPage, journalEntryPage, page }) => {
    // Create one first
    await dashboardPage.switchToDashboard();
    await dashboardPage.clickPlusButton();
    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('100.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Food T');
    await journalEntryPage.enterDescription('Groceries');
    await journalEntryPage.save();

    // Click to details
    await dashboardPage.clickTransaction('Groceries');

    // Click delete
    await expect(page.getByTestId('delete-button')).toBeVisible();

    // Handle dialog
    page.once('dialog', dialog => dialog.accept());

    await page.getByTestId('delete-button').click();

    // Verify gone
    await expect(dashboardPage.page.getByText('Groceries')).not.toBeVisible({ timeout: 15000 });
  });
});
