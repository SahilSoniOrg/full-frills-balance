import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class PlannedPaymentsPage extends BasePage {
  async navigateToForm() {
    await this.page.goto('/planned-payment-form');
  }

  async createPayment(name: string, amount: string) {
    await this.navigateToForm();
    await this.page.getByTestId('hero-name-input').fill(name);
    await this.page.getByTestId('hero-amount-input').fill(amount);

    // Submit form
    await this.page.getByTestId('submit-footer-button').click({ force: true });
  }

  async assertPaymentVisible(name: string) {
    await expect(this.page.getByText(name, { exact: true })).toBeVisible();
  }
}
