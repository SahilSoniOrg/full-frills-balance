import { budgets, dashboard, journal, plannedPayments, tabs } from '../../screens';
import { assertVisibleById, assertTextVisible } from '../assertions';
import { tapById, tapByLabel, tapByText, typeById } from './elementActions';

export async function openDashboardTab(): Promise<void> {
  await tapById(dashboard.tab);
  await assertVisibleById(dashboard.screen);
}

export async function openActivityTab(): Promise<void> {
  await tapById(tabs.activity);
}

export async function openAccountsTab(): Promise<void> {
  await tapById(tabs.accounts);
}

export async function openCommitmentsTab(): Promise<void> {
  await tapById(tabs.commitments);
}

export async function openNewJournalEntry(): Promise<void> {
  await openActivityTab();
  await tapByLabel('Open new entry options');
}

export async function createExpenseJournal(params: {
  amount: string;
  description: string;
  fromAccount: string;
  toCategory: string;
}): Promise<void> {
  await openNewJournalEntry();
  await tapByText(/^Expense$/);
  await typeById(journal.amountInput, params.amount);
  await typeById(journal.descriptionInput, params.description);
  await tapByText(params.fromAccount);
  await tapByText(params.toCategory);
  await tapById(journal.submitFooter);
  await assertTextVisible(params.description);
}

export async function createAssetAccount(name: string): Promise<void> {
  await openAccountsTab();
  await tapById('fab-button');
  await typeById('hero-name-input', name);
  await tapById('submit-footer-button');
  await assertTextVisible(name);
}

export async function openBudgetFormFromCommitments(): Promise<void> {
  await openCommitmentsTab();
  await tapByLabel('Create a new budget');
  await assertVisibleById(budgets.intervalItem('DAILY'));
}

export async function selectBudgetInterval(
  interval: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
): Promise<void> {
  await tapById(budgets.intervalItem(interval));
}

export async function openSafeToSpendExplanation(): Promise<void> {
  await openDashboardTab();
  await tapByLabel('Open safe-to-spend calculation info');
  await assertTextVisible('How Safe to Spend Is Calculated');
}

export async function createPlannedPayment(name: string, amount: string): Promise<void> {
  await openCommitmentsTab();
  await tapById('commitments-tabs-item-planned');
  await tapByLabel('Create a new planned payment');
  await typeById(plannedPayments.heroName, name);
  await typeById(plannedPayments.heroAmount, amount);
  await tapByText('Checking Account');
  await tapByText('Landlord');
  await tapById(plannedPayments.submitFooter);
  await assertTextVisible(name);
}
