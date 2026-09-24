import { TransactionType } from '@/src/types/enums';
import { fromMinorUnits, toMinorUnits } from '@/src/utils/money';
import { sanitizeAmount } from '@/src/utils/validation';

export interface JournalBalanceLineInput {
  id: string;
  accountId: string;
  accountCurrency?: string;
  amount: string | number;
  exchangeRate?: string | number;
  transactionType: TransactionType;
}

export type JournalBalanceIssueCode =
  | 'invalid_journal_currency'
  | 'missing_currency_precision'
  | 'invalid_currency_precision'
  | 'missing_line_currency'
  | 'invalid_amount'
  | 'amount_out_of_range'
  | 'missing_exchange_rate'
  | 'invalid_exchange_rate'
  | 'invalid_structure'
  | 'unbalanced';

export interface JournalBalanceIssue {
  code: JournalBalanceIssueCode;
  message: string;
  lineId?: string;
}

export interface EvaluatedJournalBalanceLine {
  id: string;
  accountId: string;
  accountCurrency: string;
  nativePrecision: number;
  transactionType: TransactionType;
  nativeAmountMinorUnits: number;
  nativeAmount: number;
  exchangeRate: number;
  journalAmountMinorUnits: number;
  journalAmount: number;
}

export interface JournalBalanceEvaluation {
  journalCurrency: string;
  journalPrecision: number;
  lineValues: EvaluatedJournalBalanceLine[];
  debitTotalMinorUnits: number;
  creditTotalMinorUnits: number;
  differenceMinorUnits: number;
  journalTotalAmount?: number;
  isBalanced: boolean;
  issues: JournalBalanceIssue[];
}

export interface EvaluateJournalBalanceInput {
  lines: readonly JournalBalanceLineInput[];
  journalCurrency: string;
  precisionByCurrency: ReadonlyMap<string, number>;
}

export type JournalBalancePolicy = 'legacy' | 'exact';

export class JournalBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalBalanceError';
  }
}

function normalizeCode(code: string | undefined): string {
  return code?.trim().toUpperCase() ?? '';
}

function formatMinorUnits(minorUnits: number, precision: number): number {
  return fromMinorUnits(minorUnits, precision);
}

function formatDifference(minorUnits: number, precision: number, currency: string): string {
  return `${formatMinorUnits(Math.abs(minorUnits), precision).toFixed(precision)} ${currency}`;
}

