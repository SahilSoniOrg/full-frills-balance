/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { launchOnboardedApp } from '../../actions/launch';
import { createExpenseJournal } from '../../actions/mobile/flows';

jest.setTimeout(300000);

describe('Journal expense', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready' });
  });

  it('creates an expense entry from Activity', async () => {
    await createExpenseJournal({
      amount: '42.50',
      description: 'Detox Lunch',
      fromAccount: 'Cash',
      toCategory: 'Food & Drink',
    });
  });
});
