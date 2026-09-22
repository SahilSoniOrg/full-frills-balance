import { AccountId, EMPTY_ACCOUNT_ID, TransactionId } from '@/src/types/ids';

import { AppConfig } from '@/src/constants';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { amountsAreEqual, roundToPrecision } from '@/src/utils/money';

const SPLIT_AMOUNT_PRECISION = 2;

export const SPLIT_SOURCE_LINE_ID = 'split-source' as TransactionId;

export interface SplitCurrencyContext {
  baseCurrency: string;
  sourceCurrency?: string;
  sourceExchangeRate?: string | number;
  /** Accounting precision used for converted base-currency values. */
  basePrecision?: number;
}

export interface SplitRowState {
  id: string;
  accountId: AccountId;
  amount: string;
  accountCurrency?: string;
  exchangeRate?: string | number;
  /** Precision used when displaying/editing this row's nominal amount. */
  precision?: number;
}

export interface SplitTotals {
  total: number;
  allocated: number;
  remaining: number;
}

function formatSplitUnits(units: number, precision: number): string {
  return (units / 10 ** precision).toFixed(precision);
}

function distributeUnitsEvenly(totalUnits: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalUnits / count);
  const extraUnits = totalUnits % count;
  return Array.from({ length: count }, (_, index) => base + (index < extraUnits ? 1 : 0));
}

export function getSplitCurrencyPrecision(currency: string | undefined, fallback = 2): number {
  return currency ? CurrencyFormatter.getPrecisionFallback(currency) : fallback;
}

function getBasePrecision(currencyContext: SplitCurrencyContext): number {
  return currencyContext.basePrecision ?? AppConfig.constants.precision;
}

function getRowPrecision(row: SplitRowState, fallback: number): number {
  return row.precision ?? getSplitCurrencyPrecision(row.accountCurrency, fallback);
}

function getLineBaseAmount(
  amount: string,
  currency: string | undefined,
  exchangeRate: string | number | undefined,
  currencyContext: SplitCurrencyContext | undefined,
  precision: number,
): number {
  if (!currencyContext) return roundToPrecision(parseSimpleAmountInput(amount), precision);

  return roundToPrecision(
    JournalCalculator.getLineBaseAmount(
      {
        amount,
        accountCurrency: currency || currencyContext.baseCurrency,
        exchangeRate,
      },
      currencyContext.baseCurrency,
    ),
    precision,
  );
}

