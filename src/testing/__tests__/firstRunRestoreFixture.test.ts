import { Icon } from '@/src/types/domainIcons';
import { prepareFirstRunRestoreFixture } from '../fixtures/firstRunRestoreBackup';

describe('first-run restore fixture', () => {
  it('prepares native backup facts for publication', async () => {
    const prepared = await prepareFirstRunRestoreFixture();
    expect(prepared.fingerprint).toMatch(/^restore-v1:/);
    expect(prepared.facts.workplace).toEqual({
      name: 'Imported Books',
      icon: Icon.Briefcase,
      defaultCurrencyCode: 'USD',
    });
    expect(prepared.stats).toMatchObject({
      accounts: 1,
      categories: 1,
      journals: 1,
      transactions: 2,
      skippedTransactions: 0,
    });
  });
});
