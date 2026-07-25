import { expect, Page } from '@playwright/test';

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

  async ensureAppShell() {
    const dashboardTab = this.page.getByRole('tab', { name: 'Dashboard', exact: true });
    if (!(await dashboardTab.isVisible().catch(() => false))) {
      await this.page.goto('/activity', { waitUntil: 'domcontentloaded' });
    }
    await expect(dashboardTab).toBeVisible({ timeout: 30000 });
  }

  async switchToActivity() {
    await this.ensureAppShell();
    await this.page.getByRole('tab', { name: 'Activity', exact: true }).click();
    const journalFab = this.page.getByRole('button', { name: /Open new entry options/i });
    await expect(journalFab).toBeVisible({ timeout: 45000 });
  }

  async switchToDashboard() {
    await this.ensureAppShell();
    await this.page.getByRole('tab', { name: 'Dashboard', exact: true }).click();
  }

  async clickPlusButton() {
    await this.switchToActivity();
    const journalFab = this.page.getByRole('button', { name: /Open new entry options/i });
    await expect(journalFab).toBeVisible({ timeout: 45000 });
    await journalFab.click({ force: true });
    await expect(this.page.getByPlaceholder('What is this journal entry for?')).toBeVisible({
      timeout: 30000,
    });
  }

  async selectAccount(accountName: string) {
    const selector = this.page.getByText(accountName, { exact: true });
    await selector.scrollIntoViewIfNeeded();
    await selector.click({ force: true });
  }

  async waitForNavigation(urlPattern: RegExp | string) {
    await this.page.waitForURL(urlPattern, { timeout: 1000 });
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
