import { TransactionType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';

import { evaluateJournalBalance } from '@/src/domain/accounting/journalBalanceEvaluator';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, roundToPrecision } from '@/src/domain/money/money';
import { sanitizeAmount } from '@/src/domain/money/amountInput';

interface JournalLineInput {
  amount: number | string;
  type: TransactionType;
  exchangeRate?: number | string;
  accountCurrency?: string;
}

function evaluateComposerJournal(lines: JournalLineInput[], baseCurrency: string) {
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  const normalized = lines.map((line, index) => ({
    id: String(index),
    accountId: asAccountId(String(index)),
    // Pass strings through so the evaluator sanitizes at account-currency precision.
    amount: line.amount,
    transactionType: line.type,
    accountCurrency: line.accountCurrency?.trim().toUpperCase() || normalizedBaseCurrency,
    exchangeRate: line.exchangeRate,
  }));
  const currencies = new Set([
    normalizedBaseCurrency,
    ...normalized.map(line => line.accountCurrency),
  ]);
  return evaluateJournalBalance({
    lines: normalized,
    journalCurrency: normalizedBaseCurrency,
    precisionByCurrency: new Map([...currencies].map(code => [code, getCurrencyPrecision(code)])),
  });
}

export function isJournalBalanced(lines: JournalLineInput[], baseCurrency: string): boolean {
  return evaluateComposerJournal(lines, baseCurrency).isBalanced;
}

/** Credit/debit totals and remaining allocation from the same evaluator as isJournalBalanced. */
export function getJournalComposerTotals(
  lines: JournalLineInput[],
  baseCurrency: string,
): {
  fromTotal: number;
  toTotal: number;
  remaining: number;
  isBalanced: boolean;
  precision: number;
} {
  const evaluation = evaluateComposerJournal(lines, baseCurrency);
  const precision = evaluation.journalPrecision;
  const fromTotal = fromMinorUnits(evaluation.creditTotalMinorUnits, precision);
  const toTotal = fromMinorUnits(evaluation.debitTotalMinorUnits, precision);
  return {
    fromTotal,
    toTotal,
    // Advanced form: From = credits, To = debits; remaining left to allocate is credit − debit.
    remaining: fromMinorUnits(-evaluation.differenceMinorUnits, precision),
    isBalanced: evaluation.isBalanced,
    precision,
  };
}

export function getJournalLineBaseAmount(
  line: { amount: string | number; exchangeRate?: string | number; accountCurrency?: string },
  baseCurrency: string,
): number {
  if (line.amount == null) {
    return 0;
  }

  let amount: number;
  if (typeof line.amount === 'string') {
    const sanitized = sanitizeAmount(line.amount);
    if (sanitized === null || isNaN(sanitized)) {
      return 0;
    }
    amount = sanitized;
  } else {
    amount = line.amount;
  }

  const finalAmount = amount || 0;

  let rate = 1;
  if (line.exchangeRate != null) {
    const rateStr = line.exchangeRate.toString();
    const parsedRate = parseFloat(rateStr);
    if (!isNaN(parsedRate) && parsedRate > 0) {
      rate = parsedRate;
    }
  }

  const normalizedLineCurrency = line.accountCurrency?.trim().toUpperCase();
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  if (!normalizedLineCurrency || normalizedLineCurrency === normalizedBaseCurrency) {
    // Split-save compares allocation totals with two-decimal edge rounding.
    // Composer display totals use getJournalComposerTotals / the evaluator instead.
    return roundToPrecision(finalAmount, 2);
  }

  const baseAmount = finalAmount * rate;
  return roundToPrecision(baseAmount, 2);
}
