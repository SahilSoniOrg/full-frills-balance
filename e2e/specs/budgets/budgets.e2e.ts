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
    await expect(element(by.text(/Daily Amount/i))).toBeVisible();
    await selectBudgetInterval('MONTHLY');
    await expect(element(by.text(/Monthly Amount/i))).toBeVisible();
  });

  it('explains projected gap in Safe to Spend info', async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready', newInstance: true });
    await openSafeToSpendExplanation({ fromDashboard: true });
  });
});
