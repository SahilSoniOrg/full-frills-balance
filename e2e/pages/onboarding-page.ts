import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class OnboardingPage extends BasePage {
  async completeOnboarding(userName: string = 'Test User', currency: string = 'USD') {
    await this.assertOnboardingStarted();

    // Step 1: Splash / Name
    await this.fillName(userName);
    await this.clickContinue();

    // Step 2: Currency
    await this.selectCurrency(currency);
    await this.clickGridContinue();

    // Step 3: Accounts
    await this.clickGridContinue();

    // Step 4: Categories
    await this.clickGridContinue();

    // Step 5: Appearance Theme
    await this.clickThemeContinue();

    // Step 6: Finalize
    await this.clickFinish();

    // Setup publication is asynchronous; do not let callers race the first
    // account navigation against the workplace becoming active.
    await expect(this.page.getByRole('tab', { name: 'Dashboard', exact: true })).toBeVisible({
      timeout: 30000,
    });
  }

  async assertOnboardingStarted() {
    const nameInput = this.page.getByTestId('onboarding-name-input');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
  }

  async fillName(name: string) {
    await this.page.getByTestId('onboarding-name-input').fill(name);
  }

  async clickContinue() {
    await this.page.getByTestId('onboarding-continue-button').click({ force: true });

    // The first continue click opens the privacy sheet when acknowledgement is
    // missing; acknowledging it resumes the pending onboarding action.
    const acknowledgePrivacy = this.page.getByRole('button', {
      name: 'Acknowledge & continue',
      exact: true,
    });
    try {
      await acknowledgePrivacy.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // Privacy is already acknowledged in this browser profile.
      return;
    }

    await acknowledgePrivacy.click({ force: true });
    await expect(acknowledgePrivacy).not.toBeVisible({ timeout: 10000 });
  }

  async clickGridContinue() {
    await this.page
      .getByTestId('selectable-grid-continue-button')
      .waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByTestId('selectable-grid-continue-button').click({ force: true });
  }

  async clickThemeContinue() {
    await this.page
      .getByTestId('onboarding-theme-continue-button')
      .waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByTestId('onboarding-theme-continue-button').click({ force: true });
  }

  async clickFinish() {
    await this.page
      .getByTestId('onboarding-finish-button')
      .waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByTestId('onboarding-finish-button').click({ force: true });
  }

  async selectCurrency(currency: string) {
    const selectedOption = this.page.getByRole('button', {
      name: `${currency}, selected`,
      exact: true,
    });
    if ((await selectedOption.count()) > 0) return;

    await this.page
      .getByRole('button', { name: `${currency}, not selected`, exact: true })
      .click({ force: true });
  }

  async clickGetStarted() {
    await this.clickContinue();
  }
}
