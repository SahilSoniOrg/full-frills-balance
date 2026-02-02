import { test as base } from '@playwright/test';
import { AccountsPage } from './pages/accounts-page';
import { DashboardPage } from './pages/dashboard-page';
import { JournalEntryPage } from './pages/journal-entry-page';
import { OnboardingPage } from './pages/onboarding-page';
import { SettingsPage } from './pages/settings-page';

type MyFixtures = {
    onboardingPage: OnboardingPage;
    accountsPage: AccountsPage;
    dashboardPage: DashboardPage;
    journalEntryPage: JournalEntryPage;
    settingsPage: SettingsPage;
};

export const test = base.extend<MyFixtures>({
    onboardingPage: async ({ page }, use) => {
        await use(new OnboardingPage(page));
    },
    accountsPage: async ({ page }, use) => {
        await use(new AccountsPage(page));
    },
    dashboardPage: async ({ page }, use) => {
        await use(new DashboardPage(page));
    },
    journalEntryPage: async ({ page }, use) => {
        await use(new JournalEntryPage(page));
    },
    settingsPage: async ({ page }, use) => {
        await use(new SettingsPage(page));
    },
});

export { expect } from '@playwright/test';
