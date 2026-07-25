import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class DashboardPage extends BasePage {
  async assertWelcomeVisible(userName: string) {
    await expect(this.page.getByText(`Hi, ${userName}!`)).toBeVisible({ timeout: 15000 });
  }

  async assertNetWorth(amount: string) {
    await expect(this.page.getByText(amount)).toBeVisible();
  }

  async clickTransaction(description: string) {
    await this.page.getByText(description).first().click();
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

  async search(query: string) {
    await this.page.getByPlaceholder(/Search/i).fill(query);
  }
}
