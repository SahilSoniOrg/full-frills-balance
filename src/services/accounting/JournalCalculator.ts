import { AppConfig } from '@/src/constants/app-config';
import { TransactionType } from '@/src/types/enums';

import { checkJournal, JournalLineForCheck } from '@/src/utils/accounting/BalanceEffects';
import { roundToPrecision } from '@/src/utils/money';
import { sanitizeAmount } from '@/src/utils/validation';

interface JournalLineInput {
  amount: number | string;
  type: TransactionType;
  exchangeRate?: number | string;
  accountCurrency?: string;
}

export function isJournalBalanced(lines: JournalLineInput[], baseCurrency: string): boolean {
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  const forCheck: JournalLineForCheck[] = lines.map(line => {
    const currency = line.accountCurrency?.trim().toUpperCase();
    const rate = Number(line.exchangeRate);
    const isForeignCurrencyLine = Boolean(
      currency && currency !== normalizedBaseCurrency && Number.isFinite(rate) && rate > 0,
    );
    return {
      amount: typeof line.amount === 'string' ? (sanitizeAmount(line.amount) ?? 0) : line.amount,
      type: line.type,
      exchangeRate: isForeignCurrencyLine ? rate : 1,
    };
  });
  const hasForeignCurrencyLine = lines.some(line => {
    const currency = line.accountCurrency?.trim().toUpperCase();
    const rate = Number(line.exchangeRate);
    return Boolean(
      currency && currency !== normalizedBaseCurrency && Number.isFinite(rate) && rate !== 1,
    );
  });
  return checkJournal(forCheck, AppConfig.constants.precision, {
    allowExchangeRateRounding: hasForeignCurrencyLine,
  }).isValid;
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
