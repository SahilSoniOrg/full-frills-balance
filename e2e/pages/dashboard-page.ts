import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class DashboardPage extends BasePage {
  async assertWelcomeVisible(userName: string) {
    await expect(this.page.getByText(/Safe to Spend|Projected Gap/i).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(this.page.getByText(`Hi, ${userName}`)).toBeVisible({ timeout: 15000 });
  }

  async openSafeToSpendExplanation() {
    await this.switchToDashboard();
    await this.page.getByLabel('Open safe-to-spend calculation info').click();
    await expect(this.page.getByText('How Safe to Spend Is Calculated')).toBeVisible({
      timeout: 15000,
    });
  }

  async assertFullyBudgetedProjectedGapCopy() {
    await expect(
      this.page.getByText(/projected gap even when your accounts are not overdrawn/i),
    ).toBeVisible();
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
    await this.switchToActivity();
    await expect
      .poll(
        async () => {
          const card = this.getTransactionCard(description);
          const count = await card.count();
          if (count === 0) {
            await this.page
              .getByText(description, { exact: true })
              .scrollIntoViewIfNeeded()
              .catch(() => {});
          }
          return await card.count();
        },
        { timeout: 30000 },
      )
      .toBeGreaterThan(0);

    const card = this.getTransactionCard(description);
    await expect(card).toBeVisible();
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
