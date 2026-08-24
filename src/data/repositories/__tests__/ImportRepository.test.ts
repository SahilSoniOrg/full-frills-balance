import { database } from '@/src/data/database/Database';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import AccountMetadata from '@/src/data/models/AccountMetadata';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { importRepository } from '@/src/data/repositories/ImportRepository';

describe('ImportRepository', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  describe('batchInsert account subtype defaults', () => {
    it('should use type defaults when accountSubtype is missing', async () => {
      await importRepository.batchInsert('test-wp' as WorkplaceId, {
        accounts: [
          { id: 'a_asset', name: 'Asset A', accountType: AccountType.ASSET, currencyCode: 'USD' },
          {
            id: 'a_liability',
            name: 'Liability A',
            accountType: AccountType.LIABILITY,
            currencyCode: 'USD',
          },
          {
            id: 'a_equity',
            name: 'Equity A',
            accountType: AccountType.EQUITY,
            currencyCode: 'USD',
          },
          {
            id: 'a_income',
            name: 'Income A',
            accountType: AccountType.INCOME,
            currencyCode: 'USD',
          },
          {
            id: 'a_expense',
            name: 'Expense A',
            accountType: AccountType.EXPENSE,
            currencyCode: 'USD',
          },
        ],
        journals: [],
        transactions: [],
      });

      const asset = await accountQueryRepository.find(
        'test-wp' as WorkplaceId,
        'a_asset' as AccountId,
      );
      const liability = await accountQueryRepository.find(
        'test-wp' as WorkplaceId,
        'a_liability' as AccountId,
      );
      const equity = await accountQueryRepository.find(
        'test-wp' as WorkplaceId,
        'a_equity' as AccountId,
      );
      const income = await accountQueryRepository.find(
        'test-wp' as WorkplaceId,
        'a_income' as AccountId,
      );
      const expense = await accountQueryRepository.find(
        'test-wp' as WorkplaceId,
        'a_expense' as AccountId,
      );

      expect(asset?.accountSubtype).toBe(AccountSubtype.CASH);
      expect(liability?.accountSubtype).toBe(AccountSubtype.CREDIT_CARD);
      expect(equity?.accountSubtype).toBe(AccountSubtype.OPENING_BALANCE);
      expect(income?.accountSubtype).toBe(AccountSubtype.SALARY);
      expect(expense?.accountSubtype).toBe(AccountSubtype.FOOD);
    });

    it('should default to OTHER for unknown imported account type', async () => {
      await importRepository.batchInsert('test-wp' as WorkplaceId, {
        accounts: [
          { id: 'a_unknown', name: 'Unknown A', accountType: 'UNKNOWN_TYPE', currencyCode: 'USD' },
        ],
        journals: [],
        transactions: [],
      });

      const unknown = await accountQueryRepository.find(
        'test-wp' as WorkplaceId,
        'a_unknown' as AccountId,
      );
      expect(unknown?.accountSubtype).toBe(AccountSubtype.OTHER);
    });
  });

  describe('batchInsert additional entity support', () => {
    it('should import account metadata', async () => {
      await importRepository.batchInsert('test-wp' as WorkplaceId, {
        accounts: [{ id: 'a1', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' }],
        journals: [],
        transactions: [],
        accountMetadata: [
          {
            id: 'm_1',
            accountId: 'a1' as AccountId,
            statementDay: 2,
            dueDay: 20,
            autopayEnabled: true,
          },
        ],
      });

      const metadata = await database.collections
        .get<AccountMetadata>('account_metadata')
        .query()
        .fetch();

      expect(metadata).toHaveLength(1);
      expect(metadata[0].statementDay).toBe(2);
      expect(metadata[0].dueDay).toBe(20);
      expect(metadata[0].autopayEnabled).toBe(true);
    });
  });
});
