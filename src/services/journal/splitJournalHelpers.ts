import { AccountId, EMPTY_ACCOUNT_ID, TransactionId } from '@/src/types/ids';

import { parsePositiveRate } from '@/src/services/journal/journalEditorHelpers';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import {
  formatRoundedAmount,
  fromMinorUnits,
  minorUnitFactor,
  roundToPrecision,
  toMinorUnits,
} from '@/src/utils/money';

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
  return formatRoundedAmount(fromMinorUnits(units, precision), precision);
}

function distributeUnitsEvenly(totalUnits: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalUnits / count);
  const extraUnits = totalUnits % count;
  return Array.from({ length: count }, (_, index) => base + (index < extraUnits ? 1 : 0));
}

export function rowAmountFromBase(baseAmount: number, pairRate: number, precision: number): number {
  return roundToPrecision(baseAmount * pairRate, precision);
}

export function amountInSourceCurrency(
  nominalAmount: number,
  pairRate: number,
  precision: number,
): string {
  return formatRoundedAmount(nominalAmount / pairRate, precision);
}

export function getSplitCurrencyPrecision(currency: string | undefined, fallback = 2): number {
  return currency ? CurrencyFormatter.getPrecisionFallback(currency) : fallback;
}

function getBasePrecision(currencyContext: SplitCurrencyContext): number {
  return currencyContext.basePrecision ?? getSplitCurrencyPrecision(currencyContext.baseCurrency);
}

function getRowPrecision(row: SplitRowState, fallback: number): number {
  return row.precision ?? getSplitCurrencyPrecision(row.accountCurrency, fallback);
}

function getLineBaseAmount(
  amount: string,
  currency: string | undefined,
  exchangeRate: string | number | undefined,
  currencyContext: SplitCurrencyContext,
  precision: number,
): number {
  const rate = getRateToBase(currency, exchangeRate, currencyContext.baseCurrency);
  return rate === null ? 0 : roundToPrecision(parseSimpleAmountInput(amount) * rate, precision);
}

function getSourceBaseUnits(
  totalAmount: string,
  currencyContext: SplitCurrencyContext,
  basePrecision: number,
): number {
  const baseAmount = getLineBaseAmount(
    totalAmount,
    currencyContext.sourceCurrency,
    currencyContext.sourceExchangeRate,
    currencyContext,
    basePrecision,
  );
  return toMinorUnits(baseAmount, basePrecision);
}

function getSplitBaseUnits(
  split: SplitRowState,
  currencyContext: SplitCurrencyContext,
  basePrecision: number,
): number {
  const baseAmount = getLineBaseAmount(
    split.amount,
    split.accountCurrency,
    split.exchangeRate,
    currencyContext,
    basePrecision,
  );
  return toMinorUnits(baseAmount, basePrecision);
}

function sumUnits(units: number[]): number {
  return units.reduce((sum, amount) => sum + amount, 0);
}

function getRateToBase(
  currency: string | undefined,
  exchangeRate: string | number | undefined,
  baseCurrency: string,
): number | null {
  const normalizedCurrency = currency?.trim().toUpperCase();
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  if (!normalizedCurrency || normalizedCurrency === normalizedBaseCurrency) return 1;
  return parsePositiveRate(exchangeRate);
}

function getSourceRateToBase(currencyContext: SplitCurrencyContext): number | null {
  return getRateToBase(
    currencyContext.sourceCurrency,
    currencyContext.sourceExchangeRate,
    currencyContext.baseCurrency,
  );
}

