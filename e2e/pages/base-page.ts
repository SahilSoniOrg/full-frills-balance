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
          }),
        );
      }
    });

    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(100);
  }

  async clickPlusButton() {
    const entryButton = this.page
      .getByTestId('fab-button')
      .or(this.page.getByRole('button', { name: 'New Entry', exact: true }));
    await entryButton.first().waitFor({ state: 'visible', timeout: 30000 });

    let fab = this.page.getByTestId('fab-button');
    if ((await fab.count()) > 0) {
      await fab.first().waitFor({ state: 'visible' });
      await fab.first().click();
      return;
    }

    fab = this.page.getByRole('button', { name: 'New Entry', exact: true }).first();
    if ((await fab.count()) > 0) {
      await fab.waitFor({ state: 'visible' });
      await fab.click({ force: true });
      return;
    }

    throw new Error('Could not find primary journal entry button');
  }

  async selectAccount(accountName: string) {
    const selector = this.page.getByText(accountName, { exact: true });
    await selector.scrollIntoViewIfNeeded();
    await selector.click({ force: true });
  }

  async waitForNavigation(urlPattern: RegExp | string) {
    await this.page.waitForURL(urlPattern, { timeout: 1000 });
  }

  async switchToDashboard() {
    await this.page.goto('/');
  }

  async switchToAccounts() {
    await this.page.goto('/accounts');
  }

  async switchToReports() {
    await this.page.goto('/reports');
  }

  async switchToSettings() {
    await this.page.goto('/settings');
  }

  async clickButton(text: string) {
    await this.page.getByRole('button', { name: text, exact: true }).click({ force: true });
  }
}
