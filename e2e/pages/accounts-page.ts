import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class AccountsPage extends BasePage {
    async navigateToCreation() {
        await this.page.goto('/account-creation');
    }

    async createAccount(name: string, type: 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity') {
        await this.page.getByPlaceholder(/Account Name|e\.g\./i).fill(name);
        await this.page.getByText(type, { exact: true }).click();
        await this.page.getByText(/Create Account|Save Changes/i).click();
        await this.assertAccountVisible(name); // Wait for navigation and success
    }

    async assertAccountVisible(name: string) {
        await expect(this.page).toHaveURL(/\/accounts$/);
        // Also check for the name in the list, making sure it's not an input value if possible, 
        // but URL check is the strongest guarantee we left the form.
        await expect(this.page.getByText(name, { exact: true })).toBeVisible({ timeout: 15000 });
    }
}
