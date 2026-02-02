import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class DashboardPage extends BasePage {
    async assertWelcomeVisible(userName: string) {
        await expect(this.page.getByText(/Hello,.*!/)).toBeVisible({ timeout: 15000 });
    }

    async assertNetWorth(amount: string) {
        await expect(this.page.getByText(amount)).toBeVisible();
    }

    async clickTransaction(description: string) {
        await this.page.getByText(description).first().click();
    }

    async search(query: string) {
        await this.page.getByPlaceholder(/Search/i).fill(query);
    }
}
