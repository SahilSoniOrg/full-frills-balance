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

  async navigateToCategoryCreation(type: 'Income' | 'Expense') {
    await this.page.goto(`/category-creation?type=${type.toLowerCase()}`);
  }

  async createAccount(name: string, type: 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity') {
    if (type === 'Income' || type === 'Expense') {
      await this.navigateToCategoryCreation(type);
    } else {
      await this.navigateToCreation();
    }

    await this.page.getByPlaceholder(/Account Name|e\.g\./i).waitFor({ state: 'visible' });
    await this.page.getByPlaceholder(/Account Name|e\.g\./i).fill(name);

    const typeId = type.toUpperCase();
    const isCategory = type === 'Income' || type === 'Expense';
    const defaultTypeId = isCategory ? (type === 'Income' ? 'INCOME' : 'EXPENSE') : 'ASSET';
    if (typeId !== defaultTypeId) {
      await this.page.getByTestId(`account-type-option-${typeId}`).click();
    }

    const saveButton = this.page.getByTestId('submit-footer-button');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await this.switchToAccounts();

    if (isCategory) {
      await this.page.getByTestId('tab-item-categories').click();
    } else {
      await this.page.getByTestId('tab-item-accounts').click();
      const assetsSection = this.page.getByRole('button', { name: /Assets section/i });
      if (await assetsSection.isVisible()) {
        await assetsSection.click();
      }
    }
    await this.assertAccountVisible(name);
  }

  async assertAccountVisible(name: string) {
    const locator = this.page.getByText(name, { exact: true });
    await locator.scrollIntoViewIfNeeded();
    await expect(locator).toBeVisible({ timeout: 30000 });
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

  getTransactionCard(description: string) {
    const title = this.page.getByTestId('transaction-card-title').filter({ hasText: description });
    return this.page.getByTestId('transaction-card').filter({ has: title });
  }

  async assertTransactionAccountBadges(description: string, expectedBadgeTexts: string[]) {
    const card = this.getTransactionCard(description);
    await expect(card).toBeVisible({ timeout: 15000 });
    for (const text of expectedBadgeTexts) {
      await expect(
        card.getByTestId('transaction-account-badge').filter({ hasText: text }),
      ).toBeVisible();
    }
  }
}
