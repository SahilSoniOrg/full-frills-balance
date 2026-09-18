import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class JournalEntryPage extends BasePage {
  async enterAmount(amount: string) {
    const amountButton = this.page.getByTestId('amount-input');
    const expression = this.page.getByRole('textbox', { name: /^Expression/ });
    if (!(await expression.isVisible().catch(() => false))) {
      await amountButton.click();
    }
    await expression.fill(amount);
    await this.page.getByTestId('amount-calculator-done').click();
  }

  async selectType(type: 'EXPENSE' | 'INCOME' | 'TRANSFER') {
    const fabAction = this.page.getByTestId(`journal-entry-fab-${type.toLowerCase()}`);
    if (await fabAction.isVisible().catch(() => false)) {
      await fabAction.click();
      await expect(this.page.getByTestId('journal-entry-screen')).toBeVisible({
        timeout: 30000,
      });
      return;
    }

    // New simple entries open the calculator immediately. Dismiss it only when
    // a test explicitly needs to change the default expense type first.
    const initialCalculator = this.page.getByTestId('amount-calculator-display');
    if (await initialCalculator.isVisible().catch(() => false)) {
      await this.page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }

    const label = type === 'EXPENSE' ? 'Expense' : type === 'INCOME' ? 'Income' : 'Transfer';
    await this.page.getByRole('tab', { name: label, exact: true }).click();
  }

  async switchMode(
    mode: 'Basic' | 'Allocate' | 'Expert' | 'Batch' | 'Simple' | 'Split' | 'Advanced' | 'Bulk',
  ) {
    const defaultFabAction = this.page.getByTestId('journal-entry-fab-expense');
    if (await defaultFabAction.isVisible().catch(() => false)) {
      await defaultFabAction.click();
      await expect(this.page.getByTestId('journal-entry-screen')).toBeVisible({
        timeout: 30000,
      });
    }

    const initialCalculator = this.page.getByTestId('amount-calculator-display');
    if (await initialCalculator.isVisible().catch(() => false)) {
      await this.page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }

    const normalized =
      mode === 'Simple'
        ? 'Basic'
        : mode === 'Split'
          ? 'Allocate'
          : mode === 'Advanced'
            ? 'Expert'
            : mode;
    if (normalized === 'Batch' || normalized === 'Bulk') {
      await this.page.getByRole('button', { name: 'Open batch workspace' }).click();
      return;
    }

    await this.page.getByRole('button', { name: /Detail level:/ }).click();
    await this.page.getByText(normalized, { exact: true }).click();
  }

  async selectSourceAccount(accountName: string) {
    if (await this.page.getByText('Source Account', { exact: true }).isVisible()) {
      await this.selectAccountFromQuickPickOrBrowse(accountName, 'Source Account');
      return;
    }
    if (await this.page.getByText('From Account', { exact: true }).isVisible()) {
      await this.selectAccountFromQuickPickOrBrowse(accountName, 'From Account');
      return;
    }
    await this.selectAccountFromQuickPickOrBrowse(accountName, 'From Category');
  }

  async selectDestinationAccount(accountName: string) {
    if (await this.page.getByText('Destination Account', { exact: true }).isVisible()) {
      await this.selectAccountFromQuickPickOrBrowse(accountName, 'Destination Account');
      return;
    }
    if (await this.page.getByText('To Category', { exact: true }).isVisible()) {
      await this.selectAccountFromQuickPickOrBrowse(accountName, 'To Category');
      return;
    }
    await this.selectAccountFromQuickPickOrBrowse(accountName, 'To Account');
  }

  /**
   * Scope picks to the named section. Transfer shows the same account names in
   * both Source and Destination quick-picks; a global first() click would select
   * the source tile when intending destination.
   */
  private async selectAccountFromQuickPickOrBrowse(accountName: string, sectionLabel: string) {
    const section = this.page
      .locator('div')
      .filter({ has: this.page.getByText(sectionLabel, { exact: true }) })
      .filter({ has: this.page.getByText('Browse all', { exact: true }) })
      .last();

    await expect(section).toBeVisible({ timeout: 15000 });

    const visibleAccount = this.page.getByText(accountName, { exact: true });
    if ((await visibleAccount.count()) > 0) {
      await visibleAccount.last().click({ force: true });
      return;
    }

    const quickPick = section.getByText(accountName, { exact: true });
    if ((await quickPick.count()) > 0) {
      await quickPick.first().click({ force: true });
      return;
    }

    await section.getByText('Browse all', { exact: true }).click({ force: true });
    await this.pickAccountFromDialog(accountName);
  }

  /**
   * Advanced lines use stable ids "1", "2", … from useJournalEditorLineState.
   */
  async selectAdvancedLineAccount(lineNumber: number, accountName: string) {
    await this.page.getByTestId(`advanced-account-${lineNumber}`).click();
    await this.pickAccountFromDialog(accountName);
  }

  async enterAdvancedLineAmount(lineNumber: number, amount: string) {
    await this.page.getByTestId(`amount-input-${lineNumber}`).fill(amount);
  }

  async setAdvancedLineType(lineNumber: number, type: 'DEBIT' | 'CREDIT') {
    const testId = type === 'DEBIT' ? `advanced-dr-${lineNumber}` : `advanced-cr-${lineNumber}`;
    await this.page.getByTestId(testId).click();
  }

  async addAdvancedLine() {
    await this.page.getByRole('button', { name: 'Add line', exact: true }).click();
  }

  async fillBulkRow(
    rowIndex: number,
    opts: { description: string; amount: string; source: string; destination: string },
  ) {
    const description = this.page.locator('[data-testid^="bulk-description-"]').nth(rowIndex);
    const source = this.page.locator('[data-testid^="bulk-source-"]').nth(rowIndex);
    const destination = this.page.locator('[data-testid^="bulk-destination-"]').nth(rowIndex);
    await expect(description).toBeVisible({ timeout: 15000 });
    await description.fill(opts.description);
    await this.page
      .locator('[data-testid^="bulk-amount-"][data-testid$="-calculator"]')
      .nth(rowIndex)
      .click({ force: true });
    await this.page.getByRole('textbox', { name: /^Expression/ }).fill(opts.amount);
    await this.page.getByTestId('amount-calculator-done').click();
    await source.click();
    await this.pickAccountFromDialog(opts.source);
    await destination.click();
    await this.pickAccountFromDialog(opts.destination);
  }

  private async pickAccountFromDialog(accountName: string) {
    const search = this.page
      .getByTestId('account-picker-search-input')
      .or(this.page.getByPlaceholder('Search accounts...'));
    await expect(search.first()).toBeVisible({ timeout: 15000 });
    await search.first().fill('');
    await search.first().pressSequentially(accountName, { delay: 20 });

    const option = this.page
      .getByTestId(/^account-picker-option-/)
      .filter({ hasText: accountName })
      .or(this.page.getByRole('button', { name: accountName, exact: true }));
    await expect(option.first()).toBeVisible({ timeout: 15000 });
    await option.first().click({ force: true });
    await expect(search.first()).not.toBeVisible({ timeout: 15000 });
  }

  async finishBulkSave() {
    await expect(this.page.getByText('Saved Successfully')).toBeVisible({ timeout: 30000 });
    await this.page.getByRole('button', { name: 'Done', exact: true }).click();
  }

  async enterDescription(description: string) {
    await this.page.getByTestId('journal-description-input').fill(description);
  }

  async save() {
    await expect
      .poll(async () => !(await this.page.getByTestId('submit-footer-button').isDisabled()), {
        timeout: 30000,
      })
      .toBeTruthy();
    await this.page.getByTestId('submit-footer-button').click();
    await expect(this.page.getByTestId('journal-entry-screen')).not.toBeVisible({
      timeout: 30000,
    });
  }

  async saveBulk() {
    await expect
      .poll(async () => !(await this.page.getByTestId('submit-footer-button').isDisabled()), {
        timeout: 30000,
      })
      .toBeTruthy();
    await this.page.getByTestId('submit-footer-button').click();
    await this.finishBulkSave();
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
