import { TransactionType } from '@/src/types/enums';
import { fromMinorUnits } from '@/src/utils/money';
import { sanitizeAmount } from '@/src/utils/validation';
import { convertJournalCurrencyAmount, resolveJournalFxRate } from './journalFx';

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

    const rate = resolveJournalFxRate({
      accountCurrency,
      journalCurrency,
      importedRate: line.exchangeRate,
    });
    if (rate.rate === undefined) {
      if (rate.source === 'missing') {
        issues.push({
          code: 'missing_exchange_rate',
          message: `A line in ${accountCurrency} needs an exchange rate to ${journalCurrency}`,
          lineId: line.id,
        });
      } else {
        issues.push({
          code: 'invalid_exchange_rate',
          message: 'Exchange rates must be greater than zero',
          lineId: line.id,
        });
      }
      continue;
    }

    const exchangeRate = rate.rate;

    if (journalPrecision === undefined || !Number.isInteger(journalPrecision)) continue;

    const conversion = convertJournalCurrencyAmount({
      nativeAmount: amount,
      nativePrecision,
      exchangeRate,
      journalPrecision,
    });
    const { nativeAmountMinorUnits, nativeAmount, journalAmountMinorUnits, journalAmount } =
      conversion;
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
      journalAmount,
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

export interface UniqueJournalFxRateProposal {
  readonly transactionId: string;
  readonly exchangeRate: number;
  readonly evaluation: JournalBalanceEvaluation;
}

/**
 * Infer the only rate that can balance a journal while preserving every native amount.
 * This is intentionally limited to journals with exactly one foreign-currency line.
 */
export function proposeUniqueJournalFxRate(
  input: EvaluateJournalBalanceInput,
): UniqueJournalFxRateProposal | undefined {
  const journalCurrency = normalizeCode(input.journalCurrency);
  if (!journalCurrency || input.lines.length < 2) return undefined;

  const linesWithCurrency = input.lines.filter(line => normalizeCode(line.accountCurrency));
  if (linesWithCurrency.length !== input.lines.length) return undefined;

  const foreignLines = input.lines.filter(
    line => normalizeCode(line.accountCurrency) !== journalCurrency,
  );
  if (foreignLines.length !== 1) return undefined;
  const candidate = foreignLines[0];
  if (!candidate) return undefined;

  const evaluate = (exchangeRate?: number) =>
    evaluateJournalBalance({
      ...input,
      lines: input.lines.map(line => (line.id === candidate.id ? { ...line, exchangeRate } : line)),
    });

  const candidateAtUnitRate = evaluate(1);
  if (
    candidateAtUnitRate.issues.some(issue => issue.code !== 'unbalanced') ||
    candidateAtUnitRate.lineValues.length !== input.lines.length
  ) {
    return undefined;
  }
  const candidateValue = candidateAtUnitRate.lineValues.find(line => line.id === candidate.id);
  if (!candidateValue || candidateValue.nativeAmount <= 0) return undefined;

  const withoutCandidateRate = evaluate(undefined);
  if (
    withoutCandidateRate.issues.length !== 1 ||
    withoutCandidateRate.issues[0]?.lineId !== candidate.id ||
    !['missing_exchange_rate', 'invalid_exchange_rate'].includes(
      withoutCandidateRate.issues[0]?.code ?? '',
    )
  ) {
    return undefined;
  }

  const neededMinorUnits =
    candidate.transactionType === TransactionType.DEBIT
      ? withoutCandidateRate.creditTotalMinorUnits - withoutCandidateRate.debitTotalMinorUnits
      : withoutCandidateRate.debitTotalMinorUnits - withoutCandidateRate.creditTotalMinorUnits;
  if (!Number.isSafeInteger(neededMinorUnits) || neededMinorUnits <= 0) return undefined;

  const neededJournalAmount = fromMinorUnits(
    neededMinorUnits,
    candidateAtUnitRate.journalPrecision,
  );
  const exchangeRate = neededJournalAmount / candidateValue.nativeAmount;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return undefined;

  const evaluation = evaluate(exchangeRate);
  return evaluation.isBalanced
    ? { transactionId: candidate.id, exchangeRate, evaluation }
    : undefined;
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
