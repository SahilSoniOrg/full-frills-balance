import { expect, test } from './fixtures';

test.describe('Budgets', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ onboardingPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Budget User');
  });

  test('supports daily interval on the budget form', async ({ budgetsPage }) => {
    await budgetsPage.navigateFromCommitments();
    await budgetsPage.selectInterval('Daily');
    await budgetsPage.assertAmountLabel('Daily Amount');
    await budgetsPage.selectInterval('Monthly');
    await budgetsPage.assertAmountLabel('Monthly Amount');
  });

  test('creates a daily budget from commitments', async ({ budgetsPage, page }) => {
    await budgetsPage.createBudget({
      name: 'Daily Food',
      amount: '120',
      interval: 'Daily',
      categoryName: 'Food & Drink',
    });

    await expect(page).toHaveURL(/commitments/, { timeout: 15000 });
    await budgetsPage.assertBudgetVisible('Daily Food');
  });
});

test.describe('Safe to Spend copy', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ onboardingPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('STS Copy User');
  });

  test('explains projected gap when budgets use most of cash', async ({ dashboardPage }) => {
    await dashboardPage.switchToDashboard();
    await dashboardPage.openSafeToSpendExplanation();
    await dashboardPage.assertFullyBudgetedProjectedGapCopy();
  });
});
