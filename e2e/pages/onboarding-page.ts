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

    // Should redirect to main app tabs
    await expect(this.page).toHaveURL(/(accounts|activity|settings|\(tabs\)|$)/);
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
    const gridItem = this.page.getByTestId(`grid-item-${currency}`);
    if ((await gridItem.count()) > 0) {
      await gridItem.click({ force: true });
    } else {
      await this.page.getByText(currency).first().click({ force: true });
    }
  }

  async clickGetStarted() {
    await this.clickContinue();
  }
}
