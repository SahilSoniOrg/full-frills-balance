import { isMoneyReady } from '../draft';
import { parseAmountInput } from '../amountValidation';
import { prepareCashClarityInput } from '../prepareEffectiveDraft';
import { cashClarityDraft as draft, cashClarityNow as now } from './cashClarityTestFixtures';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { projectCashClarityDraft } from '../projectCashClarityDraft';

describe('parseAmountInput', () => {
  it('keeps blank, zero, and malformed text distinct', () => {
    expect(parseAmountInput('', 'en-US', 2)).toEqual({ status: 'empty' });
    expect(parseAmountInput('0', 'en-US', 2)).toEqual({ status: 'valid', value: 0 });
    expect(parseAmountInput('1.2.3', 'en-US', 2)).toEqual({
      status: 'invalid',
      reason: 'malformed',
    });
  });

  it('parses locale grouping and decimal separators without guessing', () => {
    expect(parseAmountInput('1,234.56', 'en-US', 2)).toEqual({ status: 'valid', value: 1234.56 });
    expect(parseAmountInput('1.234,56', 'de-DE', 2)).toEqual({ status: 'valid', value: 1234.56 });
    expect(parseAmountInput('1.23,45', 'de-DE', 2).status).toBe('invalid');
  });

  it('preserves signed asset input and enforces currency precision', () => {
    expect(parseAmountInput('-12.34', 'en-US', 2)).toEqual({ status: 'valid', value: -12.34 });
    expect(parseAmountInput('12.345', 'en-US', 2)).toEqual({
      status: 'invalid',
      reason: 'precision',
    });
    expect(parseAmountInput('12.5', 'en-US', 0).status).toBe('invalid');
  });
});

describe('prepareCashClarityInput', () => {
  it('excludes deferred collections while retaining their raw editor values', () => {
    const source = draft({
      accounts: [{ id: 'bank', kind: 'bank', name: 'Bank', balance: 50000 }],
      income: {
        kind: 'recurring',
        items: [
          {
            id: 'salary',
            name: 'Salary',
            source: 'salary',
            amount: 25000,
            interval: PlannedPaymentInterval.MONTHLY,
            intervalN: 1,
            nextDate: now.add(1, 'day').valueOf(),
          },
        ],
      },
    });
    const raw = {
      amountTextById: { bank: '50000', salary: '25000' },
      deferredCollections: { income: true },
    } as const;

    const prepared = prepareCashClarityInput(source, raw, 'en-US');

    expect(prepared.deferredCollections).toContain('income');
    expect(prepared.effectiveDraft.income).toEqual({ kind: 'skipped' });
    expect(projectCashClarityDraft(prepared.effectiveDraft, now).expectedIncomeInWindow).toBe(0);
    expect(raw.amountTextById.salary).toBe('25000');
    expect(prepared.isValid).toBe(true);
    expect(prepared.isIncomplete).toBe(true);
  });

  it('does not turn malformed input into a stale numeric value', () => {
    const prepared = prepareCashClarityInput(
      draft({ accounts: [{ id: 'bank', kind: 'bank', name: 'Bank', balance: 50000 }] }),
      { amountTextById: { bank: '1.2.3' } },
      'en-US',
    );

    expect(prepared.effectiveDraft.accounts).toEqual([]);
    expect(prepared.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: 'bank', reason: 'malformed' })]),
    );
    expect(prepared.isValid).toBe(false);
    expect(prepared.isIncomplete).toBe(true);
  });

  it('distinguishes a blank balance from an explicitly entered zero estimate', () => {
    const source = draft({
      accounts: [{ id: 'bank', kind: 'bank', name: 'Bank', balance: 0 }],
    });

    const blank = prepareCashClarityInput(source, { amountTextById: { bank: '' } }, 'en-US');
    const enteredZero = prepareCashClarityInput(
      source,
      { amountTextById: { bank: '0' } },
      'en-US',
    );

    expect(blank.hasUsableEstimate).toBe(false);
    expect(blank.estimateStatus).toBe('unavailable');
    expect(blank.isValid).toBe(false);
    expect(enteredZero.hasUsableEstimate).toBe(true);
    expect(enteredZero.effectiveDraft.accounts[0]?.balance).toBe(0);
    expect(enteredZero.isValid).toBe(true);
    expect(enteredZero.isCompleteEstimate).toBe(true);
    expect(enteredZero.estimateStatus).toBe('ready');
  });

  it('accepts zero debt and preserves a supported negative asset balance', () => {
    const card = { id: 'card', kind: 'card' as const, name: 'Card', balance: 0 };
    expect(isMoneyReady([card])).toBe(true);

    const prepared = prepareCashClarityInput(
      draft({
        accounts: [
          { id: 'bank', kind: 'bank', name: 'Bank', balance: 0 },
          card,
        ],
      }),
      { amountTextById: { bank: '-12.34', card: '0' } },
      'en-US',
    );

    expect(prepared.effectiveDraft.accounts.map(account => account.balance)).toEqual([-12.34, 0]);
    expect(prepared.isValid).toBe(true);
  });

  it('keeps dependent entries out of the effective draft without spendable cash', () => {
    const prepared = prepareCashClarityInput(
      draft({
        accounts: [{ id: 'card', kind: 'card', name: 'Card', balance: 0 }],
        income: {
          kind: 'recurring',
          items: [
            {
              id: 'salary',
              name: 'Salary',
              source: 'salary',
              amount: 25000,
              interval: PlannedPaymentInterval.MONTHLY,
              intervalN: 1,
              nextDate: now.add(1, 'day').valueOf(),
            },
          ],
        },
      }),
      { amountTextById: { card: '0', salary: '25000' } },
      'en-US',
    );

    expect(prepared.effectiveDraft.income).toEqual({ kind: 'skipped' });
    expect(prepared.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ collection: 'income', field: 'dependency' })]),
    );
  });
});
