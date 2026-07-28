import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export type BudgetInterval = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';

export class BudgetsPage extends BasePage {
  private async assertBudgetFormReady() {
    await expect(this.page).toHaveURL(/budget-edit/);
    await expect(this.page.getByRole('tab', { name: 'Daily' })).toBeVisible({ timeout: 30000 });
  }

  async navigateToForm() {
    await this.page.goto('/budget-edit', { waitUntil: 'domcontentloaded' });
    await this.assertBudgetFormReady();
  }

  async navigateFromCommitments() {
    await this.page.goto('/commitments', { waitUntil: 'domcontentloaded' });
    await expect(this.page.getByRole('tab', { name: 'Budgets' })).toBeVisible({
      timeout: 30000,
    });
    await this.page.getByRole('button', { name: 'Create a new budget' }).click();
    await this.assertBudgetFormReady();
  }

  async selectInterval(interval: BudgetInterval) {
    await this.page.getByRole('tab', { name: interval, exact: true }).click();
  }

  async assertAmountLabel(label: string) {
    const pattern = new RegExp(label.replace(/\s+/g, '\\s+'), 'i');
    await expect(this.page.getByText(pattern).first()).toBeVisible();
  }

  async selectTargetCategory(categoryName: string) {
    await this.page.getByText('Target Categories', { exact: true }).click();
    await expect(this.page.getByText('Select Target Categories')).toBeVisible({ timeout: 10000 });
    await this.page.getByText(categoryName, { exact: true }).click();
    await this.page.getByRole('button', { name: /Apply/i }).click();
  }

  async createBudget(options: {
    name: string;
    amount: string;
    interval: BudgetInterval;
    categoryName: string;
  }) {
    const { name, amount, interval, categoryName } = options;
    await this.navigateFromCommitments();
    await this.page.getByTestId('hero-name-input').fill(name);
    await this.page.getByTestId('hero-amount-input').fill(amount);
    await this.selectInterval(interval);
    await this.selectTargetCategory(categoryName);
    await this.page.getByTestId('submit-footer-button').click({ force: true });
  }

  async assertBudgetVisible(name: string) {
    await expect(this.page.getByText(name, { exact: true })).toBeVisible({ timeout: 15000 });
  }
}
