import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { AccountingDomainService } from '../AccountingDomainService';

describe('AccountingDomainService', () => {
  let service: AccountingDomainService;

  beforeEach(() => {
    service = new AccountingDomainService();
  });

  describe('getImpactMultiplier & getBalanceImpactMultiplier', () => {
    it('returns positive multiplier for ASSET DEBIT', () => {
      expect(service.getImpactMultiplier(AccountType.ASSET, TransactionType.DEBIT)).toBe(1);
      expect(service.getBalanceImpactMultiplier(AccountType.ASSET, TransactionType.DEBIT)).toBe(1);
    });

    it('returns negative multiplier for ASSET CREDIT', () => {
      expect(service.getImpactMultiplier(AccountType.ASSET, TransactionType.CREDIT)).toBe(-1);
    });

    it('returns positive multiplier for LIABILITY CREDIT', () => {
      expect(service.getImpactMultiplier(AccountType.LIABILITY, TransactionType.CREDIT)).toBe(1);
    });
  });

  describe('calculateNewBalance', () => {
    it('increases Asset balance on DEBIT', () => {
      const newBal = service.calculateNewBalance(
        100.5,
        50.25,
        AccountType.ASSET,
        TransactionType.DEBIT,
      );
      expect(newBal).toBe(150.75);
    });

    it('decreases Asset balance on CREDIT', () => {
      const newBal = service.calculateNewBalance(
        100.5,
        50.25,
        AccountType.ASSET,
        TransactionType.CREDIT,
      );
      expect(newBal).toBe(50.25);
    });

    it('increases Liability balance on CREDIT', () => {
      const newBal = service.calculateNewBalance(
        500,
        200,
        AccountType.LIABILITY,
        TransactionType.CREDIT,
      );
      expect(newBal).toBe(700);
    });
  });

  describe('isBackdated', () => {
    it('returns true if latest transaction date is greater than transaction date', () => {
      expect(service.isBackdated(1000, 2000)).toBe(true);
    });

    it('returns false if transaction date is newer or latest date is missing', () => {
      expect(service.isBackdated(2000, 1000)).toBe(false);
      expect(service.isBackdated(2000, undefined)).toBe(false);
    });
  });

  describe('validateDistinctAccounts', () => {
    it('returns valid when 2 or more distinct account IDs are provided', () => {
      const result = service.validateDistinctAccounts(['acc-1', 'acc-2']);
      expect(result.isValid).toBe(true);
      expect(result.uniqueCount).toBe(2);
    });

    it('returns invalid when single account ID or duplicates are provided', () => {
      const result = service.validateDistinctAccounts(['acc-1', 'acc-1']);
      expect(result.isValid).toBe(false);
      expect(result.uniqueCount).toBe(1);
    });
  });

  describe('constructSimpleJournal', () => {
    it('creates debit/credit transactions with given exchange rates and date', () => {
      const journal = service.constructSimpleJournal({
        type: 'expense',
        amount: 45.5,
        sourceAccount: { id: 'cash-acc', type: AccountType.ASSET, rate: 1.0 },
        destinationAccount: { id: 'grocery-acc', type: AccountType.EXPENSE, rate: 1.0 },
        description: 'Supermarket purchase',
        date: 1700000000000,
      });

      expect(journal.description).toBe('Supermarket purchase');
      expect(journal.journalDate).toBe(1700000000000);
      expect(journal.transactions).toHaveLength(2);
      expect(journal.transactions[0]).toEqual({
        accountId: 'grocery-acc',
        amount: 45.5,
        transactionType: TransactionType.DEBIT,
        exchangeRate: 1.0,
      });
      expect(journal.transactions[1]).toEqual({
        accountId: 'cash-acc',
        amount: 45.5,
        transactionType: TransactionType.CREDIT,
        exchangeRate: 1.0,
      });
    });
  });
});
