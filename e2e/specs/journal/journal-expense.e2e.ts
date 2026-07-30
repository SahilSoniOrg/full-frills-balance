/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 *
 * Skipped until guided journal Detox flow is green (see e2e/actions/mobile/journal.ts).
 */
import { launchOnboardedApp } from '../../actions/launch';
import { createGuidedExpenseJournal } from '../../actions/mobile/journal';
import { E2E_SEED } from '../../constants/journalSeed';

jest.setTimeout(300000);

describe.skip('Journal expense', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready' });
  });

  it('creates an expense entry from Activity', async () => {
    await createGuidedExpenseJournal({
      amount: '12.34',
      description: 'E2E guided expense',
      categoryName: E2E_SEED.expenseGroceries,
      fromAccountName: E2E_SEED.assetCash,
    });
  });
});
