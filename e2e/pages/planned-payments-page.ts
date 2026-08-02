import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class PlannedPaymentsPage extends BasePage {
  async openPlannedTab(opts?: { reload?: boolean }) {
    if (opts?.reload !== false) {
      await this.page.goto('/commitments', { waitUntil: 'domcontentloaded' });
    } else if (!this.page.url().includes('commitments')) {
      await this.page.getByRole('tab', { name: 'Commitments', exact: true }).last().click();
    }
    await this.page.getByRole('tab', { name: 'Planned', exact: true }).click();
    await expect(this.page.getByText('Recurring rules and upcoming posts.')).toBeVisible({
      timeout: 15000,
    });
  }

  async navigateToForm() {
    await this.openPlannedTab();
    await this.page.getByRole('button', { name: /Create a new planned payment/i }).click();
    await expect(this.page.getByTestId('hero-name-input')).toBeVisible({ timeout: 15000 });
  }

  async createPayment(
    name: string,
    amount: string,
    opts?: { fromAccount?: string; toAccount?: string },
  ) {
    await this.navigateToForm();
    await this.page.getByTestId('hero-name-input').fill(name);
    await this.page.getByTestId('hero-amount-input').fill(amount);

    if (opts?.fromAccount) {
      await this.page.getByTestId('planned-payment-from-account').click();
      await this.pickAccount(opts.fromAccount);
      await expect(this.page.getByTestId('planned-payment-from-account')).toContainText(
        opts.fromAccount,
        { timeout: 10000 },
      );
    }
    if (opts?.toAccount) {
      await this.page.getByTestId('planned-payment-to-account').click();
      await this.pickAccount(opts.toAccount);
      await expect(this.page.getByTestId('planned-payment-to-account')).toContainText(
        opts.toAccount,
        { timeout: 10000 },
      );
    }

    const save = this.page.getByTestId('submit-footer-button');
    await expect(save).toBeEnabled({ timeout: 15000 });
    await Promise.all([
      this.page.waitForURL(url => !url.pathname.includes('planned-payment-form'), {
        timeout: 30000,
      }),
      save.click(),
    ]);
  }

  private async pickAccount(accountName: string) {
    const search = this.page
      .getByTestId('account-picker-search-input')
      .or(this.page.getByPlaceholder('Search accounts...'));
    await expect(search.first()).toBeVisible({ timeout: 15000 });
    await search.first().click();
    await search.first().fill('');
    await search.first().pressSequentially(accountName, { delay: 30 });

    const option = this.page
      .getByTestId(/^account-picker-option-/)
      .filter({ hasText: accountName })
      .or(this.page.getByLabel(accountName, { exact: true }));
    await expect(option.first()).toBeVisible({ timeout: 15000 });
    await option.first().click();
    await expect(search.first()).not.toBeVisible({ timeout: 15000 });
  }

  async openPaymentDetails(name: string) {
    await this.openPlannedTab({ reload: false });
    await expect(this.page.getByText(name, { exact: true })).toBeVisible({ timeout: 20000 });
    await this.page.getByText(name, { exact: true }).first().click();
    await expect(this.page.getByText('Post Next Occurrence')).toBeVisible({ timeout: 15000 });
  }

  async postNextOccurrence() {
    await this.page.getByText('Post Next Occurrence').click();
    await this.page.getByRole('button', { name: 'Confirm', exact: true }).click();
  }

  async assertPaymentVisible(name: string) {
    // Prefer in-session tab switch — full reload can race Watermelon web hydration.
    await this.openPlannedTab({ reload: false });
    await expect(this.page.getByText(name, { exact: true })).toBeVisible({ timeout: 20000 });
  }
}
