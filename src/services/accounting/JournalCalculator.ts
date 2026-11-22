import { TransactionType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';

import { evaluateJournalBalance } from '@/src/domain/accounting/journalBalanceEvaluator';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { roundToPrecision } from '@/src/domain/money/money';
import { sanitizeAmount } from '@/src/domain/money/amountInput';

interface JournalLineInput {
  amount: number | string;
  type: TransactionType;
  exchangeRate?: number | string;
  accountCurrency?: string;
}

export function isJournalBalanced(lines: JournalLineInput[], baseCurrency: string): boolean {
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  const normalized = lines.map((line, index) => ({
    id: String(index),
    accountId: asAccountId(String(index)),
    amount: typeof line.amount === 'string' ? (sanitizeAmount(line.amount) ?? 0) : line.amount,
    transactionType: line.type,
    accountCurrency: line.accountCurrency?.trim().toUpperCase() || normalizedBaseCurrency,
    exchangeRate: line.exchangeRate,
  }));
  const currencies = new Set([normalizedBaseCurrency, ...normalized.map(line => line.accountCurrency)]);
  return evaluateJournalBalance({
    lines: normalized,
    journalCurrency: normalizedBaseCurrency,
    precisionByCurrency: new Map([...currencies].map(code => [code, getCurrencyPrecision(code)])),
  }).isBalanced;
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
    // Even for base currency, ensure we round to the currency precision
    // to avoid 10.100000000002 issues from manual entry or calculations
    return roundToPrecision(finalAmount, 2);
  }

  const baseAmount = finalAmount * rate;
  return roundToPrecision(baseAmount, 2);
}
