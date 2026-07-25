import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class JournalEntryPage extends BasePage {
  async enterAmount(amount: string) {
    await this.page.getByTestId('amount-input').fill(amount);
  }

  async selectType(type: 'EXPENSE' | 'INCOME' | 'TRANSFER') {
    const label = type === 'EXPENSE' ? 'Expense' : type === 'INCOME' ? 'Income' : 'Transfer';
    await this.page.getByRole('tab', { name: label, exact: true }).click();
  }

  async selectSourceAccount(accountName: string) {
    if (await this.page.getByText('Source Account', { exact: true }).isVisible()) {
      await this.selectAccountFromQuickPickOrBrowse(accountName, 'Source Account', 0);
      return;
    }
    if (await this.page.getByText('From Account', { exact: true }).isVisible()) {
      await this.selectAccountFromQuickPickOrBrowse(accountName, 'From Account', 0);
      return;
    }
    await this.selectAccountFromQuickPickOrBrowse(accountName, 'From Category', 0);
  }

  async selectDestinationAccount(accountName: string) {
    if (await this.page.getByText('Destination Account', { exact: true }).isVisible()) {
      await this.selectAccountFromQuickPickOrBrowse(accountName, 'Destination Account', 1);
      return;
    }
    if (await this.page.getByText('To Category', { exact: true }).isVisible()) {
      await this.selectAccountFromQuickPickOrBrowse(accountName, 'To Category', 0);
      return;
    }
    await this.selectAccountFromQuickPickOrBrowse(accountName, 'To Account', 1);
  }

  private async selectAccountFromQuickPickOrBrowse(
    accountName: string,
    sectionLabel: string,
    browseAllIndex: number,
  ) {
    const tile = this.page
      .locator('[data-testid^="account-option-"]')
      .filter({ hasText: accountName });
    if ((await tile.count()) > 0) {
      await tile.first().click();
      return;
    }

    const sectionHeader = this.page.getByText(sectionLabel, { exact: true });
    if (await sectionHeader.isVisible()) {
      await sectionHeader.scrollIntoViewIfNeeded();
      const row = sectionHeader.locator('xpath=..');
      const browseInRow = row.getByText('Browse all', { exact: true });
      if ((await browseInRow.count()) > 0) {
        await browseInRow.click();
      } else {
        await this.page.getByText('Browse all', { exact: true }).nth(browseAllIndex).click();
      }
    } else {
      await this.page.getByText('Browse all', { exact: true }).nth(browseAllIndex).click();
    }

    const search = this.page.getByPlaceholder('Search accounts...');
    if (await search.isVisible()) {
      await search.fill(accountName);
    }

    const dialog = this.page.getByRole('dialog');
    const accountOption = dialog
      .locator('[cursor=pointer]')
      .filter({ hasText: accountName })
      .or(dialog.getByRole('button', { name: new RegExp(accountName) }))
      .or(dialog.getByText(accountName, { exact: true }));
    await accountOption.first().click();
  }

  async enterDescription(description: string) {
    await this.page.getByPlaceholder('What is this journal entry for?').fill(description);
  }

  async save() {
    await expect
      .poll(async () => !(await this.page.getByTestId('submit-footer-button').isDisabled()), {
        timeout: 30000,
      })
      .toBeTruthy();
    await this.page.getByTestId('submit-footer-button').click();
    await expect(this.page.getByPlaceholder('What is this journal entry for?')).not.toBeVisible({
      timeout: 30000,
    });
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
}