function getRateToBase(
  currency: string | undefined,
  exchangeRate: string | number | undefined,
  baseCurrency: string,
): number | null {
  const normalizedCurrency = currency?.trim().toUpperCase();
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  if (!normalizedCurrency || normalizedCurrency === normalizedBaseCurrency) return 1;

  const rate = Number(exchangeRate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function getSourceRateToBase(currencyContext: SplitCurrencyContext): number | null {
  return getRateToBase(
    currencyContext.sourceCurrency,
    currencyContext.sourceExchangeRate,
    currencyContext.baseCurrency,
  );
}

function formatBaseAmountForRow(
  baseAmount: number,
  row: SplitRowState,
  currencyContext: SplitCurrencyContext,
  fallbackPrecision: number,
): string {
  const rate = getRateToBase(row.accountCurrency, row.exchangeRate, currencyContext.baseCurrency);
  const precision = getRowPrecision(row, fallbackPrecision);
  return formatSplitUnits(Math.round((baseAmount / (rate || 1)) * 10 ** precision), precision);
}

function getSplitAmountUnits(amount: string, precision: number): number {
  return Math.max(0, Math.round(parseSimpleAmountInput(amount) * 10 ** precision));
}

function getRowBaseUnits(
  row: SplitRowState,
  amountUnits: number,
  currencyContext: SplitCurrencyContext,
  basePrecision: number,
  rowPrecision: number,
): number {
  const baseAmount = getLineBaseAmount(
    formatSplitUnits(amountUnits, rowPrecision),
    row.accountCurrency,
    row.exchangeRate,
    currencyContext,
    basePrecision,
  );
  return Math.round(baseAmount * 10 ** basePrecision);
}

interface SplitAmountOption {
  amountUnits: number;
  cost: number;
}

/**
 * Reconcile rounded row amounts after converting from base-currency targets.
 *
 * A base-currency allocation can land between two minor units in a row
 * currency. Converting each row independently can therefore change the base
 * total by a cent. Search the nearby row minor units and choose the least
 * disruptive combination whose rounded base values equal the source total.
 */
function reconcileCurrencyAmounts(
  splits: SplitRowState[],
  candidateAmounts: string[],
  minimumAmounts: string[],
  totalBaseUnits: number,
  currencyContext: SplitCurrencyContext,
  sourcePrecision: number,
): string[] {
  if (splits.length === 0) return candidateAmounts;

  const basePrecision = getBasePrecision(currencyContext);
  const baseFactor = 10 ** basePrecision;
  const rowPrecisions = splits.map(row => getRowPrecision(row, sourcePrecision));
  const anchorUnits = candidateAmounts.map((amount, index) =>
    getSplitAmountUnits(amount, rowPrecisions[index]),
  );
  const minimumUnits = minimumAmounts.map((amount, index) =>
    getSplitAmountUnits(amount, rowPrecisions[index]),
  );
  const currentBaseUnits = splits.map((row, index) =>
    getRowBaseUnits(row, anchorUnits[index], currencyContext, basePrecision, rowPrecisions[index]),
  );
  const currentTotalBaseUnits = currentBaseUnits.reduce((sum, amount) => sum + amount, 0);
  if (currentTotalBaseUnits === totalBaseUnits) return candidateAmounts;

  const rates = splits.map(
    row => getRateToBase(row.accountCurrency, row.exchangeRate, currencyContext.baseCurrency) || 1,
  );
  const baseUnitsPerRowUnit = rates.map(
    (rate, index) => (rate * baseFactor) / 10 ** rowPrecisions[index],
  );
  const largestBaseStep = Math.max(
    ...baseUnitsPerRowUnit.map(step => Math.max(1, Math.ceil(step))),
  );
  const baseSearchWindow = Math.max(
    Math.abs(totalBaseUnits - currentTotalBaseUnits),
    largestBaseStep * (splits.length + 1),
  );

  const optionsByRow = splits.map((row, index) => {
    const rowWindow = Math.max(4, Math.ceil(baseSearchWindow / baseUnitsPerRowUnit[index]) + 2);
    const lowerBound = Math.max(minimumUnits[index], anchorUnits[index] - rowWindow);
    const upperBound = anchorUnits[index] + rowWindow;
    const options = new Map<number, SplitAmountOption>();

    for (let amountUnits = lowerBound; amountUnits <= upperBound; amountUnits += 1) {
      const baseUnits = getRowBaseUnits(
        row,
        amountUnits,
        currencyContext,
        basePrecision,
        rowPrecisions[index],
      );
      const option = {
        amountUnits,
        cost: Math.abs(amountUnits - anchorUnits[index]),
      };
      const existing = options.get(baseUnits);
      if (!existing || option.cost < existing.cost) options.set(baseUnits, option);
    }

    return options;
  });

  let states = new Map<number, { cost: number; amountUnits: number[] }>([
    [0, { cost: 0, amountUnits: [] }],
  ]);
  for (const options of optionsByRow) {
    const nextStates = new Map<number, { cost: number; amountUnits: number[] }>();
    for (const [baseUnits, state] of states) {
      for (const [optionBaseUnits, option] of options) {
        const nextBaseUnits = baseUnits + optionBaseUnits;
        const nextState = {
          cost: state.cost + option.cost,
          amountUnits: [...state.amountUnits, option.amountUnits],
        };
        const existing = nextStates.get(nextBaseUnits);
        if (!existing || nextState.cost < existing.cost) {
          nextStates.set(nextBaseUnits, nextState);
        }
      }
    }
    states = nextStates;
  }

  const solution = states.get(totalBaseUnits);
  if (!solution) return candidateAmounts;

  return solution.amountUnits.map((amountUnits, index) =>
    formatSplitUnits(amountUnits, rowPrecisions[index]),
  );
}

/** Apply a positive remainder without introducing floating-point minor-unit errors. */
export function distributeSplitRemainder(
  totalAmount: string,
  splits: SplitRowState[],
  precision = SPLIT_AMOUNT_PRECISION,
  currencyContext?: SplitCurrencyContext,
): SplitRowState[] {
  if (currencyContext) {
    const basePrecision = getBasePrecision(currencyContext);
    const totalBase = getLineBaseAmount(
      totalAmount,
      currencyContext.sourceCurrency,
      currencyContext.sourceExchangeRate,
      currencyContext,
      basePrecision,
    );
    const amountsInBase = splits.map(split =>
      getLineBaseAmount(
        split.amount,
        split.accountCurrency,
        split.exchangeRate,
        currencyContext,
        basePrecision,
      ),
    );
    const allocatedBase = roundToPrecision(
      amountsInBase.reduce((sum, amount) => sum + amount, 0),
      basePrecision,
    );
    const remainderBase = roundToPrecision(totalBase - allocatedBase, basePrecision);

    if (remainderBase <= 0 || splits.length === 0) return splits;

    const emptyIndexes = splits
      .map((split, index) => (parseSimpleAmountInput(split.amount) === 0 ? index : -1))
      .filter(index => index >= 0);
    const factor = 10 ** basePrecision;

    if (emptyIndexes.length > 0) {
      const distributedBase = distributeUnitsEvenly(
        Math.round(remainderBase * factor),
        emptyIndexes.length,
      );
      const candidateAmounts = splits.map((split, index) => {
        const emptyIndex = emptyIndexes.indexOf(index);
        return emptyIndex < 0
          ? split.amount
          : formatBaseAmountForRow(
              distributedBase[emptyIndex] / factor,
              split,
              currencyContext,
              precision,
            );
      });
      const reconciledAmounts = reconcileCurrencyAmounts(
        splits,
        candidateAmounts,
        splits.map(split => split.amount),
        Math.round(totalBase * factor),
        currencyContext,
        precision,
      );
      return splits.map((split, index) => ({ ...split, amount: reconciledAmounts[index] }));
    }

    if (allocatedBase <= 0) return splits;

    const additions = amountsInBase.map(amount => (remainderBase * amount) / allocatedBase);
    const wholeAdditions = additions.map(amount => Math.floor(amount * factor));
    let unitsLeft =
      Math.round(remainderBase * factor) - wholeAdditions.reduce((sum, amount) => sum + amount, 0);
    const fractionalIndexes = additions
      .map((amount, index) => ({
        index,
        fraction: amount * factor - wholeAdditions[index],
      }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

    const roundedAdditions = [...wholeAdditions];
    for (const { index } of fractionalIndexes) {
      if (unitsLeft <= 0) break;
      roundedAdditions[index] += 1;
      unitsLeft -= 1;
    }

    const candidateAmounts = splits.map((split, index) => {
      const nextAmount = formatBaseAmountForRow(
        amountsInBase[index] + roundedAdditions[index] / factor,
        split,
        currencyContext,
        precision,
      );
      return nextAmount;
    });
    const reconciledAmounts = reconcileCurrencyAmounts(
      splits,
      candidateAmounts,
      splits.map(split => split.amount),
      Math.round(totalBase * factor),
      currencyContext,
      precision,
    );
    return splits.map((split, index) => ({ ...split, amount: reconciledAmounts[index] }));
  }

  const factor = 10 ** precision;
  const totalUnits = Math.round(parseSimpleAmountInput(totalAmount) * factor);
  const amountsInUnits = splits.map(split =>
    Math.round(parseSimpleAmountInput(split.amount) * factor),
  );
  const allocatedUnits = amountsInUnits.reduce((sum, amount) => sum + amount, 0);
  const remainderUnits = totalUnits - allocatedUnits;

  if (remainderUnits <= 0 || splits.length === 0) return splits;

  const emptyIndexes = amountsInUnits
    .map((amount, index) => (amount === 0 ? index : -1))
    .filter(index => index >= 0);

  if (emptyIndexes.length > 0) {
    const distributed = distributeUnitsEvenly(remainderUnits, emptyIndexes.length);
    return splits.map((split, index) => {
      const emptyIndex = emptyIndexes.indexOf(index);
      return emptyIndex < 0
        ? split
        : { ...split, amount: formatSplitUnits(distributed[emptyIndex], precision) };
    });
  }

  if (allocatedUnits <= 0) return splits;

  // Largest-remainder allocation preserves the exact total while staying as close
  // as possible to each row's existing proportion.
  const additions = amountsInUnits.map(amount => (remainderUnits * amount) / allocatedUnits);
  const wholeAdditions = additions.map(Math.floor);
  let unitsLeft = remainderUnits - wholeAdditions.reduce((sum, amount) => sum + amount, 0);
  const fractionalIndexes = additions
    .map((amount, index) => ({ index, fraction: amount - wholeAdditions[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const roundedAdditions = [...wholeAdditions];
  for (const { index } of fractionalIndexes) {
    if (unitsLeft <= 0) break;
    roundedAdditions[index] += 1;
    unitsLeft -= 1;
  }

  return splits.map((split, index) => ({
    ...split,
    amount: formatSplitUnits(amountsInUnits[index] + roundedAdditions[index], precision),
  }));
}

/** Replace every allocation with an exact equal share of the total. */
export function equalizeSplitAmounts(
  totalAmount: string,
  splits: SplitRowState[],
  precision = SPLIT_AMOUNT_PRECISION,
  currencyContext?: SplitCurrencyContext,
): SplitRowState[] {
  if (currencyContext) {
    const basePrecision = getBasePrecision(currencyContext);
    const totalBase = getLineBaseAmount(
      totalAmount,
      currencyContext.sourceCurrency,
      currencyContext.sourceExchangeRate,
      currencyContext,
      basePrecision,
    );
    const distributedBase = distributeUnitsEvenly(
      Math.round(totalBase * 10 ** basePrecision),
      splits.length,
    );
    const candidateAmounts = splits.map((split, index) =>
      formatBaseAmountForRow(
        distributedBase[index] / 10 ** basePrecision,
        split,
        currencyContext,
        precision,
      ),
    );
    const reconciledAmounts = reconcileCurrencyAmounts(
      splits,
      candidateAmounts,
      splits.map(() => '0'),
      Math.round(totalBase * 10 ** basePrecision),
      currencyContext,
      precision,
    );
    return splits.map((split, index) => ({ ...split, amount: reconciledAmounts[index] }));
  }

  const totalUnits = Math.round(parseSimpleAmountInput(totalAmount) * 10 ** precision);
  const distributed = distributeUnitsEvenly(totalUnits, splits.length);
  return splits.map((split, index) => ({
    ...split,
    amount: formatSplitUnits(distributed[index], precision),
  }));
}

export type SplitValidationError =
  | 'missing_source'
  | 'invalid_total'
  | 'missing_split_account'
  | 'invalid_split_amount'
  | 'sum_mismatch';

export function computeSplitTotals(
  totalAmount: string,
  splits: SplitRowState[],
  precision = SPLIT_AMOUNT_PRECISION,
  currencyContext?: SplitCurrencyContext,
): SplitTotals {
  const total = roundToPrecision(parseSimpleAmountInput(totalAmount), precision);
  if (!currencyContext) {
    const allocated = roundToPrecision(
      splits.reduce((sum, row) => sum + parseSimpleAmountInput(row.amount), 0),
      precision,
    );
    return {
      total,
      allocated,
      remaining: roundToPrecision(total - allocated, precision),
    };
  }

  const basePrecision = getBasePrecision(currencyContext);
  const totalBase = getLineBaseAmount(
    totalAmount,
    currencyContext.sourceCurrency,
    currencyContext.sourceExchangeRate,
    currencyContext,
    basePrecision,
  );
  const allocatedBase = roundToPrecision(
    splits.reduce(
      (sum, row) =>
        sum +
        getLineBaseAmount(
          row.amount,
          row.accountCurrency,
          row.exchangeRate,
          currencyContext,
          basePrecision,
        ),
      0,
    ),
    basePrecision,
  );
  const sourceRate = getSourceRateToBase(currencyContext);
  if (!sourceRate) {
    return {
      total,
      allocated: roundToPrecision(
        splits.reduce((sum, row) => sum + parseSimpleAmountInput(row.amount), 0),
        precision,
      ),
      remaining: roundToPrecision(
        total - splits.reduce((sum, row) => sum + parseSimpleAmountInput(row.amount), 0),
        precision,
      ),
    };
  }

  const allocated = roundToPrecision(allocatedBase / sourceRate, precision);
  return {
    total,
    allocated,
    remaining: roundToPrecision((totalBase - allocatedBase) / sourceRate, precision),
  };
}

export function validateSplitState(input: {
  sourceAccountId: AccountId;
  totalAmount: string;
  splits: SplitRowState[];
  precision?: number;
  currency?: SplitCurrencyContext;
}): { valid: true } | { valid: false; error: SplitValidationError } {
  const {
    sourceAccountId,
    totalAmount,
    splits,
    precision = SPLIT_AMOUNT_PRECISION,
    currency,
  } = input;

  if (!sourceAccountId || sourceAccountId === EMPTY_ACCOUNT_ID) {
    return { valid: false, error: 'missing_source' };
  }

  const total = roundToPrecision(parseSimpleAmountInput(totalAmount), precision);
  if (total <= 0) {
    return { valid: false, error: 'invalid_total' };
  }

  let allocated = 0;
  for (const split of splits) {
    if (!split.accountId || split.accountId === EMPTY_ACCOUNT_ID) {
      return { valid: false, error: 'missing_split_account' };
    }
    const amount = parseSimpleAmountInput(split.amount);
    if (amount <= 0) {
      return { valid: false, error: 'invalid_split_amount' };
    }
    allocated = roundToPrecision(allocated + amount, precision);
  }

  const basePrecision = currency ? getBasePrecision(currency) : precision;
  const totalForBalance = currency
    ? getLineBaseAmount(
        totalAmount,
        currency.sourceCurrency,
        currency.sourceExchangeRate,
        currency,
        basePrecision,
      )
    : total;
  const allocatedForBalance = currency
    ? roundToPrecision(
        splits.reduce(
          (sum, split) =>
            sum +
            getLineBaseAmount(
              split.amount,
              split.accountCurrency,
              split.exchangeRate,
              currency,
              basePrecision,
            ),
          0,
        ),
        basePrecision,
      )
    : allocated;

  if (!amountsAreEqual(allocatedForBalance, totalForBalance, basePrecision)) {
    return { valid: false, error: 'sum_mismatch' };
  }

  return { valid: true };
}
