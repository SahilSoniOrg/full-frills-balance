import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class AccountsPage extends BasePage {
  private async waitForAccountsHydrated() {
    await expect
      .poll(
        async () => {
          const equitySection = await this.page
            .getByRole('button', { name: /Equity section/i })
            .isVisible()
            .catch(() => false);
          const assetsSection = await this.page
            .getByRole('button', { name: /Assets section/i })
            .isVisible()
            .catch(() => false);
          const fabVisible = await this.page
            .getByTestId('fab-button')
            .isVisible()
            .catch(() => false);
          const netWorthVisible = await this.page
            .getByText('Net Worth', { exact: true })
            .isVisible()
            .catch(() => false);
          return equitySection || assetsSection || fabVisible || netWorthVisible;
        },
        { timeout: 45000 },
      )
      .toBeTruthy();
  }

  private async openAccountsHub() {
    if (!this.page.url().includes('/accounts')) {
      await this.page.goto('/accounts', { waitUntil: 'domcontentloaded' });
    }
    await expect(this.page.getByTestId('onboarding-name-input')).not.toBeVisible({ timeout: 5000 });
    await this.waitForAccountsHydrated();
  }

  async navigateToCreation() {
    await this.openAccountsHub();
    await this.page.getByTestId('tab-item-accounts').click();
    const fab = this.page.getByTestId('fab-button');
    await fab.first().waitFor({ state: 'visible', timeout: 20000 });
    await fab.first().click();
  }

  async navigateToCategoryCreation(type: 'Income' | 'Expense') {
    await this.openAccountsHub();
    await this.page.getByTestId('tab-item-categories').click();
    await this.page.getByRole('button', { name: /Create a new category/i }).click();
    await expect(this.page).toHaveURL(/category-creation/);

    const typeId = type.toUpperCase();
    if (typeId !== 'EXPENSE') {
      await this.page.getByTestId(`account-type-option-${typeId}`).click();
    }
  }

  async createAccount(name: string, type: 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity') {
    const isCategory = type === 'Income' || type === 'Expense';

    if (isCategory) {
      if (!this.page.url().includes('category-creation')) {
        await this.navigateToCategoryCreation(type);
      }
    } else if (!this.page.url().includes('account-creation')) {
      await this.navigateToCreation();
    }

    await this.page.getByPlaceholder(/Account Name|e\.g\./i).waitFor({ state: 'visible' });
    await this.page.getByPlaceholder(/Account Name|e\.g\./i).fill(name);

    const typeId = type.toUpperCase();
    const defaultTypeId = isCategory ? (type === 'Income' ? 'INCOME' : 'EXPENSE') : 'ASSET';
    if (typeId !== defaultTypeId) {
      await this.page.getByTestId(`account-type-option-${typeId}`).click();
    }

    const saveButton = this.page.getByTestId('submit-footer-button');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(this.page.getByText(`"${name}" has been created successfully!`)).toBeVisible({
      timeout: 20000,
    });

    await expect(this.page).not.toHaveURL(/account-creation|category-creation/, { timeout: 20000 });

    await this.ensureOnAccountsList(isCategory);
    await this.assertAccountVisible(name);
  }

  private async ensureOnAccountsList(isCategory: boolean) {
    await expect(this.page).not.toHaveURL(/account-creation|category-creation/, { timeout: 20000 });

    if (!this.page.url().includes('/accounts')) {
      await this.page.getByRole('tab', { name: 'Accounts', exact: true }).last().click();
      await this.openAccountsHub();
    } else {
      await expect(this.page.getByTestId('onboarding-name-input')).not.toBeVisible({
        timeout: 5000,
      });
    }

    const hubTab = isCategory
      ? this.page.getByTestId('tab-item-categories')
      : this.page.getByTestId('tab-item-accounts');
    await hubTab.waitFor({ state: 'visible', timeout: 20000 });
    await hubTab.click();
  }

  async assertAccountVisible(name: string) {
    await expect
      .poll(
        async () => {
          let count = await this.page.getByText(name, { exact: true }).count();
          if (count === 0) {
            const assetsSection = this.page.getByRole('button', { name: /Assets section/i });
            if ((await assetsSection.count()) > 0) {
              await assetsSection.first().click();
              count = await this.page.getByText(name, { exact: true }).count();
            }
            const expenseSection = this.page.getByRole('button', { name: /Expense section/i });
            if (count === 0 && (await expenseSection.count()) > 0) {
              await expenseSection.first().click();
              count = await this.page.getByText(name, { exact: true }).count();
            }
          }
          return count;
        },
        { timeout: 45000 },
      )
      .toBeGreaterThan(0);

    // RN-web list rows can be in the accessibility tree but report as "not visible"
    // for scrollIntoView; attached + count is enough for list presence.
    await expect(this.page.getByText(name, { exact: true }).first()).toBeAttached();
  }

  async clickAccount(name: string) {
    await this.page.getByText(name, { exact: true }).click();
  }

  async editAccount(newName: string) {
    await expect(this.page.getByTestId('edit-button')).toBeVisible();
    await this.page.getByTestId('edit-button').click();

    await this.page.getByPlaceholder(/Account Name|e\.g\./i).fill(newName);
    const saveButton = this.page.getByTestId('submit-footer-button');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(this.page.getByText(`"${newName}" has been updated successfully!`)).toBeVisible({
      timeout: 20000,
    });
  }

  async deleteAccount(confirmationName: string) {
    await expect(this.page.getByTestId('delete-button')).toBeVisible();

    await this.page.getByTestId('delete-button').click();
    await this.page.getByPlaceholder(confirmationName).fill(confirmationName);
    await this.page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(this.page).toHaveURL(/\/accounts/, { timeout: 20000 });
  }

  /** Undo account soft-delete via the success toast action. */
  async undoDeleteFromToast() {
    await expect(this.page.getByText('Account has been deleted.')).toBeVisible({ timeout: 10000 });
    await this.page.getByText('UNDO', { exact: true }).click();
    await expect(this.page.getByText('Account restored.')).toBeVisible({ timeout: 10000 });
    // Soft-delete UI can leave the list stale; reopen hub before asserting restore.
    await this.openAccountsHub();
  }

  async save() {
    await this.assertSaveEnabled();
    await this.page.getByTestId('submit-footer-button').click();
  }

  async delete() {
    await this.page.getByTestId('delete-button').click();
  }

  async assertSaveDisabled() {
    await expect(this.page.getByTestId('submit-footer-button')).toBeDisabled();
  }

  async assertSaveEnabled() {
    await expect(this.page.getByTestId('submit-footer-button')).toBeEnabled();
  }

  async assertTransactionVisible(description: string, amount: string) {
    await expect(this.page.getByText(description)).toBeVisible();
    await expect(this.page.getByText(amount)).toBeVisible();
  }

  getJournalEntryCard(description: string) {
    const title = this.page
      .getByTestId('journal-entry-card-title')
      .filter({ hasText: description });
    return this.page.getByTestId('journal-entry-card').filter({ has: title });
  }

  async assertTransactionAccountBadges(description: string, expectedBadgeTexts: string[]) {
    const card = this.getJournalEntryCard(description);
    await expect.poll(async () => await card.count(), { timeout: 30000 }).toBeGreaterThan(0);
    await expect(card).toBeVisible();
    for (const text of expectedBadgeTexts) {
      await expect(
        card.getByTestId('transaction-account-badge').filter({ hasText: text }),
      ).toBeVisible();
    }
  }
}
