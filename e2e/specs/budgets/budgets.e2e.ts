/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { element, by, expect } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import {
  openBudgetFormFromCommitments,
  openSafeToSpendExplanation,
  selectBudgetInterval,
} from '../../actions/mobile/flows';

jest.setTimeout(300000);

describe('Budgets and Safe to Spend', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready' });
  });

  it('shows daily and monthly amount labels on the budget form', async () => {
    await openBudgetFormFromCommitments();
    await selectBudgetInterval('DAILY');
    await expect(element(by.text(/Limit each day/i))).toBeVisible();
    await selectBudgetInterval('MONTHLY');
    await expect(element(by.text(/Limit each month/i))).toBeVisible();
  });

  it('loads selected-category spending history in the budget form', async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready', newInstance: true });
    await openBudgetFormFromCommitments();
    await element(by.id('budget-category-add')).tap();
    // Detox orders the picker row before the background selected-category chip.
    await element(by.label('Groceries')).atIndex(0).tap();
    await element(by.text('Apply Selection (1)')).tap();
    await expect(element(by.id('budget-spending-history-chart'))).toBeVisible();
    await expect(element(by.id('budget-set-aside-from'))).toBeVisible();
  });

  it('explains projected gap in Safe to Spend info', async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready', newInstance: true });
    await openSafeToSpendExplanation({ fromDashboard: true });
  });
});
