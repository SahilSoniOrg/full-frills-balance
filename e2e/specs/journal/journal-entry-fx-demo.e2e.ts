import { device } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import { createFxSplitExpense } from '../../actions/mobile/journalFxSplitExpense';

jest.setTimeout(300000);

describe(':ios: FX journal entry demo', () => {
  it('creates and saves a split expense across EUR and USD', async () => {
    await launchOnboardedApp({ seedProfile: 'fx-demo' });
    await createFxSplitExpense('Euro market purchase');
    await device.takeScreenshot('journal-entry-fx-demo-saved');
  });
});
