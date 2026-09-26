import { Icon } from '@/src/types/domainIcons';
import { database } from '@/src/data/database/Database';
import {
  AccountSubtype,
  AccountType,
  JournalDisplayType,
  JournalStatus,
  TransactionType,
} from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';

import AccountMetadata from '@/src/data/models/AccountMetadata';
import Account from '@/src/data/models/Account';
import Workplace from '@/src/data/models/Workplace';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { importRepository } from '@/src/data/repositories/ImportRepository';

describe('ImportRepository', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  describe('batchInsert account subtype defaults', () => {
    it('publishes a new Workplace and imported records atomically', async () => {
      const created = await importRepository.batchInsertNewWorkplace(
        {
          id: 'import-operation' as WorkplaceId,
          name: 'Imported ledger',
          icon: Icon.Briefcase,
          defaultCurrencyCode: 'USD',
        },
        {
          accounts: [
            {
              id: 'import-account',
              name: 'Cash',
              accountType: AccountType.ASSET,
              currencyCode: 'USD',
            },
          ],
          journals: [],
          transactions: [],
        },
      );

      expect(created.id).toBe('import-operation');
      const workplaces = await database.collections.get<Workplace>('workplaces').query().fetch();
      expect(workplaces).toHaveLength(1);
      expect(workplaces[0]?.name).toBe('Imported ledger');
      const accounts = await database.collections.get<Account>('accounts').query().fetch();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.workplaceId).toBe('import-operation');
    });

    it('should use type defaults when accountSubtype is missing', async () => {
      await importRepository.batchInsert('test-wp' as WorkplaceId, {
        accounts: [
          {
            id: 'a_asset',
            name: 'Asset A',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            color: '#3B82F6',
          },
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
      expect(asset?.color).toBe('#3B82F6');
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

  describe('new-workplace posted journal preflight', () => {
    const workplace = {
      id: 'restore-preflight' as WorkplaceId,
      name: 'Restored ledger',
      icon: Icon.Briefcase,
      defaultCurrencyCode: 'USD',
    };

    const accountRows = [
      {
        id: 'restore-debit',
        name: 'Cash',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
      },
      {
        id: 'restore-credit',
        name: 'Expense',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
      },
    ];

    const journalRows = [
      {
        id: 'restore-journal',
        journalDate: 1_000,
        currencyCode: 'USD',
        status: JournalStatus.POSTED,
        totalAmount: 10,
        transactionCount: 2,
        displayType: JournalDisplayType.TRANSFER,
      },
    ];

    it('rejects an unbalanced posted journal before publishing any workplace records', async () => {
      await expect(
        importRepository.batchInsertNewWorkplace(workplace, {
          accounts: accountRows,
          journals: journalRows,
          transactions: [
            {
              id: 'restore-line-debit',
              journalId: 'restore-journal' as JournalId,
              accountId: 'restore-debit' as AccountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
              currencyCode: 'USD',
              transactionDate: 1_000,
            },
            {
              id: 'restore-line-credit',
              journalId: 'restore-journal' as JournalId,
              accountId: 'restore-credit' as AccountId,
              amount: 9,
              transactionType: TransactionType.CREDIT,
              currencyCode: 'USD',
              transactionDate: 1_000,
            },
          ],
        }),
      ).rejects.toThrow(/Journal debits and credits differ by 1.00 USD/);

      expect(await database.collections.get('workplaces').query().fetchCount()).toBe(0);
      expect(await database.collections.get('accounts').query().fetchCount()).toBe(0);
      expect(await database.collections.get('journals').query().fetchCount()).toBe(0);
      expect(await database.collections.get('transactions').query().fetchCount()).toBe(0);
    });

    it('proposes the implied FX rate while preserving imported account amounts', async () => {
      await expect(
        importRepository.batchInsertNewWorkplace(workplace, {
          accounts: [
            {
              id: 'restore-hkd',
              name: 'HKD Cash',
              accountType: AccountType.ASSET,
              currencyCode: 'HKD',
            },
            {
              id: 'restore-inr',
              name: 'INR Bank',
              accountType: AccountType.ASSET,
              currencyCode: 'INR',
            },
          ],
          journals: [
            {
              ...journalRows[0],
              currencyCode: 'INR',
              totalAmount: 5791.12,
            },
          ],
          transactions: [
            {
              id: 'restore-line-hkd',
              journalId: 'restore-journal' as JournalId,
              accountId: 'restore-hkd' as AccountId,
              amount: 500.76,
              transactionType: TransactionType.DEBIT,
              currencyCode: 'HKD',
              transactionDate: 1_000,
              exchangeRate: 11.5348,
            },
            {
              id: 'restore-line-inr',
              journalId: 'restore-journal' as JournalId,
              accountId: 'restore-inr' as AccountId,
              amount: 5791.12,
              transactionType: TransactionType.CREDIT,
              currencyCode: 'INR',
              transactionDate: 1_000,
            },
          ],
          currencies: [
            {
              id: 'currency-hkd',
              code: 'HKD',
              symbol: 'HK$',
              name: 'Hong Kong Dollar',
              precision: 2,
            },
            { id: 'currency-inr', code: 'INR', symbol: '₹', name: 'Indian Rupee', precision: 2 },
          ],
        }),
      ).rejects.toMatchObject({
        issues: [
          expect.objectContaining({
            fxProposal: expect.objectContaining({
              transactionId: 'restore-line-hkd',
              exchangeRate: 5791.12 / 500.76,
              evaluation: expect.objectContaining({
                isBalanced: true,
                lineValues: expect.arrayContaining([
                  expect.objectContaining({ id: 'restore-line-hkd', nativeAmount: 500.76 }),
                  expect.objectContaining({ id: 'restore-line-inr', nativeAmount: 5791.12 }),
                ]),
              }),
            }),
          }),
        ],
      });

      expect(await database.collections.get('workplaces').query().fetchCount()).toBe(0);
      expect(await database.collections.get('transactions').query().fetchCount()).toBe(0);
    });

    it('allows an unbalanced planned journal in the snapshot', async () => {
      const created = await importRepository.batchInsertNewWorkplace(workplace, {
        accounts: accountRows,
        journals: [{ ...journalRows[0], status: JournalStatus.PLANNED }],
        transactions: [
          {
            id: 'planned-line-debit',
            journalId: 'restore-journal' as JournalId,
            accountId: 'restore-debit' as AccountId,
            amount: 10,
            transactionType: TransactionType.DEBIT,
            currencyCode: 'USD',
            transactionDate: 1_000,
          },
          {
            id: 'planned-line-credit',
            journalId: 'restore-journal' as JournalId,
            accountId: 'restore-credit' as AccountId,
            amount: 9,
            transactionType: TransactionType.CREDIT,
            currencyCode: 'USD',
            transactionDate: 1_000,
          },
        ],
      });

      expect(created.id).toBe(workplace.id);
      expect(await database.collections.get('journals').query().fetchCount()).toBe(1);
    });
  });
});