function hasMissingRate(splits: readonly SplitRowState[], context: SplitCurrencyContext): boolean {
  return (
    getSourceRateToBase(context) === null ||
    splits.some(
      split =>
        getRateToBase(split.accountCurrency, split.exchangeRate, context.baseCurrency) === null,
    )
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
  return formatSplitUnits(toMinorUnits(baseAmount / (rate || 1), precision), precision);
}

function getSplitAmountUnits(amount: string, precision: number): number {
  return Math.max(0, toMinorUnits(parseSimpleAmountInput(amount), precision));
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
  return toMinorUnits(baseAmount, basePrecision);
}

interface SplitAmountOption {
  amountUnits: number;
  cost: number;
}

const RECONCILE_RADIUS = 32;
const MAX_RECONCILE_TRANSITIONS = 100_000;

/**
 * Reconcile rounded row amounts after converting from base-currency targets.
 *
 * A base-currency allocation can land between two minor units in a row
 * currency. Search a bounded neighborhood around the rounded proposal and
 * around the amount that would cover the remaining base-unit difference.
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
  const baseFactor = minorUnitFactor(basePrecision);
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
  const currentTotalBaseUnits = sumUnits(currentBaseUnits);
  if (currentTotalBaseUnits === totalBaseUnits) return candidateAmounts;

  const rates = splits.map(
    row => getRateToBase(row.accountCurrency, row.exchangeRate, currencyContext.baseCurrency) || 1,
  );
  const baseUnitsPerRowUnit = rates.map(
    (rate, index) => (rate * baseFactor) / minorUnitFactor(rowPrecisions[index]),
  );
  const optionsByRow = splits.map((row, index) => {
    const options = new Map<number, SplitAmountOption>();
    const correction = Math.round(
      (totalBaseUnits - currentTotalBaseUnits) / baseUnitsPerRowUnit[index],
    );
    const centers = [anchorUnits[index], anchorUnits[index] + correction];

    for (const center of centers) {
      if (!Number.isSafeInteger(center)) continue;
      for (let offset = -RECONCILE_RADIUS; offset <= RECONCILE_RADIUS; offset += 1) {
        const amountUnits = center + offset;
        if (amountUnits < minimumUnits[index] || !Number.isSafeInteger(amountUnits)) continue;
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
    }

    return options;
  });

  let states = new Map<number, { cost: number; amountUnits: number[] }>([
    [0, { cost: 0, amountUnits: [] }],
  ]);
  let transitions = 0;
  for (const options of optionsByRow) {
    const nextStates = new Map<number, { cost: number; amountUnits: number[] }>();
    for (const [baseUnits, state] of states) {
      for (const [optionBaseUnits, option] of options) {
        if (++transitions > MAX_RECONCILE_TRANSITIONS) return candidateAmounts;
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

function withAmounts(splits: SplitRowState[], amounts: string[]): SplitRowState[] {
  return splits.map((split, index) => ({ ...split, amount: amounts[index] }));
}

/**
 * Largest-remainder allocation: preserves the exact total while staying as close
 * as possible to each weight's existing proportion.
 */
function allocateUnitsProportionally(totalUnits: number, weights: number[]): number[] {
  const weightTotal = sumUnits(weights);
  const shares = weights.map(weight => (totalUnits * weight) / weightTotal);
  const allocated = shares.map(Math.floor);
  let unitsLeft = totalUnits - sumUnits(allocated);
  const byFraction = shares
    .map((share, index) => ({ index, fraction: share - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byFraction) {
    if (unitsLeft <= 0) break;
    allocated[index] += 1;
    unitsLeft -= 1;
  }
  return allocated;
}

/** Apply a positive remainder without introducing floating-point minor-unit errors. */
export function distributeSplitRemainder(
  totalAmount: string,
  splits: SplitRowState[],
  precision: number,
  currencyContext: SplitCurrencyContext,
): SplitRowState[] {
  if (hasMissingRate(splits, currencyContext)) return splits;
  const basePrecision = getBasePrecision(currencyContext);
  const totalBaseUnits = getSourceBaseUnits(totalAmount, currencyContext, basePrecision);
  const baseUnits = splits.map(split => getSplitBaseUnits(split, currencyContext, basePrecision));
  const allocatedBaseUnits = sumUnits(baseUnits);
  const remainderUnits = totalBaseUnits - allocatedBaseUnits;

  if (remainderUnits <= 0 || splits.length === 0) return splits;

  const toRowAmount = (split: SplitRowState, units: number) =>
    formatBaseAmountForRow(fromMinorUnits(units, basePrecision), split, currencyContext, precision);
  const emptyIndexes = splits
    .map((split, index) => (parseSimpleAmountInput(split.amount) === 0 ? index : -1))
    .filter(index => index >= 0);

  let candidateAmounts: string[];
  if (emptyIndexes.length > 0) {
    const distributed = distributeUnitsEvenly(remainderUnits, emptyIndexes.length);
    candidateAmounts = splits.map((split, index) => {
      const emptyIndex = emptyIndexes.indexOf(index);
      return emptyIndex < 0 ? split.amount : toRowAmount(split, distributed[emptyIndex]);
    });
  } else {
    if (allocatedBaseUnits <= 0) return splits;
    const additions = allocateUnitsProportionally(remainderUnits, baseUnits);
    candidateAmounts = splits.map((split, index) =>
      toRowAmount(split, baseUnits[index] + additions[index]),
    );
  }

  return withAmounts(
    splits,
    reconcileCurrencyAmounts(
      splits,
      candidateAmounts,
      splits.map(split => split.amount),
      totalBaseUnits,
      currencyContext,
      precision,
    ),
  );
}

/** Equal shares of the total in the paid-from currency. FX conversion happens after. */
export function equalizeSourceAmounts(
  totalAmount: string,
  count: number,
  precision: number,
): string[] {
  const totalUnits = toMinorUnits(parseSimpleAmountInput(totalAmount), precision);
  return distributeUnitsEvenly(totalUnits, count).map(units => formatSplitUnits(units, precision));
}

/** Replace every allocation with an exact equal share of the total. */
export function equalizeSplitAmounts(
  totalAmount: string,
  splits: SplitRowState[],
  precision: number,
  currencyContext: SplitCurrencyContext,
): SplitRowState[] {
  if (hasMissingRate(splits, currencyContext)) return splits;
  const basePrecision = getBasePrecision(currencyContext);
  const totalBaseUnits = getSourceBaseUnits(totalAmount, currencyContext, basePrecision);
  const distributedBase = distributeUnitsEvenly(totalBaseUnits, splits.length);
  const candidateAmounts = splits.map((split, index) =>
    formatBaseAmountForRow(
      fromMinorUnits(distributedBase[index], basePrecision),
      split,
      currencyContext,
      precision,
    ),
  );
  return withAmounts(
    splits,
    reconcileCurrencyAmounts(
      splits,
      candidateAmounts,
      splits.map(() => '0'),
      totalBaseUnits,
      currencyContext,
      precision,
    ),
  );
}

export type SplitValidationError =
  | 'missing_source'
  | 'invalid_total'
  | 'missing_split_account'
  | 'invalid_split_amount'
  | 'missing_exchange_rate'
  | 'sum_mismatch';

export function computeSplitTotals(
  totalAmount: string,
  splits: SplitRowState[],
  precision: number,
  currencyContext: SplitCurrencyContext,
): SplitTotals {
  const total = roundToPrecision(parseSimpleAmountInput(totalAmount), precision);
  const sourceRate = getSourceRateToBase(currencyContext);
  if (!sourceRate || hasMissingRate(splits, currencyContext)) {
    const allocated = roundToPrecision(
      splits.reduce((sum, row) => sum + parseSimpleAmountInput(row.amount), 0),
      precision,
    );
    return { total, allocated, remaining: roundToPrecision(total - allocated, precision) };
  }

  const basePrecision = getBasePrecision(currencyContext);
  const totalBaseUnits = getSourceBaseUnits(totalAmount, currencyContext, basePrecision);
  const allocatedBaseUnits = sumUnits(
    splits.map(split => getSplitBaseUnits(split, currencyContext, basePrecision)),
  );
  const toSourceAmount = (baseUnits: number) =>
    roundToPrecision(fromMinorUnits(baseUnits, basePrecision) / sourceRate, precision);
  return {
    total,
    allocated: toSourceAmount(allocatedBaseUnits),
    remaining: toSourceAmount(totalBaseUnits - allocatedBaseUnits),
  };
}

export function validateSplitState(input: {
  sourceAccountId: AccountId;
  totalAmount: string;
  splits: SplitRowState[];
  precision?: number;
  currency: SplitCurrencyContext;
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

  for (const split of splits) {
    if (!split.accountId || split.accountId === EMPTY_ACCOUNT_ID) {
      return { valid: false, error: 'missing_split_account' };
    }
    if (parseSimpleAmountInput(split.amount) <= 0) {
      return { valid: false, error: 'invalid_split_amount' };
    }
  }

  if (hasMissingRate(splits, currency)) {
    return { valid: false, error: 'missing_exchange_rate' };
  }

  const basePrecision = getBasePrecision(currency);
  const allocatedBaseUnits = sumUnits(
    splits.map(split => getSplitBaseUnits(split, currency, basePrecision)),
  );
  if (allocatedBaseUnits !== getSourceBaseUnits(totalAmount, currency, basePrecision)) {
    return { valid: false, error: 'sum_mismatch' };
  }

  return { valid: true };
}
