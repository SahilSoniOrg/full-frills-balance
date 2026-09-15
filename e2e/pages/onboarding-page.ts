import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class OnboardingPage extends BasePage {
  async completeOnboarding(userName: string = 'Test User', currency: string = 'USD') {
    await this.assertOnboardingStarted();
    await this.fillName(userName);
    await this.clickGetStarted();
    await this.acknowledgePrivacyIfNeeded();
    await this.selectCurrency(currency);
    await this.clickGridContinue();
    await this.skipOptionalStep();
    await this.skipOptionalStep();
    await this.skipOptionalStep();
    await this.skipOptionalStep();
    await this.page.getByTestId('onboarding-continue-button').click({ force: true });
    await this.clickFinish();
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

  async clickGetStarted() {
    await this.page.getByTestId('onboarding-start').click({ force: true });
  }

  async acknowledgePrivacyIfNeeded() {
    const acknowledgePrivacy = this.page.getByRole('button', {
      name: 'Acknowledge & continue',
      exact: true,
    });
    try {
      await acknowledgePrivacy.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      return;
    }
    await acknowledgePrivacy.click({ force: true });
    await expect(acknowledgePrivacy).not.toBeVisible({ timeout: 10000 });
  }

  async clickContinue() {
    await this.page
      .getByTestId('onboarding-continue-button')
      .waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByTestId('onboarding-continue-button').click({ force: true });
  }

  async clickGridContinue() {
    await this.page
      .getByTestId('selectable-grid-continue-button')
      .waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByTestId('selectable-grid-continue-button').click({ force: true });
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

  async skipOptionalStep() {
    await this.page.getByTestId('onboarding-skip').waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByTestId('onboarding-skip').click({ force: true });
  }

  async clickFinish() {
    await this.page
      .getByTestId('onboarding-finish-button')
      .waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByTestId('onboarding-finish-button').click({ force: true });
  }
}
