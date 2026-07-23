import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class AccountsPage extends BasePage {
  async navigateToCreation() {
    if (!this.page.url().includes('/accounts')) {
      await this.switchToAccounts();
    }
    const fab = this.page.getByTestId('fab-button');
    if ((await fab.count()) > 0) {
      await fab.first().waitFor({ state: 'visible' });
      await fab.first().click();
      return;
    }
    await this.page.goto('/account-creation');
  }

  async createAccount(name: string, type: 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity') {
    await this.page.getByPlaceholder(/Account Name|e\.g\./i).fill(name);
    await this.page.getByTestId(`account-type-option-${type.toUpperCase()}`).click();
    await this.page.getByText(/Create Account|Save Changes/i).click();
    if (!this.page.url().includes('/accounts')) {
      await this.switchToAccounts();
    }
    await this.assertAccountVisible(name);
  }

  async assertAccountVisible(name: string) {
    await expect(this.page.getByText(name, { exact: true })).toBeVisible();
  }

  async clickAccount(name: string) {
    await this.page.getByText(name, { exact: true }).click();
  }

  async editAccount(newName: string) {
    await expect(this.page.getByTestId('edit-button')).toBeVisible();
    await this.page.getByTestId('edit-button').click();

    await this.page.getByPlaceholder(/Account Name|e\.g\./i).fill(newName);
    await this.save();
  }

  async deleteAccount() {
    await expect(this.page.getByTestId('delete-button')).toBeVisible();

    this.page.once('dialog', dialog => dialog.accept());

    await this.page.getByTestId('delete-button').click();

    await expect(this.page).toHaveURL(/\/accounts$/);
  }

  async save() {
    await this.assertSaveEnabled();
    await this.page.getByTestId('save-button').click();
  }

  async delete() {
    await this.page.getByTestId('delete-button').click();
  }

  async assertSaveDisabled() {
    await expect(this.page.getByTestId('save-button')).toBeDisabled();
  }

  async assertSaveEnabled() {
    await expect(this.page.getByTestId('save-button')).toBeEnabled();
  }

  async assertTransactionVisible(description: string, amount: string) {
    await expect(this.page.getByText(description)).toBeVisible();
    await expect(this.page.getByText(amount)).toBeVisible();
  }
}
