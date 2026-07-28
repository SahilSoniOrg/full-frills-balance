/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from '@playwright/test';
import { AccountsPage } from './pages/accounts-page';
import { BudgetsPage } from './pages/budgets-page';
import { DashboardPage } from './pages/dashboard-page';
import { JournalEntryPage } from './pages/journal-entry-page';
import { OnboardingPage } from './pages/onboarding-page';
import { PlannedPaymentsPage } from './pages/planned-payments-page';
import { SettingsPage } from './pages/settings-page';

type MyFixtures = {
  onboardingPage: OnboardingPage;
  accountsPage: AccountsPage;
  dashboardPage: DashboardPage;
  journalEntryPage: JournalEntryPage;
  settingsPage: SettingsPage;
  plannedPaymentsPage: PlannedPaymentsPage;
  budgetsPage: BudgetsPage;
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
  plannedPaymentsPage: async ({ page }, use) => {
    await use(new PlannedPaymentsPage(page));
  },
  budgetsPage: async ({ page }, use) => {
    await use(new BudgetsPage(page));
  },
});

export { expect } from '@playwright/test';
