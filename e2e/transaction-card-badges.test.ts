import { expect, test } from './fixtures';

test.describe('Transaction card account badges', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ onboardingPage, accountsPage, dashboardPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Badge User');

    await accountsPage.createAccount('Checking Badge', 'Asset');
    await accountsPage.createAccount('Food Badge', 'Expense');
  });

  test('journal list shows from/to account badges on transaction cards', async ({
    dashboardPage,
    journalEntryPage,
  }) => {
    await dashboardPage.clickPlusButton();

    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('42.00');
    await journalEntryPage.selectSourceAccount('Checking Badge');
    await journalEntryPage.selectDestinationAccount('Food Badge');
    await journalEntryPage.enterDescription('Badge Lunch');
    await journalEntryPage.save();

    await dashboardPage.assertTransactionAccountBadges('Badge Lunch', [
      'From: Checking Badge',
      'To: Food Badge',
    ]);
  });

  test.fixme('account ledger shows counterparty badges without from/to prefixes', async ({
    dashboardPage,
    journalEntryPage,
    accountsPage,
  }) => {
    await dashboardPage.clickPlusButton();

    await journalEntryPage.selectType('EXPENSE');
    await journalEntryPage.enterAmount('18.50');
    await journalEntryPage.selectSourceAccount('Checking Badge');
    await journalEntryPage.selectDestinationAccount('Food Badge');
    await journalEntryPage.enterDescription('Badge Snack');
    await journalEntryPage.save();

    await accountsPage.switchToAccounts();
    await accountsPage.clickAccount('Checking Badge');
    await accountsPage.page.reload({ waitUntil: 'domcontentloaded' });
    await accountsPage.assertAccountVisible('Checking Badge');

    await expect
      .poll(async () => accountsPage.getTransactionCard('Badge Snack').count(), {
        timeout: 90000,
      })
      .toBeGreaterThan(0);

    await accountsPage.assertTransactionAccountBadges('Badge Snack', ['Food Badge']);

    const card = accountsPage.getTransactionCard('Badge Snack');
    await expect(
      card.getByTestId('transaction-account-badge').filter({ hasText: 'Checking Badge' }),
    ).toHaveCount(0);
  });
});
