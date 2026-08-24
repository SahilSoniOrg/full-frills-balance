import Workplace from '@/src/data/models/Workplace';
import { database } from '@/src/data/database/Database';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { canonicalImportFromBatchImportData } from '@/src/services/import/canonicalImportAdapter';
import { importService } from '@/src/services/import/ImportService';
import { ImportFileContext, ImportPlugin } from '@/src/services/import/types';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

const TARGET_WORKPLACE = 'wp-import-owner' as WorkplaceId;
const context = {
  uri: 'file://transaction-owner-test',
  name: 'transaction-owner-test.json',
  rawBytes: new Uint8Array(),
} as ImportFileContext;

describe('ImportService real writer workflow', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    await workplaceRepository.create({
      id: TARGET_WORKPLACE,
      name: 'Target',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });
  });

  it('discards a failed real batch without touching the target workplace', async () => {
    const plugin: ImportPlugin = {
      id: 'transaction-owner-test',
      name: 'Transaction owner test',
      description: 'Test import plugin',
      icon: 'T',
      detect: () => true,
      parse: async () => ({
        canonical: canonicalImportFromBatchImportData({
          accounts: [
            {
              id: 'duplicate-import-account',
              name: 'First partial row',
              accountType: AccountType.ASSET,
              currencyCode: 'USD',
            },
            {
              id: 'duplicate-import-account',
              name: 'Second conflicting row',
              accountType: AccountType.ASSET,
              currencyCode: 'USD',
            },
          ],
          journals: [],
          transactions: [],
        }),
        stats: { accounts: 2, journals: 0, transactions: 0, skippedTransactions: 0 },
      }),
    };

    await expect(importService.executeImport(plugin, context, TARGET_WORKPLACE)).rejects.toThrow();

    expect(
      await accountQueryRepository.find(TARGET_WORKPLACE, 'duplicate-import-account' as AccountId),
    ).toBeNull();

    const workplaces = await database.collections.get<Workplace>('workplaces').query().fetch();
    expect(workplaces).toHaveLength(1);
    expect(workplaces[0]!.id).toBe(TARGET_WORKPLACE);
  }, 30000);
});
