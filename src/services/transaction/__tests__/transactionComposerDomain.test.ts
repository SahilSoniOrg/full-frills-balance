import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, asTransactionId } from '@/src/types/ids';
import { PostingPlan, TransactionIntent } from '@/src/types/domainTransaction';
import {
  isPostingPlan,
  resolveTransactionIntent,
  validatePostingPlan,
} from '@/src/services/transaction/transactionComposerDomain';

const accounts = [
  { id: asAccountId('bank'), name: 'Bank', accountType: AccountType.ASSET, currencyCode: 'USD' },
  { id: asAccountId('food'), name: 'Food', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
  {
    id: asAccountId('travel'),
    name: 'Travel',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  },
  {
    id: asAccountId('eur-bank'),
    name: 'Euro bank',
    accountType: AccountType.ASSET,
    currencyCode: 'EUR',
  },
];

const baseIntent: TransactionIntent = {
  description: 'Groceries',
  amount: '50.00',
  date: '2026-08-25',
  type: 'expense',
  sourceAccountId: asAccountId('bank'),
  destinationAccountId: asAccountId('food'),
};

describe('transaction composer domain', () => {
  describe('resolveTransactionIntent', () => {
    it('resolves a basic expense into one credit and one debit', () => {
      const result = resolveTransactionIntent(baseIntent, { accounts, currencyCode: 'USD' });

      expect(result.resolved).toBe(true);
      if (!result.resolved) return;
      expect(
        result.plan.lines.map(line => [line.accountId, line.transactionType, line.amount]),
      ).toEqual([
        [asAccountId('bank'), TransactionType.CREDIT, '50.00'],
        [asAccountId('food'), TransactionType.DEBIT, '50.00'],
      ]);
      expect(validatePostingPlan(result.plan, accounts).valid).toBe(true);
    });

    it('resolves allocations and derives the total when the intent omits it', () => {
      const result = resolveTransactionIntent(
        {
          ...baseIntent,
          amount: undefined,
          allocations: [
            { id: 'food-line', accountId: asAccountId('food'), amount: '30' },
            { id: 'travel-line', accountId: asAccountId('travel'), amount: '20' },
          ],
        },
        { accounts, currencyCode: 'USD' },
      );

      expect(result.resolved).toBe(true);
      if (!result.resolved) return;
      expect(result.plan.lines.map(line => line.amount)).toEqual(['50', '30', '20']);
      expect(result.plan.lines.map(line => line.id)).toEqual([
        'intent-source',
        'food-line',
        'travel-line',
      ]);
    });

    it('reports unresolved account and allocation decisions without throwing', () => {
      const result = resolveTransactionIntent(
        {
          ...baseIntent,
          sourceAccountId: undefined,
          allocations: [{ amount: '40', accountId: asAccountId('missing') }],
        },
        { accounts, currencyCode: 'USD' },
      );

      expect(result).toEqual({
        resolved: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'missing_source_account' }),
          expect.objectContaining({ code: 'allocation_sum_mismatch' }),
          expect.objectContaining({ code: 'unknown_account' }),
        ]),
      });
    });
  });

  describe('validatePostingPlan', () => {
    it('rejects an unbalanced plan and identifies the invariant', () => {
      const resolved = resolveTransactionIntent(baseIntent, { accounts, currencyCode: 'USD' });
      if (!resolved.resolved) throw new Error('expected a resolved plan');

      const invalidPlan: PostingPlan = {
        ...resolved.plan,
        lines: resolved.plan.lines.map(line =>
          line.transactionType === TransactionType.DEBIT ? { ...line, amount: '49.99' } : line,
        ),
      };

      expect(validatePostingPlan(invalidPlan, accounts)).toEqual({
        valid: false,
        issues: [expect.objectContaining({ code: 'unbalanced' })],
      });
    });

    it('rejects stale account metadata and missing foreign exchange rates', () => {
      const resolved = resolveTransactionIntent(
        { ...baseIntent, sourceAccountId: asAccountId('eur-bank'), sourceExchangeRate: undefined },
        { accounts, currencyCode: 'USD' },
      );
      if (!resolved.resolved) throw new Error('expected a resolved plan');

      const stalePlan: PostingPlan = {
        ...resolved.plan,
        lines: resolved.plan.lines.map(line =>
          line.accountId === asAccountId('food') ? { ...line, accountName: 'Old food' } : line,
        ),
      };
      const validation = validatePostingPlan(stalePlan, accounts);

      expect(validation.valid).toBe(false);
      expect(validation.issues.map(issue => issue.code)).toEqual(
        expect.arrayContaining(['account_metadata_mismatch', 'missing_exchange_rate']),
      );
    });

    it('accepts a rounded foreign-currency amount within one base-currency minor unit', () => {
      const fxAccounts = [
        ...accounts,
        {
          id: asAccountId('inr-bank'),
          name: 'INR Bank',
          accountType: AccountType.ASSET,
          currencyCode: 'INR',
        },
        {
          id: asAccountId('thb-expense'),
          name: 'Trip Stay',
          accountType: AccountType.EXPENSE,
          currencyCode: 'THB',
        },
      ];
      const roundedForeignPlan: PostingPlan = {
        lines: [
          {
            id: asTransactionId('thb-debit'),
            accountId: asAccountId('thb-expense'),
            accountName: 'Trip Stay',
            accountType: AccountType.EXPENSE,
            accountCurrency: 'THB',
            amount: '76.82',
            transactionType: TransactionType.DEBIT,
            notes: '',
            exchangeRate: '2.89',
          },
          {
            id: asTransactionId('inr-credit'),
            accountId: asAccountId('inr-bank'),
            accountName: 'INR Bank',
            accountType: AccountType.ASSET,
            accountCurrency: 'INR',
            amount: '222',
            transactionType: TransactionType.CREDIT,
            notes: '',
            exchangeRate: '',
          },
        ],
        currencyCode: 'INR',
        description: 'Trip Stay',
        date: Date.now(),
      };

      expect(validatePostingPlan(roundedForeignPlan, fxAccounts)).toEqual({
        valid: true,
        issues: [],
      });
    });

    it('keeps separate source and destination amounts for a simple foreign-currency entry', () => {
      const fxAccounts = [
        ...accounts,
        {
          id: asAccountId('inr-bank'),
          name: 'INR Bank',
          accountType: AccountType.ASSET,
          currencyCode: 'INR',
        },
        {
          id: asAccountId('thb-expense'),
          name: 'Trip Stay',
          accountType: AccountType.EXPENSE,
          currencyCode: 'THB',
        },
      ];
      const resolved = resolveTransactionIntent(
        {
          description: 'Trip Stay',
          amount: '500',
          destinationAmount: '173.01',
          date: '2026-09-12',
          type: 'expense',
          sourceAccountId: asAccountId('inr-bank'),
          destinationAccountId: asAccountId('thb-expense'),
          destinationExchangeRate: '2.89',
        },
        { accounts: fxAccounts, currencyCode: 'INR' },
      );

      expect(resolved.resolved).toBe(true);
      if (!resolved.resolved) return;
      expect(resolved.plan.lines.map(line => line.amount)).toEqual(['500', '173.01']);
      expect(validatePostingPlan(resolved.plan, fxAccounts)).toEqual({
        valid: true,
        issues: [],
      });
    });

    it('accepts higher-rate foreign amounts whose conversion rounds by more than one base minor unit', () => {
      const fxAccounts = [
        ...accounts,
        {
          id: asAccountId('inr-bank'),
          name: 'INR Bank',
          accountType: AccountType.ASSET,
          currencyCode: 'INR',
        },
        {
          id: asAccountId('hkd-expense'),
          name: 'Trip Exchange',
          accountType: AccountType.EXPENSE,
          currencyCode: 'HKD',
        },
      ];
      const resolved = resolveTransactionIntent(
        {
          description: 'Trip Exchange',
          amount: '50',
          destinationAmount: '4.11',
          date: '2026-09-12',
          type: 'expense',
          sourceAccountId: asAccountId('inr-bank'),
          destinationAccountId: asAccountId('hkd-expense'),
          destinationExchangeRate: '12.17',
        },
        { accounts: fxAccounts, currencyCode: 'INR' },
      );

      expect(resolved.resolved).toBe(true);
      if (!resolved.resolved) return;
      expect(validatePostingPlan(resolved.plan, fxAccounts)).toEqual({
        valid: true,
        issues: [],
      });
    });

    it('provides a boolean predicate for a valid plan', () => {
      const resolved = resolveTransactionIntent(baseIntent, { accounts, currencyCode: 'USD' });
      if (!resolved.resolved) throw new Error('expected a resolved plan');
      expect(isPostingPlan(resolved.plan, accounts)).toBe(true);
    });

    it('validates a 10,000-line plan within the large-input guardrail', () => {
      const lines = Array.from({ length: 10_000 }, (_, index) => ({
        id: asTransactionId(`line-${index}`),
        accountId: asAccountId(index % 2 === 0 ? 'bank' : 'food'),
        accountName: index % 2 === 0 ? 'Bank' : 'Food',
        accountType: index % 2 === 0 ? AccountType.ASSET : AccountType.EXPENSE,
        accountCurrency: 'USD',
        amount: '1',
        transactionType: index % 2 === 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
        notes: '',
        exchangeRate: '',
      }));
      const plan: PostingPlan = {
        lines: lines as PostingPlan['lines'],
        currencyCode: 'USD',
        description: 'Large synthetic plan',
        date: Date.now(),
      };

      const startedAt = performance.now();
      const result = validatePostingPlan(plan, accounts);
      const elapsedMs = performance.now() - startedAt;

      expect(result.valid).toBe(true);
      expect(elapsedMs).toBeLessThan(5_000);
    });
  });
});
