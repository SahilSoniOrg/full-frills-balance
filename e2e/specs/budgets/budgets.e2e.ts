import { element, by, expect } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import {
  openBudgetFormFromCommitments,
  openSafeToSpendExplanation,
  selectBudgetInterval,
} from '../../actions/mobile/flows';
import { scrollToId, tapByText } from '../../actions/mobile/elementActions';

jest.setTimeout(300000);

describe('Budgets and Safe to Spend', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready' });
  });

  it('shows daily and monthly amount labels on the budget form', async () => {
    await openBudgetFormFromCommitments();
    await scrollToId('budget-schedule-field');
    await selectBudgetInterval('DAILY');
    await expect(element(by.text(/Limit each day/i))).toBeVisible();
    await scrollToId('budget-schedule-field');
    await selectBudgetInterval('MONTHLY');
    await expect(element(by.text(/Limit each month/i))).toBeVisible();
  });

  it('loads selected-category spending history in the budget form', async () => {
    await launchOnboardedApp({ seedProfile: 'journal-suggestions', newInstance: true });
    await openBudgetFormFromCommitments();
    await tapByText('All categories');
    await element(by.label('Groceries')).atIndex(1).tap();
    await element(by.id('account-picker-apply-selection')).tap();
    await scrollToId('budget-spending-history-chart');
    await expect(element(by.id('budget-spending-history-chart'))).toBeVisible();
    await scrollToId('budget-set-aside-from');
    await expect(element(by.id('budget-set-aside-from'))).toBeVisible();
  });

  it('explains projected gap in Safe to Spend info', async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready', newInstance: true });
    await openSafeToSpendExplanation({ fromDashboard: true });
  });
});
