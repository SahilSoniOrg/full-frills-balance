import {
  AccountType,
  TransactionType,
  AccountId,
  JournalDisplayType,
  SemanticType,
} from '@/src/types/domain';

import { journalPresenter } from '@/src/services/accounting/journalPresenter';

describe('JournalPresenter', () => {
  const accountTypes = new Map<AccountId, AccountType>([
    ['a1' as AccountId, AccountType.ASSET],
    ['a2' as AccountId, AccountType.ASSET],
    ['l1' as AccountId, AccountType.LIABILITY],
    ['e1' as AccountId, AccountType.EQUITY],
    ['i1' as AccountId, AccountType.INCOME],
    ['ex1' as AccountId, AccountType.EXPENSE],
  ]);

  describe('getJournalDisplayType', () => {
    it('identifies INCOME when an Income account is involved', () => {
      const txs = [
        { accountId: 'a1' as AccountId, amount: 100, transactionType: TransactionType.DEBIT },
        { accountId: 'i1' as AccountId, amount: 100, transactionType: TransactionType.CREDIT },
      ];
      expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(
        JournalDisplayType.INCOME,
      );
    });

    it('identifies EXPENSE when an Expense account is involved', () => {
      const txs = [
        { accountId: 'ex1' as AccountId, amount: 50, transactionType: TransactionType.DEBIT },
        { accountId: 'a1' as AccountId, amount: 50, transactionType: TransactionType.CREDIT },
      ];
      expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(
        JournalDisplayType.EXPENSE,
      );
    });

    it('identifies MIXED when both Income and Expense accounts are involved (Split)', () => {
      const txs = [
        { accountId: 'i1' as AccountId, amount: 100, transactionType: TransactionType.CREDIT },
        { accountId: 'ex1' as AccountId, amount: 40, transactionType: TransactionType.DEBIT },
        { accountId: 'a1' as AccountId, amount: 60, transactionType: TransactionType.DEBIT },
      ];
      expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(
        JournalDisplayType.MIXED,
      );
    });

    it('identifies TRANSFER for simple Asset-to-Asset movements', () => {
      const txs = [
        { accountId: 'a1' as AccountId, amount: 100, transactionType: TransactionType.CREDIT },
        { accountId: 'a2' as AccountId, amount: 100, transactionType: TransactionType.DEBIT },
      ];
      expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(
        JournalDisplayType.TRANSFER,
      );
    });

    it('identifies INCOME for Asset Debit vs Equity Credit (Investment)', () => {
      const txs = [
        { accountId: 'a1' as AccountId, amount: 1000, transactionType: TransactionType.DEBIT },
        { accountId: 'e1' as AccountId, amount: 1000, transactionType: TransactionType.CREDIT },
      ];
      expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(
        JournalDisplayType.INCOME,
      );
    });

    it('identifies EXPENSE for Asset Credit vs Equity Debit (Owner Draw)', () => {
      const txs = [
        { accountId: 'a1' as AccountId, amount: 500, transactionType: TransactionType.CREDIT },
        { accountId: 'e1' as AccountId, amount: 500, transactionType: TransactionType.DEBIT },
      ];
      expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(
        JournalDisplayType.EXPENSE,
      );
    });

    it('identifies TRANSFER for complex multi-leg Asset swaps', () => {
      const txs = [
        { accountId: 'a1' as AccountId, amount: 100, transactionType: TransactionType.CREDIT },
        { accountId: 'a2' as AccountId, amount: 70, transactionType: TransactionType.DEBIT },
        { accountId: 'a1' as AccountId, amount: 30, transactionType: TransactionType.DEBIT }, // Partial back to same account or another asset
      ];
      expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(
        JournalDisplayType.TRANSFER,
      );
    });
  });

  describe('getSourceAndDestTypes', () => {
    it('identifies Asset as source and Expense as destination for standard expense', () => {
      const txs = [
        { accountId: 'a1' as AccountId, amount: 50, transactionType: TransactionType.CREDIT },
        { accountId: 'ex1' as AccountId, amount: 50, transactionType: TransactionType.DEBIT },
      ];
      const { source, destination } = journalPresenter.getSourceAndDestTypes(txs, accountTypes);
      expect(source).toBe(AccountType.ASSET);
      expect(destination).toBe(AccountType.EXPENSE);
    });

    it('identifies Income as source and Asset as destination for standard income', () => {
      const txs = [
        { accountId: 'i1' as AccountId, amount: 100, transactionType: TransactionType.CREDIT },
        { accountId: 'a1' as AccountId, amount: 100, transactionType: TransactionType.DEBIT },
      ];
      const { source, destination } = journalPresenter.getSourceAndDestTypes(txs, accountTypes);
      expect(source).toBe(AccountType.INCOME);
      expect(destination).toBe(AccountType.ASSET);
    });

    it('identifies dominant types in multi-leg transactions', () => {
      const txs = [
        { accountId: 'a1' as AccountId, amount: 100, transactionType: TransactionType.CREDIT },
        { accountId: 'ex1' as AccountId, amount: 80, transactionType: TransactionType.DEBIT },
        { accountId: 'a2' as AccountId, amount: 20, transactionType: TransactionType.DEBIT }, // Partial transfer/fee
      ];
      const { source, destination } = journalPresenter.getSourceAndDestTypes(txs, accountTypes);
      expect(source).toBe(AccountType.ASSET);
      expect(destination).toBe(AccountType.EXPENSE); // Expense (80) > Asset (20)
    });
  });

  describe('getJournalSemanticLabel', () => {
    it('returns "Income" (label) for Asset Debit vs Income Credit', () => {
      const txs = [
        { accountId: 'a1' as AccountId, amount: 100, transactionType: TransactionType.DEBIT },
        { accountId: 'i1' as AccountId, amount: 100, transactionType: TransactionType.CREDIT },
      ];
      expect(journalPresenter.getJournalSemanticLabel(txs, accountTypes)).toBe('Income');
    });

    it('returns "Debt Payment" (label) for Asset Credit vs Liability Debit', () => {
      const txs = [
        { accountId: 'a1' as AccountId, amount: 500, transactionType: TransactionType.CREDIT },
        { accountId: 'l1' as AccountId, amount: 500, transactionType: TransactionType.DEBIT },
      ];
      expect(journalPresenter.getJournalSemanticLabel(txs, accountTypes)).toBe('Debt Payment');
    });

    it('returns "Split" for mixed income/expense transactions', () => {
      const txs = [
        { accountId: 'i1' as AccountId, amount: 100, transactionType: TransactionType.CREDIT },
        { accountId: 'ex1' as AccountId, amount: 40, transactionType: TransactionType.DEBIT },
        { accountId: 'a1' as AccountId, amount: 60, transactionType: TransactionType.DEBIT },
      ];
      expect(journalPresenter.getJournalSemanticLabel(txs, accountTypes)).toBe('Split');
    });
  });

  describe('getSemanticType', () => {
    it('identifies Asset -> Asset as TRANSFER', () => {
      expect(journalPresenter.getSemanticType(AccountType.ASSET, AccountType.ASSET)).toBe(
        SemanticType.TRANSFER,
      );
    });

    it('identifies Income -> Asset as INCOME_RECEIVED', () => {
      expect(journalPresenter.getSemanticType(AccountType.INCOME, AccountType.ASSET)).toBe(
        SemanticType.INCOME_RECEIVED,
      );
    });

    it('identifies Asset -> Expense as PURCHASE', () => {
      expect(journalPresenter.getSemanticType(AccountType.ASSET, AccountType.EXPENSE)).toBe(
        SemanticType.PURCHASE,
      );
    });

    it('identifies Asset -> Liability as DEBT_PAYMENT', () => {
      expect(journalPresenter.getSemanticType(AccountType.ASSET, AccountType.LIABILITY)).toBe(
        SemanticType.DEBT_PAYMENT,
      );
    });

    it('identifies Liability -> Asset as BORROWING', () => {
      expect(journalPresenter.getSemanticType(AccountType.LIABILITY, AccountType.ASSET)).toBe(
        SemanticType.BORROWING,
      );
    });

    it('returns UNKNOWN for invalid types', () => {
      expect(journalPresenter.getSemanticType('INVALID' as any, AccountType.ASSET)).toBe(
        SemanticType.UNKNOWN,
      );
    });
  });

  describe('getPresentation', () => {
    it('returns correct presentation for JournalDisplayType.INCOME', () => {
      const pres = journalPresenter.getPresentation(JournalDisplayType.INCOME);
      expect(pres.colorKey).toBe('success');
      expect(pres.label).toBe('Income');
    });

    it('returns high-fidelity presentation when SemanticType is provided', () => {
      // Debt payment should be liability color (orange/warning)
      const pres = journalPresenter.getPresentation(
        JournalDisplayType.TRANSFER,
        undefined,
        SemanticType.DEBT_PAYMENT,
      );
      expect(pres.label).toBe('Debt Payment');
      expect(pres.colorKey).toBe('liability');
    });

    it('overrides label with semanticLabel if provided even with SemanticType', () => {
      const pres = journalPresenter.getPresentation(
        JournalDisplayType.TRANSFER,
        'Custom Label',
        SemanticType.DEBT_PAYMENT,
      );
      expect(pres.label).toBe('Custom Label');
      expect(pres.colorKey).toBe('liability');
    });
  });

  describe('getIconLabel', () => {
    it('returns I for INCOME', () => {
      expect(journalPresenter.getIconLabel(JournalDisplayType.INCOME)).toBe('I');
    });
    it('returns E for EXPENSE', () => {
      expect(journalPresenter.getIconLabel(JournalDisplayType.EXPENSE)).toBe('E');
    });
    it('returns T for TRANSFER', () => {
      expect(journalPresenter.getIconLabel(JournalDisplayType.TRANSFER)).toBe('T');
    });
  });
});
