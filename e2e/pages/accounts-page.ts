import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class AccountsPage extends BasePage {
    async navigateToCreation() {
        if (!this.page.url().endsWith('/account-creation')) {
            console.log('Switching to accounts');
            console.log(this.page.url());
            await this.switchToAccounts();
        }
        const bottomAction = this.page.getByRole('button', { name: 'New Account', exact: true });
        if (await bottomAction.count() > 0) {
            await bottomAction.first().waitFor({ state: 'visible' });
            await bottomAction.first().click();
            return;
        }
        throw new Error('Could not find New Account entry button');
    }

    async createAccount(name: string, type: 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity') {
        await this.page.getByPlaceholder(/Account Name|e\.g\./i).fill(name);
        await this.page.getByTestId(`account-type-option-${type.toUpperCase()}`).click();
        await this.page.getByText(/Create Account|Save Changes/i).click();
        await this.assertAccountVisible(name); // Wait for navigation and success
    }

    async assertAccountVisible(name: string) {
        await expect(this.page.getByText(name, { exact: true })).toBeVisible();
    }

    async clickAccount(name: string) {
        await this.page.getByText(name, { exact: true }).click();
    }

    async editAccount(newName: string) {
        // Wait for the edit button to be visible (we assume we are on details page)
        await expect(this.page.getByTestId('edit-button')).toBeVisible();
        await this.page.getByTestId('edit-button').click();

        // Now on creation/edit screen
        await this.page.getByPlaceholder(/Account Name|e\.g\./i).fill(newName);
        await this.save();
    }

    async deleteAccount() {
        // Wait for delete button
        await expect(this.page.getByTestId('delete-button')).toBeVisible();

        // Handle dialog
        this.page.once('dialog', dialog => dialog.accept());

        await this.page.getByTestId('delete-button').click();

        // Wait for navigation back to list
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
