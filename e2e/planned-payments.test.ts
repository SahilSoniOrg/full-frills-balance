import { expect, test } from './fixtures';

test.describe('Planned Payments & Commitments', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ onboardingPage, accountsPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Commitments User');

    // Create accounts needed for planned payment
    await accountsPage.navigateToCreation();
    await accountsPage.createAccount('Checking Account', 'Asset');
    await accountsPage.navigateToCreation();
    await accountsPage.createAccount('Landlord', 'Expense');
  });

  test('should create a planned payment rule', async ({ plannedPaymentsPage, page }) => {
    await plannedPaymentsPage.createPayment('Monthly Rent', '1500');

    // Should return to planned payments list or commitments screen
    await expect(page.getByText('Monthly Rent')).toBeVisible({ timeout: 15000 });
  });
});
