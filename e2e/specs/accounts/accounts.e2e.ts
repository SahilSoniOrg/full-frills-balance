/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { launchOnboardedApp } from '../../actions/launch';
import { createAssetAccount } from '../../actions/mobile/flows';

jest.setTimeout(300000);

describe('Accounts', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready' });
  });

  it('creates a new asset account', async () => {
    await createAssetAccount('Detox Savings');
  });
});
