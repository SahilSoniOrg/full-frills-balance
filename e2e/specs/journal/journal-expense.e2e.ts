/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 *
 * Skipped until guided journal Detox flow is green (see local WIP: e2e/actions/mobile/journal.ts).
 */
import { launchOnboardedApp } from '../../actions/launch';

jest.setTimeout(300000);

describe.skip('Journal expense', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready' });
  });

  it('creates an expense entry from Activity', async () => {
    // TODO: enable when createGuidedExpenseJournal is landed
  });
});
