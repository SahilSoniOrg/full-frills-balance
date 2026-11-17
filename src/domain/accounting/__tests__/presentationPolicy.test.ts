import { AccountType, JournalDisplayType, SemanticType, TransactionType } from '@/src/types/enums';
import { balanceSign } from '@/src/domain/accounting/BalanceEffects';
import {
  ACCOUNT_TYPES,
  SEMANTIC_MATRIX,
  SURFACE_RULES,
  balanceIncreaseTransaction,
  bankEntrySign,
  directionSign,
  flowIconKey,
  journalFlowSign,
  legSign,
  obligationDirection,
  obligationSign,
  pairFlowSign,
  signColorKey,
  signPrefix,
  statusTone,
  transactionTypeForRole,
  type FlowSign,
  type ObligationDirection,
} from '@/src/domain/accounting/presentationPolicy';

const { ASSET, LIABILITY, EQUITY, INCOME, EXPENSE } = AccountType;
const { DEBIT, CREDIT } = TransactionType;

// The specs below are written out by hand. Runtime code derives them from
// BalanceEffects and the planned-payment rules, and these tests pin that output.

/** LEG spec, `[accountType][transactionType]`. */
const LEG_SPEC: Record<AccountType, Record<TransactionType, FlowSign>> = {
  [ASSET]: { [DEBIT]: 1, [CREDIT]: -1 },
  [LIABILITY]: { [DEBIT]: -1, [CREDIT]: 1 },
  [EQUITY]: { [DEBIT]: -1, [CREDIT]: 1 },
  [INCOME]: { [DEBIT]: -1, [CREDIT]: 1 },
  [EXPENSE]: { [DEBIT]: -1, [CREDIT]: 1 },
};

/** FLOW spec for a two-leg journal, `[creditAccount][debitAccount]`. */
const PAIR_SPEC: Record<AccountType, Record<AccountType, FlowSign>> = {
  [ASSET]: { [ASSET]: 0, [LIABILITY]: 0, [EQUITY]: 0, [INCOME]: -1, [EXPENSE]: -1 },
  [LIABILITY]: { [ASSET]: 0, [LIABILITY]: 0, [EQUITY]: 0, [INCOME]: -1, [EXPENSE]: -1 },
  [EQUITY]: { [ASSET]: 0, [LIABILITY]: 0, [EQUITY]: 0, [INCOME]: -1, [EXPENSE]: -1 },
  [INCOME]: { [ASSET]: 1, [LIABILITY]: 1, [EQUITY]: 1, [INCOME]: 0, [EXPENSE]: 0 },
  [EXPENSE]: { [ASSET]: 1, [LIABILITY]: 1, [EQUITY]: 1, [INCOME]: 0, [EXPENSE]: 0 },
};

/** OBLIGATION spec, `[fromAccount][toAccount]`, from the planned-payment classifier. */
const OBLIGATION_SPEC: Record<AccountType, Record<AccountType, ObligationDirection>> = {
  [ASSET]: {
    [ASSET]: 'transfer',
    [LIABILITY]: 'outflow',
    [EQUITY]: 'unknown',
    [INCOME]: 'unknown',
    [EXPENSE]: 'outflow',
  },
  [LIABILITY]: {
    [ASSET]: 'inflow',
    [LIABILITY]: 'transfer',
    [EQUITY]: 'unknown',
    [INCOME]: 'unknown',
    [EXPENSE]: 'outflow',
  },
  [EQUITY]: {
    [ASSET]: 'unknown',
    [LIABILITY]: 'unknown',
    [EQUITY]: 'unknown',
    [INCOME]: 'unknown',
    [EXPENSE]: 'unknown',
  },
  [INCOME]: {
    [ASSET]: 'inflow',
    [LIABILITY]: 'inflow',
    [EQUITY]: 'unknown',
    [INCOME]: 'unknown',
    [EXPENSE]: 'unknown',
  },
  [EXPENSE]: {
    [ASSET]: 'inflow',
    [LIABILITY]: 'inflow',
    [EQUITY]: 'unknown',
    [INCOME]: 'unknown',
    [EXPENSE]: 'unknown',
  },
};