export function evaluateJournalBalance({
  lines,
  journalCurrency: requestedJournalCurrency,
  precisionByCurrency: requestedPrecisions,
}: EvaluateJournalBalanceInput): JournalBalanceEvaluation {
  const journalCurrency = normalizeCode(requestedJournalCurrency);
  const precisionByCurrency = new Map(
    [...requestedPrecisions.entries()].map(([code, precision]) => [normalizeCode(code), precision]),
  );
  const issues: JournalBalanceIssue[] = [];
  const lineValues: EvaluatedJournalBalanceLine[] = [];

  if (lines.length < 2) {
    issues.push({
      code: 'invalid_structure',
      message: 'A journal needs at least two posting lines',
    });
  }

  if (!/^[A-Z]{3}$/.test(journalCurrency)) {
    issues.push({
      code: 'invalid_journal_currency',
      message: 'A three-letter journal currency is required',
    });
  }

  const journalPrecision = precisionByCurrency.get(journalCurrency);
  if (journalPrecision === undefined) {
    issues.push({
      code: 'missing_currency_precision',
      message: `Currency precision is unavailable for ${journalCurrency || 'journal currency'}`,
    });
  } else if (!Number.isInteger(journalPrecision) || journalPrecision < 0 || journalPrecision > 9) {
    issues.push({
      code: 'invalid_currency_precision',
      message: `Currency precision is invalid for ${journalCurrency}`,
    });
  }

  let debitTotalMinorUnits = 0;
  let creditTotalMinorUnits = 0;

  for (const line of lines) {
    const accountCurrency = normalizeCode(line.accountCurrency);
    if (!accountCurrency) {
      issues.push({
        code: 'missing_line_currency',
        message: 'Every posting line needs an account currency',
        lineId: line.id,
      });
      continue;
    }

    const nativePrecision = precisionByCurrency.get(accountCurrency);
    if (nativePrecision === undefined) {
      issues.push({
        code: 'missing_currency_precision',
        message: `Currency precision is unavailable for ${accountCurrency}`,
        lineId: line.id,
      });
      continue;
    }
    if (!Number.isInteger(nativePrecision) || nativePrecision < 0 || nativePrecision > 9) {
      issues.push({
        code: 'invalid_currency_precision',
        message: `Currency precision is invalid for ${accountCurrency}`,
        lineId: line.id,
      });
      continue;
    }

    const amount =
      typeof line.amount === 'number'
        ? line.amount
        : (sanitizeAmount(line.amount, nativePrecision) ?? Number.NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      issues.push({
        code: 'invalid_amount',
        message: 'Posting amounts must be greater than zero',
        lineId: line.id,
      });
      continue;
    }

    const nativeAmountMinorUnits = toMinorUnits(amount, nativePrecision);
    const nativeAmount = formatMinorUnits(nativeAmountMinorUnits, nativePrecision);
    const isJournalCurrencyLine = accountCurrency === journalCurrency;
    const rawExchangeRate =
      typeof line.exchangeRate === 'number'
        ? line.exchangeRate
        : line.exchangeRate?.trim()
          ? Number(line.exchangeRate)
          : undefined;

    let exchangeRate = 1;
    if (!isJournalCurrencyLine) {
      if (rawExchangeRate === undefined) {
        issues.push({
          code: 'missing_exchange_rate',
          message: `A line in ${accountCurrency} needs an exchange rate to ${journalCurrency}`,
          lineId: line.id,
        });
        continue;
      }
      if (!Number.isFinite(rawExchangeRate) || rawExchangeRate <= 0) {
        issues.push({
          code: 'invalid_exchange_rate',
          message: 'Exchange rates must be greater than zero',
          lineId: line.id,
        });
        continue;
      }
      exchangeRate = rawExchangeRate;
    }

    if (journalPrecision === undefined || !Number.isInteger(journalPrecision)) continue;

    const journalAmountMinorUnits = toMinorUnits(nativeAmount * exchangeRate, journalPrecision);
    if (
      !Number.isSafeInteger(nativeAmountMinorUnits) ||
      !Number.isSafeInteger(journalAmountMinorUnits)
    ) {
      issues.push({
        code: 'amount_out_of_range',
        message: 'Posting amount exceeds the supported precision range',
        lineId: line.id,
      });
      continue;
    }

    lineValues.push({
      id: line.id,
      accountId: line.accountId,
      accountCurrency,
      nativePrecision,
      transactionType: line.transactionType,
      nativeAmountMinorUnits,
      nativeAmount,
      exchangeRate,
      journalAmountMinorUnits,
      journalAmount: formatMinorUnits(journalAmountMinorUnits, journalPrecision),
    });

    if (line.transactionType === TransactionType.DEBIT) {
      debitTotalMinorUnits += journalAmountMinorUnits;
    } else if (line.transactionType === TransactionType.CREDIT) {
      creditTotalMinorUnits += journalAmountMinorUnits;
    }
    if (
      !Number.isSafeInteger(debitTotalMinorUnits) ||
      !Number.isSafeInteger(creditTotalMinorUnits)
    ) {
      issues.push({
        code: 'amount_out_of_range',
        message: 'Journal total exceeds the supported precision range',
      });
      break;
    }
  }

  const differenceMinorUnits = debitTotalMinorUnits - creditTotalMinorUnits;
  const isBalanced = issues.length === 0 && differenceMinorUnits === 0;
  if (issues.length === 0 && differenceMinorUnits !== 0 && journalPrecision !== undefined) {
    issues.push({
      code: 'unbalanced',
      message: `Journal debits and credits differ by ${formatDifference(
        differenceMinorUnits,
        journalPrecision,
        journalCurrency,
      )}`,
    });
  }

  return {
    journalCurrency,
    journalPrecision: journalPrecision ?? 2,
    lineValues,
    debitTotalMinorUnits,
    creditTotalMinorUnits,
    differenceMinorUnits,
    journalTotalAmount:
      isBalanced && journalPrecision !== undefined
        ? formatMinorUnits(debitTotalMinorUnits, journalPrecision)
        : undefined,
    isBalanced,
    issues,
  };
}

export type CurrencyPrecisionResolver = (currencyCode: string) => number | Promise<number>;

/** Resolves the precision of each distinct currency code, keyed by normalized code. */
export async function resolveCurrencyPrecisions(
  currencyCodes: Iterable<string | undefined>,
  getPrecision: CurrencyPrecisionResolver,
): Promise<Map<string, number>> {
  const codes = new Set([...currencyCodes].map(normalizeCode).filter(Boolean));
  return new Map(
    await Promise.all([...codes].map(async code => [code, await getPrecision(code)] as const)),
  );
}

export type JournalLineValues = Omit<JournalBalanceLineInput, 'id' | 'accountCurrency'> & {
  id?: string;
};

/**
 * Evaluates journal lines against their account currencies, resolving every needed precision.
 * Lines without an explicit id are identified by their index.
 */
export async function evaluateJournalLines({
  journalCurrency,
  lines,
  accountCurrencyById,
  getPrecision,
}: {
  journalCurrency: string;
  lines: readonly JournalLineValues[];
  accountCurrencyById: ReadonlyMap<string, string | undefined>;
  getPrecision: CurrencyPrecisionResolver;
}): Promise<JournalBalanceEvaluation> {
  const precisionByCurrency = await resolveCurrencyPrecisions(
    [journalCurrency, ...lines.map(line => accountCurrencyById.get(line.accountId))],
    getPrecision,
  );
  return evaluateJournalBalance({
    journalCurrency,
    precisionByCurrency,
    lines: lines.map((line, index) => ({
      id: line.id ?? String(index),
      accountId: line.accountId,
      accountCurrency: accountCurrencyById.get(line.accountId),
      amount: line.amount,
      exchangeRate: line.exchangeRate,
      transactionType: line.transactionType,
    })),
  });
}
