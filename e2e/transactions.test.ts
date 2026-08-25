import { expect, test } from './fixtures';

test.describe('Transaction Management', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ onboardingPage, accountsPage, dashboardPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Transaction User');

    await accountsPage.createAccount('Checking T', 'Asset');
    await accountsPage.createAccount('Savings T', 'Asset');
    await accountsPage.createAccount('Food T', 'Expense');
    await accountsPage.createAccount('Snacks T', 'Expense');
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

    await dashboardPage.switchToActivity();
    await expect(dashboardPage.page.getByText('Monthly Pay')).toBeVisible({ timeout: 15000 });
    await expect(dashboardPage.page.getByText(/2,000\.00/).first()).toBeVisible();
  });

  test('should create a transfer transaction', async ({ dashboardPage, journalEntryPage }) => {
    await dashboardPage.clickPlusButton();

    await journalEntryPage.selectType('TRANSFER');
    await journalEntryPage.enterDescription('Emergency Fund Transfer');
    await journalEntryPage.enterAmount('300.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Savings T');
    await journalEntryPage.save();

    await dashboardPage.switchToActivity();
    await expect(dashboardPage.page.getByText('Emergency Fund Transfer')).toBeVisible({
      timeout: 15000,
    });
  });

  test('should create an advanced multi-leg journal', async ({
    dashboardPage,
    journalEntryPage,
  }) => {
    await dashboardPage.clickPlusButton();
    await journalEntryPage.switchMode('Expert');
    await journalEntryPage.enterDescription('Split groceries');

    // Pin types explicitly — guided/advanced scaffolds can differ in leg order.
    await journalEntryPage.setAdvancedLineType(1, 'DEBIT');
    await journalEntryPage.setAdvancedLineType(2, 'CREDIT');
    await journalEntryPage.selectAdvancedLineAccount(1, 'Food T');
    await journalEntryPage.enterAdvancedLineAmount(1, '30.00');
    await journalEntryPage.selectAdvancedLineAccount(2, 'Checking T');
    await journalEntryPage.enterAdvancedLineAmount(2, '50.00');

    await journalEntryPage.addAdvancedLine();
    await journalEntryPage.setAdvancedLineType(3, 'DEBIT');
    await journalEntryPage.selectAdvancedLineAccount(3, 'Snacks T');
    await journalEntryPage.enterAdvancedLineAmount(3, '20.00');

    await journalEntryPage.save();

    await dashboardPage.switchToActivity();
    await expect(dashboardPage.page.getByText('Split groceries')).toBeVisible({ timeout: 15000 });
  });

  test('should create journals via bulk entry', async ({ dashboardPage, journalEntryPage }) => {
    await dashboardPage.clickPlusButton();
    await journalEntryPage.switchMode('Batch');

    await journalEntryPage.fillBulkRow(0, {
      description: 'Bulk Coffee',
      amount: '4.50',
      source: 'Checking T',
      destination: 'Food T',
    });
    await journalEntryPage.page.getByText('+ Add Entry Row', { exact: true }).click();
    await journalEntryPage.fillBulkRow(1, {
      description: 'Bulk Snacks',
      amount: '6.00',
      source: 'Checking T',
      destination: 'Snacks T',
    });

    await journalEntryPage.saveBulk();

    await dashboardPage.switchToActivity();
    await expect(dashboardPage.page.getByText('Bulk Coffee')).toBeVisible({ timeout: 15000 });
    await expect(dashboardPage.page.getByText('Bulk Snacks')).toBeVisible({ timeout: 15000 });
  });

  test('should edit a transaction', async ({ dashboardPage, journalEntryPage, page }) => {
    await dashboardPage.clickPlusButton();
    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('10.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Food T');
    await journalEntryPage.enterDescription('Coffee');
    await journalEntryPage.save();

    await dashboardPage.switchToActivity();
    await dashboardPage.clickTransaction('Coffee');

    await expect(page.getByTestId('edit-button')).toBeVisible();
    await page.getByTestId('edit-button').click();

    await journalEntryPage.enterAmount('12.50');
    await journalEntryPage.enterDescription('Coffee Edit');
    await journalEntryPage.save();

    await expect(page.getByText('Journal details')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Coffee Edit', { exact: true }).nth(1)).toBeVisible({
      timeout: 15000,
    });
  });

  test('should delete a transaction', async ({ dashboardPage, journalEntryPage, page }) => {
    await dashboardPage.clickPlusButton();
    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('100.00');
    await journalEntryPage.selectSourceAccount('Checking T');
    await journalEntryPage.selectDestinationAccount('Food T');
    await journalEntryPage.enterDescription('Groceries');
    await journalEntryPage.save();

    await dashboardPage.switchToActivity();
    await dashboardPage.clickTransaction('Groceries');

    await expect(page.getByTestId('delete-button')).toBeVisible();
    await page.getByTestId('delete-button').click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await dashboardPage.switchToActivity();
    await expect(dashboardPage.page.getByText('Groceries')).not.toBeVisible({ timeout: 15000 });
  });
});
