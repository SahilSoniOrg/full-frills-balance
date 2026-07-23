import { expect, test } from './fixtures';

test.describe('Basic Onboarding', () => {
  test.beforeEach(async ({ onboardingPage }) => {
    await onboardingPage.clearAppState();
  });

  test('should complete onboarding flow', async ({ onboardingPage }) => {
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Basic User', 'USD');

    // Should land on main application screen
    await expect(
      onboardingPage.page.getByText(/Accounts|Dashboard|Safe to Spend/i).first(),
    ).toBeVisible({ timeout: 15000 });
  });
});
