import { expect, test } from './fixtures';

test.describe('Planned Payments & Commitments', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ onboardingPage, accountsPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Commitments User');

    await accountsPage.createAccount('Checking Account', 'Asset');
  });

  test('should create a planned payment rule', async ({ plannedPaymentsPage }) => {
    await plannedPaymentsPage.createPayment('Monthly Rent', '1500', {
      fromAccount: 'Checking Account',
      // Use onboarding system equity account — always present in the picker.
      toAccount: 'Opening Balances (USD)',
    });

    await plannedPaymentsPage.assertPaymentVisible('Monthly Rent');
  });

  test('should post the next planned payment occurrence', async ({
    plannedPaymentsPage,
    dashboardPage,
    page,
  }) => {
    await plannedPaymentsPage.createPayment('Utilities Due', '85.00', {
      fromAccount: 'Checking Account',
      toAccount: 'Opening Balances (USD)',
    });

    await plannedPaymentsPage.openPaymentDetails('Utilities Due');
    await plannedPaymentsPage.postNextOccurrence();

    await dashboardPage.switchToActivity();
    await expect(
      page.getByTestId('journal-entry-card-title').filter({ hasText: 'Utilities Due' }),
    ).toBeVisible({
      timeout: 20000,
    });
  });
});
