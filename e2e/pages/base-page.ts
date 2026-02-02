import { Page } from '@playwright/test';

export class BasePage {
    constructor(public readonly page: Page) {
        this.page.on('console', msg => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));
    }

    async goto(path: string = '/') {
        await this.page.goto(path);
    }

    async clearAppState() {
        await this.page.goto('/', { waitUntil: 'domcontentloaded' });

        await this.page.evaluate(async () => {
            localStorage.clear();
            sessionStorage.clear();

            if (window.indexedDB && window.indexedDB.databases) {
                const databases = await window.indexedDB.databases();
                await Promise.all(
                    databases.map(db => {
                        if (db.name) {
                            return new Promise<void>((resolve, reject) => {
                                const request = window.indexedDB.deleteDatabase(db.name!);
                                request.onsuccess = () => resolve();
                                request.onerror = () => reject(request.error);
                                request.onblocked = () => {
                                    console.warn(`Database ${db.name} deletion blocked`);
                                    resolve();
                                };
                            });
                        }
                        return Promise.resolve();
                    })
                );
            }
        });

        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(500);
    }

    async clickPlusButton() {
        let fab = this.page.getByTestId('fab-button').first();
        if (await fab.count() > 0) {
            await fab.waitFor({ state: 'visible' });
            await fab.click();
            return;
        }

        fab = this.page.getByText('+', { exact: true }).first();
        if (await fab.count() > 0) {
            await fab.waitFor({ state: 'visible' });
            await fab.click({ force: true });
            return;
        }

        throw new Error('Could not find FAB button');
    }

    async selectAccount(accountName: string) {
        const selector = this.page.getByText(accountName, { exact: true });
        await selector.scrollIntoViewIfNeeded();
        await selector.click({ force: true });
    }

    async waitForNavigation(timeout: number = 2000) {
        await this.page.waitForTimeout(timeout);
    }

    async switchToDashboard() {
        console.log('Current URL:', this.page.url());
        await this.page.locator('[role="tablist"]').getByText('Dashboard').click({ force: true });
    }

    async switchToAccounts() {
        await this.page.locator('[role="tablist"]').getByText('Accounts').click({ force: true });
    }

    async switchToReports() {
        await this.page.locator('[role="tablist"]').getByText('Reports').click({ force: true });
    }

    async switchToSettings() {
        await this.page.locator('[role="tablist"]').getByText('Settings').click({ force: true });
    }

    async clickButton(text: string) {
        await this.page.getByRole('button', { name: text, exact: true }).click({ force: true });
    }
}
