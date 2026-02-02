import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class JournalEntryPage extends BasePage {
    async enterAmount(amount: string) {
        await this.page.getByTestId('amount-input').fill(amount);
    }

    async selectType(type: 'EXPENSE' | 'INCOME' | 'TRANSFER') {
        await this.page.getByText(type, { exact: true }).click();
    }

    async selectSourceAccount(accountName: string) {
        // Source account is usually the second one in Expense, first in Income/Transfer
        // But since they are horizontally scrollable lists, we can just find the text
        // and click it. SimpleForm uses renderAccountSelector.
        const account = this.page.getByText(accountName, { exact: true }).first();
        await account.click();
    }

    async selectDestinationAccount(accountName: string) {
        const account = this.page.getByText(accountName, { exact: true }).last();
        await account.click();
    }

    async enterDescription(description: string) {
        await this.page.getByTestId('description-input').fill(description);
    }

    async save() {
        await this.page.getByTestId('save-button').click();
    }

    async assertSaveDisabled() {
        await expect(this.page.getByTestId('save-button')).toBeDisabled();
    }
}
