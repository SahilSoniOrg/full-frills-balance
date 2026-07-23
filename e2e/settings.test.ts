import { test } from './fixtures';

test.describe('Settings and Maintenance', () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ onboardingPage, accountsPage, dashboardPage }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Settings User');

    // Create an account to reach the dashboard/tabs
    await accountsPage.navigateToCreation();
    await accountsPage.createAccount('Settings Check', 'Asset');

    // Now we should be on the proper authenticated screens
    await dashboardPage.switchToDashboard();
    await dashboardPage.assertWelcomeVisible('Settings User');
  });

  test('should reset the app from settings', async ({ page, settingsPage, onboardingPage }) => {
    await page.goto('/maintenance-settings');

    // Handle browser confirm dialog
    page.once('dialog', dialog => dialog.accept());

    await settingsPage.factoryReset();

    // Should be back at onboarding
    await onboardingPage.assertOnboardingStarted();
  });
});
