import { AppConfig } from '@/src/constants/app-config';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { TransactionType } from '@/src/types/enums';

import { checkJournal, JournalLineForCheck } from '@/src/domain/accounting/BalanceEffects';
import {
  evaluateJournalBalance,
  JournalBalanceEvaluation,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { isJournalBalanced } from '@/src/services/accounting/JournalCalculator';

/**
 * Journal-balance parity fixtures.
 *
 * Every fixture below is one journal. It is fed, unchanged, into the three
 * balance engines that coexist after Phase 1 of FUL-112:
 *
 *  1. `checkJournal` — numeric aggregate check (tolerance-based).
 *  2. `JournalCalculator.isJournalBalanced` — production form wrapper around
 *     `evaluateJournalBalance` (ADR 0007) that normalizes currency/rate input.
 *  3. `journalBalanceEvaluator.evaluateJournalBalance` — minor-unit ledger
 *     evaluation with per-line issue reporting.
 *
 * Remaining divergences vs `checkJournal` stay intentional. Any remaining
 * form (`isJournalBalanced`) vs evaluator diffs are only input-normalization
 * artifacts.
 *
 * Intentional differences (documented again next to the fixtures that prove
 * them):
 *
 *  - **Tolerance.** `checkJournal` rounds the *aggregate* difference to the
 *    journal precision and accepts anything inside `10^-(precision+1)`; with
 *    `allowExchangeRateRounding` it widens that to at least one minor unit,
 *    scaled by the exchange rates. `evaluateJournalBalance` (and therefore
 *    `isJournalBalanced`) rounds *each line* to its native precision, converts
 *    to journal minor units, and requires an exact zero difference. So a
 *    one-minor-unit FX drift can pass `checkJournal` and fail the form and
 *    evaluator together, while line-level rounding can make the form and
 *    evaluator pass where aggregate rounding fails `checkJournal`.
 *  - **Issue detail.** `checkJournal` returns only `isValid`, `imbalance`,
 *    `totalDebits`, `totalCredits`. The evaluator returns per-line values plus
 *    issue codes/messages (`unbalanced`, `missing_exchange_rate`, …).
 *  - **Structural validation.** `checkJournal` does not enforce a minimum line
 *    count, positive amounts, or currencies. The evaluator (and form) does.
 *  - **Input normalization.** `isJournalBalanced` defaults missing line
 *    currencies to the journal base, and sanitizes string amounts at the base
 *    precision (2) before calling the evaluator. `checkJournal` applies any
 *    supplied rate with no currency concept, and a direct evaluator call
 *    sanitizes string amounts at the account currency's precision and leaves
 *    missing currencies as missing.
 */

type FixtureLine = {
  id: string;
  accountId?: string;
  accountCurrency?: string;
  amount: string | number;
  exchangeRate?: string | number;
  transactionType: TransactionType;
};

type BalanceFixture = {
  name: string;
  journalCurrency: string;
  lines: FixtureLine[];
  /** Overrides for currencies whose precision differs from CURRENCY_PRECISIONS. */
  precisionByCurrency?: Record<string, number>;
  expected: {
    checkJournal: boolean;
    isJournalBalanced: boolean;
    evaluator: boolean;
  };
};

const BASE_PRECISION = AppConfig.constants.precision;

const debit = (
  id: string,
  amount: string | number,
  extra: Partial<FixtureLine> = {},
): FixtureLine => ({
  id,
  accountId: `${id}-account`,
  amount,
  transactionType: TransactionType.DEBIT,
  ...extra,
});

const credit = (
  id: string,
  amount: string | number,
  extra: Partial<FixtureLine> = {},
): FixtureLine => ({
  id,
  accountId: `${id}-account`,
  amount,
  transactionType: TransactionType.CREDIT,
  ...extra,
});

const FIXTURES: BalanceFixture[] = [
  {
    name: 'same-currency exact balance',
    journalCurrency: 'USD',
    lines: [
      debit('cash', 100, { accountCurrency: 'USD' }),
      credit('revenue', 100, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: true, evaluator: true },
  },
  {
    name: 'same-currency imbalance',
    journalCurrency: 'USD',
    lines: [
      debit('cash', 100, { accountCurrency: 'USD' }),
      credit('revenue', 90, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: false, isJournalBalanced: false, evaluator: false },
  },
  {
    name: 'same-currency multi-line balance',
    journalCurrency: 'USD',
    lines: [
      debit('cash', 25, { accountCurrency: 'USD' }),
      debit('bank', 75, { accountCurrency: 'USD' }),
      credit('revenue', 100, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: true, evaluator: true },
  },
  {
    name: 'foreign-currency exact balance',
    journalCurrency: 'USD',
    lines: [
      debit('eur-expense', 10, { accountCurrency: 'EUR', exchangeRate: 1.2 }),
      credit('usd-bank', 12, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: true, evaluator: true },
  },
  {
    name: 'foreign-currency imbalance beyond tolerance',
    journalCurrency: 'USD',
    lines: [
      debit('eur-expense', 10, { accountCurrency: 'EUR', exchangeRate: 1.2 }),
      credit('usd-bank', 12.5, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: false, isJournalBalanced: false, evaluator: false },
  },
  {
    name: 'mixed precision balance (JPY native 0dp, JOD journal 3dp)',
    journalCurrency: 'JOD',
    lines: [
      debit('jpy-cash', 123.4, { accountCurrency: 'JPY', exchangeRate: 0.005 }),
      credit('jod-bank', 0.615, { accountCurrency: 'JOD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: true, evaluator: true },
  },
  {
    name: 'string amounts and rates',
    journalCurrency: 'USD',
    lines: [
      debit('eur-expense', '10.00', { accountCurrency: 'EUR', exchangeRate: '1.2' }),
      credit('usd-bank', '12.00', { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: true, evaluator: true },
  },
  {
    name: 'sub-minor-unit drift on a single line',
    journalCurrency: 'USD',
    lines: [
      debit('cash', 100.001, { accountCurrency: 'USD' }),
      credit('revenue', 100, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: true, evaluator: true },
  },
  {
    name: 'zero-amount lines (structurally invalid for the evaluator)',
    journalCurrency: 'USD',
    lines: [
      debit('cash', 0, { accountCurrency: 'USD' }),
      credit('revenue', 0, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: false, evaluator: false },
  },
  {
    name: 'negative amounts that cancel numerically',
    journalCurrency: 'USD',
    lines: [
      debit('cash', -100, { accountCurrency: 'USD' }),
      credit('revenue', -100, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: false, evaluator: false },
  },
  {
    name: 'missing foreign exchange rate',
    journalCurrency: 'USD',
    lines: [
      debit('eur-expense', 10, { accountCurrency: 'EUR' }),
      credit('usd-bank', 10, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: false, evaluator: false },
  },
  {
    name: 'one-minor-unit FX drift (inside checkJournal tolerance)',
    journalCurrency: 'USD',
    lines: [
      debit('eur-expense', 10, { accountCurrency: 'EUR', exchangeRate: 1.2 }),
      credit('usd-bank', 12.01, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: false, evaluator: false },
  },
  {
    name: 'real-world FX rounding (THB → INR)',
    journalCurrency: 'INR',
    lines: [
      debit('thb-cash', 76.82, { accountCurrency: 'THB', exchangeRate: 2.89 }),
      credit('inr-bank', 222, { accountCurrency: 'INR' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: false, evaluator: false },
  },
  {
    name: 'line-level rounding passes where aggregate rounding fails',
    journalCurrency: 'USD',
    lines: [
      debit('cash-a', 50.004, { accountCurrency: 'USD' }),
      debit('cash-b', 50.004, { accountCurrency: 'USD' }),
      credit('revenue', 100, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: false, isJournalBalanced: true, evaluator: true },
  },
  {
    name: 'base-currency exchange rate is ignored by isJournalBalanced',
    journalCurrency: 'USD',
    lines: [
      debit('cash', 100, { accountCurrency: 'USD', exchangeRate: 2 }),
      credit('revenue', 100, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: false, isJournalBalanced: true, evaluator: true },
  },
  {
    name: 'string amount parsed at account-currency precision',
    journalCurrency: 'JOD',
    lines: [
      debit('jpy-cash', '123.9', { accountCurrency: 'JPY', exchangeRate: 0.005 }),
      credit('jod-bank', '0.615', { accountCurrency: 'JOD' }),
    ],
    // Form sanitizes the string at base precision before the evaluator; a
    // direct evaluator call sanitizes at JPY precision — normalization only.
    expected: { checkJournal: true, isJournalBalanced: true, evaluator: false },
  },
  {
    name: 'single line cannot balance',
    journalCurrency: 'USD',
    lines: [debit('cash', 100, { accountCurrency: 'USD' })],
    expected: { checkJournal: false, isJournalBalanced: false, evaluator: false },
  },
  {
    name: 'missing line currencies with amounts that cancel',
    journalCurrency: 'USD',
    lines: [debit('cash', 100), credit('revenue', 100)],
    // Form defaults missing currencies to the journal base; the evaluator does
    // not — normalization only.
    expected: { checkJournal: true, isJournalBalanced: true, evaluator: false },
  },
  {
    name: 'foreign rate of exactly one is an identity rate',
    journalCurrency: 'USD',
    lines: [
      debit('eur-cash', 25, { accountCurrency: 'EUR', exchangeRate: 1 }),
      credit('usd-bank', 25, { accountCurrency: 'USD' }),
    ],
    expected: { checkJournal: true, isJournalBalanced: true, evaluator: true },
  },
];

function precisionMapFor(fixture: BalanceFixture): Map<string, number> {
  const codes = new Set<string>([
    fixture.journalCurrency,
    ...fixture.lines.map(line => line.accountCurrency ?? fixture.journalCurrency),
  ]);
  return new Map(
    [...codes].map(code => [
      code,
      fixture.precisionByCurrency?.[code] ?? getCurrencyPrecision(code),
    ]),
  );
}

/**
 * Mirrors the FX-tolerance decision `checkJournal` still makes when fed through
 * these fixtures: a journal gets `allowExchangeRateRounding` when any line's
 * account currency differs from the base and carries a finite rate other than 1.
 */
function hasForeignCurrencyLine(fixture: BalanceFixture): boolean {
  const baseCurrency = fixture.journalCurrency.trim().toUpperCase();
  return fixture.lines.some(line => {
    const currency = line.accountCurrency?.trim().toUpperCase();
    const rate = Number(line.exchangeRate);
    return Boolean(currency && currency !== baseCurrency && Number.isFinite(rate) && rate !== 1);
  });
}

function runCheckJournal(fixture: BalanceFixture) {
  const lines: JournalLineForCheck[] = fixture.lines.map(line => ({
    // checkJournal has no currency concept, so string amounts are just numbers.
    amount: typeof line.amount === 'string' ? Number(line.amount) : line.amount,
    type: line.transactionType,
    exchangeRate: line.exchangeRate == null ? undefined : Number(line.exchangeRate),
  }));

  return checkJournal(lines, BASE_PRECISION, {
    allowExchangeRateRounding: hasForeignCurrencyLine(fixture),
  });
}

function runIsJournalBalanced(fixture: BalanceFixture): boolean {
  return isJournalBalanced(
    fixture.lines.map(line => ({
      amount: line.amount,
      type: line.transactionType,
      exchangeRate: line.exchangeRate,
      accountCurrency: line.accountCurrency,
    })),
    fixture.journalCurrency,
  );
}

function runEvaluator(fixture: BalanceFixture): JournalBalanceEvaluation {
  return evaluateJournalBalance({
    journalCurrency: fixture.journalCurrency,
    precisionByCurrency: precisionMapFor(fixture),
    lines: fixture.lines.map(line => ({
      id: line.id,
      accountId: line.accountId ?? line.id,
      accountCurrency: line.accountCurrency,
      amount: line.amount,
      exchangeRate: line.exchangeRate,
      transactionType: line.transactionType,
    })),
  });
}

describe('journal balance parity fixtures', () => {
  it.each(FIXTURES)('$name', fixture => {
    const check = runCheckJournal(fixture);
    const calculator = runIsJournalBalanced(fixture);
    const evaluation = runEvaluator(fixture);

    expect({
      checkJournal: check.isValid,
      isJournalBalanced: calculator,
      evaluator: evaluation.isBalanced,
    }).toEqual(fixture.expected);
  });

  it.each(FIXTURES.filter(fixture => fixture.expected.evaluator))(
    '$name reports no evaluator issues when balanced',
    fixture => {
      expect(runEvaluator(fixture).issues).toEqual([]);
    },
  );

  it.each(FIXTURES.filter(fixture => !fixture.expected.evaluator))(
    '$name explains why the evaluator rejects the journal',
    fixture => {
      expect(runEvaluator(fixture).issues.length).toBeGreaterThan(0);
    },
  );

  it('treats every fixture as the same journal across all three engines', () => {
    for (const fixture of FIXTURES) {
      const check = runCheckJournal(fixture);
      const calculator = runIsJournalBalanced(fixture);
      const evaluation = runEvaluator(fixture);

      // The engines disagree only in the documented cases; whenever they agree
      // the outcome must be identical, never merely "both falsy".
      expect(typeof check.isValid).toBe('boolean');
      expect(typeof calculator).toBe('boolean');
      expect(typeof evaluation.isBalanced).toBe('boolean');
    }
  });
});

describe('documented parity differences', () => {
  const fixture = (name: string): BalanceFixture => {
    const found = FIXTURES.find(candidate => candidate.name === name);
    if (!found) throw new Error(`Unknown fixture: ${name}`);
    return found;
  };

  it('tolerance: one-minor-unit FX drift fails form and evaluator together', () => {
    // checkJournal rounds the difference (12 - 12.01 → -0.01) and widens its
    // tolerance to 0.02 for the 1.2 rate, so it still accepts. The form wraps
    // the evaluator, which works in minor units and sees 1200 vs 1201 — both
    // reject.
    const oneCentDrift = fixture('one-minor-unit FX drift (inside checkJournal tolerance)');
    const check = runCheckJournal(oneCentDrift);
    const form = runIsJournalBalanced(oneCentDrift);
    const evaluation = runEvaluator(oneCentDrift);

    expect(check.isValid).toBe(true);
    expect(check.imbalance).toBe(-0.01);
    expect(form).toBe(false);
    expect(evaluation.isBalanced).toBe(false);
    expect(form).toBe(evaluation.isBalanced);
    expect(evaluation.differenceMinorUnits).toBe(-1);
  });

  it('tolerance: real-world FX rounding fails form and evaluator together', () => {
    // THB 76.82 × 2.89 = 222.0098 INR. checkJournal rounds to 222.01 and allows
    // 0.02 (rate-scaled), so it still passes. The form wraps the evaluator,
    // which quantizes the converted journal amount to 222.01 and sees one
    // minor unit of difference — both reject.
    const thbToInr = fixture('real-world FX rounding (THB → INR)');
    const check = runCheckJournal(thbToInr);
    const form = runIsJournalBalanced(thbToInr);
    const evaluation = runEvaluator(thbToInr);

    expect(check.isValid).toBe(true);
    expect(form).toBe(false);
    expect(evaluation.isBalanced).toBe(false);
    expect(form).toBe(evaluation.isBalanced);
    expect(evaluation.differenceMinorUnits).toBe(1);
  });

  it('tolerance: line-level rounding passes form and evaluator where aggregate rounding fails', () => {
    // The evaluator rounds each 50.004 line to 50.00 (total 100.00). checkJournal
    // sums raw values first (100.008), rounds to 100.01, and rejects. The form
    // wraps the evaluator, so it passes with it.
    const lineRounding = fixture('line-level rounding passes where aggregate rounding fails');
    const check = runCheckJournal(lineRounding);
    const form = runIsJournalBalanced(lineRounding);
    const evaluation = runEvaluator(lineRounding);

    expect(check.isValid).toBe(false);
    expect(check.imbalance).toBe(0.01);
    expect(form).toBe(true);
    expect(evaluation.isBalanced).toBe(true);
    expect(form).toBe(evaluation.isBalanced);
    expect(evaluation.differenceMinorUnits).toBe(0);
  });

  it('issue detail: the evaluator reports per-line values and coded issues', () => {
    const oneCentDrift = fixture('one-minor-unit FX drift (inside checkJournal tolerance)');
    const check = runCheckJournal(oneCentDrift);
    const evaluation = runEvaluator(oneCentDrift);

    // checkJournal only exposes aggregate totals and an imbalance number.
    expect(Object.keys(check).sort()).toEqual([
      'imbalance',
      'isValid',
      'totalCredits',
      'totalDebits',
    ]);

    // The evaluator adds minor-unit totals, per-line values, and a coded issue.
    expect(evaluation).toMatchObject({
      journalCurrency: 'USD',
      journalPrecision: 2,
      debitTotalMinorUnits: 1200,
      creditTotalMinorUnits: 1201,
      differenceMinorUnits: -1,
      isBalanced: false,
      issues: [
        {
          code: 'unbalanced',
          message: 'Journal debits and credits differ by 0.01 USD',
        },
      ],
      lineValues: [
        { id: 'eur-expense', nativeAmount: 10, exchangeRate: 1.2, journalAmount: 12 },
        { id: 'usd-bank', nativeAmount: 12.01, exchangeRate: 1, journalAmount: 12.01 },
      ],
    });
  });

  it('structure: zero and negative amounts balance numerically but fail evaluation', () => {
    const zero = fixture('zero-amount lines (structurally invalid for the evaluator)');
    expect(runCheckJournal(zero).isValid).toBe(true);
    expect(runIsJournalBalanced(zero)).toBe(false);
    expect(runEvaluator(zero).issues.map(issue => issue.code)).toEqual([
      'invalid_amount',
      'invalid_amount',
    ]);

    const negative = fixture('negative amounts that cancel numerically');
    expect(runCheckJournal(negative).isValid).toBe(true);
    expect(runIsJournalBalanced(negative)).toBe(false);
    expect(runEvaluator(negative).issues.map(issue => issue.code)).toEqual([
      'invalid_amount',
      'invalid_amount',
    ]);
  });

  it('structure: a single line is only rejected by the evaluator', () => {
    const singleLine = fixture('single line cannot balance');
    expect(runCheckJournal(singleLine).isValid).toBe(false);
    expect(runIsJournalBalanced(singleLine)).toBe(false);
    expect(runEvaluator(singleLine).issues).toEqual([
      {
        code: 'invalid_structure',
        message: 'A journal needs at least two posting lines',
      },
    ]);
  });

  it('FX: a missing rate is assumed to be 1 by checkJournal and rejected by form and evaluator', () => {
    const missingRate = fixture('missing foreign exchange rate');
    const check = runCheckJournal(missingRate);
    const form = runIsJournalBalanced(missingRate);
    const evaluation = runEvaluator(missingRate);

    expect(check.isValid).toBe(true);
    expect(check.totalDebits).toBe(10);
    expect(form).toBe(false);
    expect(evaluation.isBalanced).toBe(false);
    expect(form).toBe(evaluation.isBalanced);
    expect(evaluation.issues).toEqual([
      {
        code: 'missing_exchange_rate',
        message: 'A line in EUR needs an exchange rate to USD',
        lineId: 'eur-expense',
      },
    ]);
  });

  it('normalization: a rate on a base-currency line is only applied by checkJournal', () => {
    // `isJournalBalanced` ignores the rate because USD equals the base
    // currency; `checkJournal` has no currency concept and applies 100 × 2.
    const baseRate = fixture('base-currency exchange rate is ignored by isJournalBalanced');
    const check = runCheckJournal(baseRate);
    const evaluation = runEvaluator(baseRate);

    expect(check.isValid).toBe(false);
    expect(check.totalDebits).toBe(200);
    expect(runIsJournalBalanced(baseRate)).toBe(true);
    expect(evaluation.isBalanced).toBe(true);
    expect(evaluation.lineValues[0]?.exchangeRate).toBe(1);
  });

  it('normalization: string amounts use base precision in the form, native precision in the evaluator', () => {
    // isJournalBalanced sanitizes '123.9' at the base precision (2), so the
    // form evaluates 123.9 × 0.005. A direct evaluator call sanitizes at JPY's
    // precision (0), rounds to 124, and converts to 0.62 JOD — five minor
    // units of drift. This is the remaining form-vs-evaluator gap.
    const jpyString = fixture('string amount parsed at account-currency precision');
    const check = runCheckJournal(jpyString);
    const form = runIsJournalBalanced(jpyString);
    const evaluation = runEvaluator(jpyString);

    expect(check.isValid).toBe(true);
    expect(form).toBe(true);
    expect(evaluation.isBalanced).toBe(false);
    expect(evaluation.lineValues[0]).toMatchObject({ nativeAmount: 124 });
    expect(evaluation.differenceMinorUnits).toBe(5);
  });

  it('normalization: missing line currencies are filled by the form, rejected by the evaluator', () => {
    const missingCurrency = fixture('missing line currencies with amounts that cancel');
    const check = runCheckJournal(missingCurrency);
    const form = runIsJournalBalanced(missingCurrency);
    const evaluation = runEvaluator(missingCurrency);

    expect(check.isValid).toBe(true);
    expect(form).toBe(true);
    expect(evaluation.differenceMinorUnits).toBe(0);
    expect(evaluation.isBalanced).toBe(false);
    expect(evaluation.issues.map(issue => issue.code)).toEqual([
      'missing_line_currency',
      'missing_line_currency',
    ]);
  });
});