describe('presentation policy', () => {
  describe('legSign (5×2)', () => {
    it('matches the spec, which is the balance direction with expense flipped', () => {
      for (const accountType of ACCOUNT_TYPES) {
        for (const transactionType of [DEBIT, CREDIT]) {
          expect(legSign(accountType, transactionType)).toBe(
            LEG_SPEC[accountType][transactionType],
          );
          const balance = balanceSign(accountType, transactionType);
          const expected = accountType === EXPENSE ? (balance === 0 ? 0 : -balance) : balance;
          expect(legSign(accountType, transactionType)).toBe(expected);
        }
      }
    });

    it('returns 0 for an unknown account type', () => {
      expect(legSign('MYSTERY', DEBIT)).toBe(0);
    });
  });

  describe('transactionTypeForRole', () => {
    it('maps SOURCE to credit and DESTINATION to debit', () => {
      expect(transactionTypeForRole('SOURCE')).toBe(CREDIT);
      expect(transactionTypeForRole('DESTINATION')).toBe(DEBIT);
      expect(transactionTypeForRole('NEUTRAL')).toBeUndefined();
    });
  });

  describe('balanceIncreaseTransaction', () => {
    it('is the transaction that raises the balance', () => {
      for (const accountType of ACCOUNT_TYPES) {
        const increase = balanceIncreaseTransaction(accountType);
        expect(balanceSign(accountType, increase)).toBe(1);
      }
    });
  });

  describe('pairFlowSign (5×5)', () => {
    it('matches the spec for every credit and debit pair', () => {
      for (const credit of ACCOUNT_TYPES) {
        for (const debit of ACCOUNT_TYPES) {
          expect([credit, debit, pairFlowSign(credit, debit)]).toEqual([
            credit,
            debit,
            PAIR_SPEC[credit][debit],
          ]);
        }
      }
    });

    it('signs the common cases as the product expects', () => {
      expect(pairFlowSign(ASSET, EXPENSE)).toBe(-1); // purchase
      expect(pairFlowSign(EXPENSE, ASSET)).toBe(1); // refund
      expect(pairFlowSign(INCOME, ASSET)).toBe(1); // salary
      expect(pairFlowSign(ASSET, INCOME)).toBe(-1); // income reversal
      expect(pairFlowSign(INCOME, EXPENSE)).toBe(0); // tax, reclassification
      expect(pairFlowSign(ASSET, ASSET)).toBe(0); // transfer
      expect(pairFlowSign(ASSET, LIABILITY)).toBe(0); // debt payment is balance-sheet only
    });
  });

  describe('journalFlowSign', () => {
    it('nets income and expense legs, ignoring balance-sheet legs', () => {
      expect(
        journalFlowSign([
          { accountType: INCOME, transactionType: CREDIT, amount: 1000 },
          { accountType: ASSET, transactionType: DEBIT, amount: 900 },
          { accountType: EXPENSE, transactionType: DEBIT, amount: 100 },
        ]),
      ).toBe(1);
    });

    it('is zero when income and expense cancel out', () => {
      expect(
        journalFlowSign([
          { accountType: INCOME, transactionType: CREDIT, amount: 100 },
          { accountType: EXPENSE, transactionType: DEBIT, amount: 100 },
        ]),
      ).toBe(0);
    });
  });

  describe('SEMANTIC_MATRIX (5×5)', () => {
    it('names every credit and debit pair with a concrete semantic type', () => {
      for (const credit of ACCOUNT_TYPES) {
        for (const debit of ACCOUNT_TYPES) {
          expect(SEMANTIC_MATRIX[credit][debit]).not.toBe(SemanticType.UNKNOWN);
        }
      }
    });

    it('keeps the labels people see for the common pairs', () => {
      expect(SEMANTIC_MATRIX[ASSET][EXPENSE]).toBe(SemanticType.PURCHASE);
      expect(SEMANTIC_MATRIX[EXPENSE][ASSET]).toBe(SemanticType.REFUND);
      expect(SEMANTIC_MATRIX[INCOME][ASSET]).toBe(SemanticType.INCOME_RECEIVED);
      expect(SEMANTIC_MATRIX[ASSET][ASSET]).toBe(SemanticType.TRANSFER);
    });
  });

  describe('obligationDirection (5×5)', () => {
    it('matches the spec for every from and to pair', () => {
      for (const from of ACCOUNT_TYPES) {
        for (const to of ACCOUNT_TYPES) {
          expect([from, to, obligationDirection(from, to)]).toEqual([
            from,
            to,
            OBLIGATION_SPEC[from][to],
          ]);
        }
      }
    });

    it('signs inflow +, outflow −, and transfers 0', () => {
      expect(directionSign('inflow')).toBe(1);
      expect(directionSign('outflow')).toBe(-1);
      expect(directionSign('transfer')).toBe(0);
      expect(obligationSign(ASSET, EXPENSE)).toBe(-1);
      expect(obligationSign(INCOME, ASSET)).toBe(1);
    });

    it('treats an unknown account type as no direction', () => {
      expect(obligationDirection(undefined, ASSET)).toBe('unknown');
      expect(obligationSign('MYSTERY', ASSET)).toBe(0);
    });
  });

  describe('display helpers', () => {
    it('uses one minus character for every signed amount', () => {
      expect(signPrefix(1)).toBe('+ ');
      expect(signPrefix(-1)).toBe('− ');
      expect(signPrefix(0)).toBe('');
    });

    it('colours amounts by sign and leaves zero neutral', () => {
      expect(signColorKey(1)).toBe('income');
      expect(signColorKey(-1)).toBe('expense');
      expect(signColorKey(0)).toBe('text');
    });

    it('reads a bank SMS credit as money in and an unknown direction as unsigned', () => {
      expect(bankEntrySign('credit')).toBe(1);
      expect(bankEntrySign('debit')).toBe(-1);
      expect(bankEntrySign('unknown')).toBe(0);
      expect(bankEntrySign(undefined)).toBe(0);
    });

    it('picks the row icon from the sign, then from the display type', () => {
      expect(flowIconKey(1, JournalDisplayType.EXPENSE)).toBe('up');
      expect(flowIconKey(-1, JournalDisplayType.INCOME)).toBe('down');
      expect(flowIconKey(0, JournalDisplayType.TRANSFER)).toBe('swap');
      expect(flowIconKey(0, JournalDisplayType.MIXED)).toBe('document');
    });
  });

  it('documents every surface with an intent and a source', () => {
    for (const rule of Object.values(SURFACE_RULES)) {
      expect(rule.source.length).toBeGreaterThan(0);
      expect(['FLOW', 'LEG', 'OBLIGATION', 'BANK_ENTRY', 'DELTA', 'UNSIGNED']).toContain(
        rule.intent,
      );
    }
  });

  describe('statusTone', () => {
    it('names the colour each status state shows', () => {
      expect(statusTone('shortfall')).toBe('error');
      expect(statusTone('overBudget')).toBe('error');
      expect(statusTone('overdue')).toBe('error');
      expect(statusTone('favorable')).toBe('success');
      expect(statusTone('dueSoon')).toBe('warning');
    });
  });
});
