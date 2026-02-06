import { expect } from '@playwright/test';
import { BasePage } from './base-page';

export class OnboardingPage extends BasePage {
    async completeOnboarding(userName: string = 'Test User', currency: string = 'USD') {
        const welcome = this.page.getByText('Welcome to Balance');
        await welcome.waitFor({ state: 'visible', timeout: 3000 });

        // Step 1: Name
        await this.page.getByPlaceholder('Enter your name').fill(userName);
        await this.page.getByText('Continue', { exact: true }).click({ force: true });

        // Step 2: Currency
        await expect(this.page.getByText('Default Currency', { exact: true })).toBeVisible({ timeout: 2000 });
        await this.page.getByText(currency).first().click();
        await this.page.getByText('Continue').click({ force: true });

        // Step 3: Accounts
        await expect(this.page.getByText('Initial Accounts')).toBeVisible({ timeout: 2000 });
        await this.page.getByText('Continue').click({ force: true });

        // Step 4: Categories
        await expect(this.page.getByText('Initial Categories')).toBeVisible({ timeout: 2000 });
        await this.page.getByText('Continue').click({ force: true });

        // Step 5: Finalize
        await expect(this.page.getByText("All Ready!")).toBeVisible({ timeout: 2000 });
        await this.page.getByText("Let's Begin").click({ force: true });

        // Should redirect to accounts tab
        await expect(this.page).toHaveURL(/accounts$/);
    }

    async assertOnboardingStarted() {
        await expect(this.page.getByText('Welcome to Balance')).toBeVisible({ timeout: 1500 });
    }

    async fillName(name: string) {
        await this.page.getByPlaceholder('Enter your name').fill(name);
    }

    async clickContinue() {
        await this.page.getByText('Continue', { exact: true }).click();
    }

    async selectCurrency(currency: string) {
        await this.page.getByText(currency).first().click();
    }

    async clickGetStarted() {
        await this.page.getByText('Get Started').click();
    }
}
