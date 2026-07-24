import { AppConfig } from '@/src/constants/app-config';
import { TransactionType } from '@/src/data/models/Transaction';
import { checkJournal, JournalLineForCheck } from '@/src/services/accounting/BalanceEffects';
import { sanitizeAmount } from '@/src/utils/validation';

export interface JournalLineWithRateCorrection {
  id: string;
  amount: string | number;
  transactionType: TransactionType;
  exchangeRate?: string | number;
  accountCurrency?: string;
}

export interface JournalLineInput {
  amount: number | string;
  type: TransactionType;
  exchangeRate?: number | string;
  accountCurrency?: string;
}

/**
 * Standard rounding for financial amounts (2 decimal places).
 * Uses EPSILON to avoid floating point precision errors.
 */
function roundAmount(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export class JournalCalculator {
  /**
   * Calculates the total debits from a list of lines.
   */
  static calculateTotalDebits(lines: JournalLineInput[], baseCurrency: string): number {
    return lines
      .filter(l => l.type === 'DEBIT')
      .reduce(
        (sum, l) =>
          sum +
          JournalCalculator.getLineBaseAmount(
            {
              amount: l.amount,
              exchangeRate: l.exchangeRate,
              accountCurrency: l.accountCurrency,
            },
            baseCurrency,
          ),
        0,
      );
  }

  /**
   * Calculates the total credits from a list of lines.
   */
  static calculateTotalCredits(lines: JournalLineInput[], baseCurrency: string): number {
    return lines
      .filter(l => l.type === 'CREDIT')
      .reduce(
        (sum, l) =>
          sum +
          JournalCalculator.getLineBaseAmount(
            {
              amount: l.amount,
              exchangeRate: l.exchangeRate,
              accountCurrency: l.accountCurrency,
            },
            baseCurrency,
          ),
        0,
      );
  }

  /**
   * Checks if the journal is balanced (delegates to BalanceEffects.checkJournal).
   */
  static isBalanced(lines: JournalLineInput[], baseCurrency: string): boolean {
    const forCheck: JournalLineForCheck[] = lines.map(line => ({
      amount: JournalCalculator.getLineBaseAmount(
        {
          amount: line.amount,
          exchangeRate: line.exchangeRate,
          accountCurrency: line.accountCurrency,
        },
        baseCurrency,
      ),
      type: line.type,
      exchangeRate: 1,
    }));
    return checkJournal(forCheck, AppConfig.constants.precision).isValid;
  }

  /**
   * Calculates the base amount for a journal line, considering exchange rates.
   * Follows Rule 11 (Business rules in services).
   */
  static getLineBaseAmount(
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

    if (!line.accountCurrency || line.accountCurrency === baseCurrency) {
      // Even for base currency, ensure we round to the currency precision
      // to avoid 10.100000000002 issues from manual entry or calculations
      return roundAmount(finalAmount);
    }

    const baseAmount = finalAmount * rate;
    return roundAmount(baseAmount);
  }

  /**
   * Standard rounding for financial amounts (2 decimal places).
   */
  static roundAmount(amount: number): number {
    return roundAmount(amount);
  }

  /**
   * Calculates the imbalance (Difference between Debits and Credits).
   * Positive means Debits > Credits (Needs more credits).
   * Negative means Credits > Debits (Needs more debits).
   */
  /**
   * Calculates the imbalance (Difference between Debits and Credits) in base currency.
   * Positive means Debits > Credits (Needs more credits).
   * Negative means Credits > Debits (Needs more debits).
   */
  static calculateImbalance(lines: JournalLineInput[], baseCurrency: string): number {
    return (
      JournalCalculator.calculateTotalDebits(lines, baseCurrency) -
      JournalCalculator.calculateTotalCredits(lines, baseCurrency)
    );
  }

  /**
   * Finds the missing functional value needed to balance the journal.
   */
  static calculateMissingValue(lines: JournalLineInput[], baseCurrency: string): number {
    const imbalance = JournalCalculator.calculateImbalance(lines, baseCurrency);
    return roundAmount(imbalance);
  }

  /**
   * Infers the exchange rate required to reach a specific target base value.
   */
  static calculateImpliedRate(nominalAmount: number, targetBaseAmount: number): number {
    if (nominalAmount === 0) return 1;
    // Rate = Base / Nominal
    // e.g. 1000 ETB / 6.47 USD = 154.559...
    return Math.abs(targetBaseAmount / nominalAmount);
  }

  /**
   * Groups journal lines by their account currency to detect shared non-base currencies.
   */
  static identifyCurrencyGroups(lines: any[], baseCurrency: string): Record<string, number[]> {
    const groups: Record<string, number[]> = {};
    lines.forEach((line, index) => {
      const currency = line.accountCurrency || baseCurrency;
      if (!groups[currency]) {
        groups[currency] = [];
      }
      groups[currency].push(index);
    });
    return groups;
  }

  /**
   * Applies exchange-rate corrections on a line (and same-currency peers) to absorb journal imbalance.
   */
  static applyImbalanceRateCorrectionToLines<T extends JournalLineWithRateCorrection>(
    lines: T[],
    lineId: string,
    baseCurrency: string,
  ): T[] | null {
    const line = lines.find(l => l.id === lineId);
    if (!line) return null;

    const imbalance = JournalCalculator.calculateImbalance(
      lines.map(l => ({
        amount: l.amount,
        type: l.transactionType,
        exchangeRate: l.exchangeRate,
        accountCurrency: l.accountCurrency,
      })),
      baseCurrency,
    );

    if (Math.abs(imbalance) < 0.001) return null;

    const currentBase = JournalCalculator.getLineBaseAmount(line, baseCurrency);
    const nominal = typeof line.amount === 'string' ? parseFloat(line.amount) : line.amount;

    if (!nominal || nominal === 0) return null;

    const targetBase =
      line.transactionType === TransactionType.DEBIT
        ? currentBase - imbalance
        : currentBase + imbalance;

    const newRate = JournalCalculator.calculateImpliedRate(nominal, targetBase);
    const roundedRate = Math.round(newRate * 1000000) / 1000000;

    const lineCurrency = line.accountCurrency || baseCurrency;
    return lines.map(l => {
      const lCurrency = l.accountCurrency || baseCurrency;
      if (lCurrency === lineCurrency && lCurrency !== baseCurrency) {
        return { ...l, exchangeRate: roundedRate.toString() };
      }
      return l.id === lineId ? { ...l, exchangeRate: roundedRate.toString() } : l;
    });
  }
}
