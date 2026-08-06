import {
  AccountType,
  TransactionType,
  EMPTY_ACCOUNT_ID,
  JournalEntryLine,
  TransactionId,
} from '@/src/types/domain';

import {
  inferSimpleTabTypeFromTwoLegs,
  isJournalEditorEntryReady,
  isSimpleModeDisabledByLines,
  mapEditorLinesForBalanceCheck,
  mapEnrichedLinesToEditorState,
  normalizeJournalLinesForGuidedMode,
} from '@/src/services/journal/journalEditorHelpers';

describe('journalEditorHelpers', () => {
  describe('inferSimpleTabTypeFromTwoLegs', () => {
    it('classifies asset to expense as expense', () => {
      expect(inferSimpleTabTypeFromTwoLegs(AccountType.ASSET, AccountType.EXPENSE)).toBe('expense');
    });

    it('classifies income to asset as income', () => {
      expect(inferSimpleTabTypeFromTwoLegs(AccountType.INCOME, AccountType.ASSET)).toBe('income');
    });

    it('classifies asset to asset as transfer', () => {
      expect(inferSimpleTabTypeFromTwoLegs(AccountType.ASSET, AccountType.ASSET)).toBe('transfer');
    });
  });

  describe('normalizeJournalLinesForGuidedMode', () => {
    it('orders credit then debit with stable ids', () => {
      const lines: JournalEntryLine[] = [
        {
          id: 'x' as TransactionId,
          accountId: 'a1' as any,
          accountName: 'D',
          accountType: AccountType.EXPENSE,
          amount: '10',
          transactionType: TransactionType.DEBIT,
          notes: '',
          exchangeRate: '',
        },
        {
          id: 'y' as TransactionId,
          accountId: 'a2' as any,
          accountName: 'C',
          accountType: AccountType.ASSET,
          amount: '10',
          transactionType: TransactionType.CREDIT,
          notes: '',
          exchangeRate: '',
        },
      ];

      const normalized = normalizeJournalLinesForGuidedMode(lines);
      expect(normalized.forceAdvancedMode).toBe(false);
      expect(normalized.lines[0].transactionType).toBe(TransactionType.CREDIT);
      expect(normalized.lines[0].id).toBe('1');
      expect(normalized.lines[1].transactionType).toBe(TransactionType.DEBIT);
      expect(normalized.lines[1].id).toBe('2');
    });

    it('forces advanced mode when credit or debit leg is missing', () => {
      const lines: JournalEntryLine[] = [
        {
          id: 'x' as TransactionId,
          accountId: 'a1' as any,
          accountName: 'D',
          accountType: AccountType.EXPENSE,
          amount: '10',
          transactionType: TransactionType.DEBIT,
          notes: '',
          exchangeRate: '',
        },
      ];

      const normalized = normalizeJournalLinesForGuidedMode(lines);
      expect(normalized.forceAdvancedMode).toBe(true);
      expect(normalized.lines).toEqual(lines);
    });
  });

  describe('mapEnrichedLinesToEditorState', () => {
    it('forces advanced mode for more than two legs', () => {
      const result = mapEnrichedLinesToEditorState([
        {
          id: '1',
          accountId: 'a',
          amount: 1,
          transactionType: TransactionType.DEBIT,
          accountType: AccountType.ASSET,
        },
        {
          id: '2',
          accountId: 'b',
          amount: 1,
          transactionType: TransactionType.CREDIT,
          accountType: AccountType.ASSET,
        },
        {
          id: '3',
          accountId: 'c',
          amount: 1,
          transactionType: TransactionType.CREDIT,
          accountType: AccountType.EXPENSE,
        },
      ]);
      expect(result.forceAdvancedMode).toBe(true);
      expect(result.lines).toHaveLength(3);
    });

    it('infers simple tab type for two legs', () => {
      const result = mapEnrichedLinesToEditorState([
        {
          id: '1',
          accountId: 'a',
          amount: 10,
          transactionType: TransactionType.DEBIT,
          accountType: AccountType.EXPENSE,
        },
        {
          id: '2',
          accountId: 'b',
          amount: 10,
          transactionType: TransactionType.CREDIT,
          accountType: AccountType.ASSET,
        },
      ]);
      expect(result.forceAdvancedMode).toBe(false);
      expect(result.simpleTabType).toBe('expense');
    });

    it('forces advanced mode when account type is missing', () => {
      const result = mapEnrichedLinesToEditorState([
        {
          id: '1',
          accountId: 'a',
          amount: 10,
          transactionType: TransactionType.DEBIT,
        },
        {
          id: '2',
          accountId: 'b',
          amount: 10,
          transactionType: TransactionType.CREDIT,
          accountType: AccountType.ASSET,
        },
      ]);
      expect(result.forceAdvancedMode).toBe(true);
      expect(result.simpleTabType).toBeUndefined();
    });

    it('forces advanced mode for invalid transaction type', () => {
      const result = mapEnrichedLinesToEditorState([
        {
          id: '1',
          accountId: 'a',
          amount: 10,
          transactionType: 'NOT_A_TYPE',
          accountType: AccountType.EXPENSE,
        },
        {
          id: '2',
          accountId: 'b',
          amount: 10,
          transactionType: TransactionType.CREDIT,
          accountType: AccountType.ASSET,
        },
      ]);
      expect(result.forceAdvancedMode).toBe(true);
    });
  });

  describe('mapEditorLinesForBalanceCheck', () => {
    it('maps editor lines to journal calculator input', () => {
      const lines: JournalEntryLine[] = [
        {
          id: '1' as TransactionId,
          accountId: 'a1' as any,
          accountName: 'Cash',
          accountType: AccountType.ASSET,
          amount: '100',
          transactionType: TransactionType.DEBIT,
          notes: '',
          exchangeRate: '1.2',
          accountCurrency: 'EUR',
        },
      ];

      expect(mapEditorLinesForBalanceCheck(lines, 'USD')).toEqual([
        {
          amount: '100',
          type: TransactionType.DEBIT,
          exchangeRate: '1.2',
          accountCurrency: 'EUR',
        },
      ]);
    });
  });

  describe('isJournalEditorEntryReady', () => {
    const baseLine = (overrides: Partial<JournalEntryLine>): JournalEntryLine => ({
      id: '1' as TransactionId,
      accountId: 'a1' as any,
      accountName: '',
      accountType: AccountType.ASSET,
      amount: '10',
      transactionType: TransactionType.DEBIT,
      notes: '',
      exchangeRate: '',
      ...overrides,
    });

    it('returns true when all lines have account and valid amount', () => {
      expect(
        isJournalEditorEntryReady(
          [
            baseLine({}),
            baseLine({ id: '2' as TransactionId, transactionType: TransactionType.CREDIT }),
          ],
          'USD',
        ),
      ).toBe(true);
    });

    it('returns false when account or amount is missing', () => {
      expect(isJournalEditorEntryReady([baseLine({ accountId: EMPTY_ACCOUNT_ID })], 'USD')).toBe(
        false,
      );
      expect(isJournalEditorEntryReady([baseLine({ amount: '' })], 'USD')).toBe(false);
      expect(isJournalEditorEntryReady([baseLine({ amount: 'abc' })], 'USD')).toBe(false);
    });
  });

  describe('isSimpleModeDisabledByLines', () => {
    const emptyLine = (id: string, type: TransactionType): JournalEntryLine => ({
      id: id as TransactionId,
      accountId: EMPTY_ACCOUNT_ID,
      accountName: '',
      accountType: AccountType.EXPENSE,
      amount: '',
      transactionType: type,
      notes: '',
      exchangeRate: '',
    });

    it('allows simple mode for empty split scaffolding (3+ blank legs)', () => {
      const lines = [
        emptyLine('source', TransactionType.CREDIT),
        emptyLine('split-1', TransactionType.DEBIT),
        emptyLine('split-2', TransactionType.DEBIT),
      ];
      expect(isSimpleModeDisabledByLines(lines)).toBe(false);
    });

    it('blocks simple mode when more than two legs have data', () => {
      const lines = [
        { ...emptyLine('source', TransactionType.CREDIT), accountId: 'cash' as any, amount: '15' },
        { ...emptyLine('split-1', TransactionType.DEBIT), accountId: 'a1' as any, amount: '10' },
        { ...emptyLine('split-2', TransactionType.DEBIT), accountId: 'a2' as any, amount: '5' },
      ];
      expect(isSimpleModeDisabledByLines(lines)).toBe(true);
    });
  });
});
