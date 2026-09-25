import type { JournalEntryLine } from '@/src/types/domainJournal';
import type { AccountFields } from '@/src/types/plainDtos';
import { TransactionType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { useCurrencies } from '@/src/hooks/use-currencies';
import {
  computeSplitTotals,
  getSplitCurrencyPrecision,
  SplitCurrencyContext,
  SplitRowState,
  SplitTotals,
  validateSplitState,
} from '@/src/services/journal/splitJournalHelpers';
import { useMemo } from 'react';

export interface SplitDraftLines {
  sourceLine: JournalEntryLine | undefined;
  destinationLines: JournalEntryLine[];
}

export interface SplitDraftProjection extends SplitDraftLines {
  sourceAccountId: AccountId;
  totalAmount: string;
  sourceCurrency: string | undefined;
  sourceExchangeRate: string | undefined;
  splits: SplitRowState[];
  precision: number;
  currencyContext: SplitCurrencyContext;
  totals: SplitTotals;
  validation: ReturnType<typeof validateSplitState>;
}

export interface BuildSplitDraftProjectionOptions {
  lines: JournalEntryLine[];
  accounts: AccountFields[];
  workplaceCurrency: string;
  precision: number;
  precisionByCurrency?: ReadonlyMap<string, number>;
  sourceAccountId?: AccountId;
}

export interface UseSplitDraftProjectionOptions {
  lines: JournalEntryLine[];
  accounts: AccountFields[];
  workplaceCurrency: string;
  sourceAccountId?: AccountId;
  precisionCurrency?: string;
}

export function selectSplitDraftLines(lines: JournalEntryLine[]): SplitDraftLines {
  return {
    sourceLine: lines.find(line => line.transactionType === TransactionType.CREDIT),
    destinationLines: lines.filter(line => line.transactionType === TransactionType.DEBIT),
  };
}

function resolveSourceAccountId(
  sourceLine: JournalEntryLine | undefined,
  sourceAccountId: AccountId | undefined,
): AccountId {
  return sourceAccountId ?? sourceLine?.accountId ?? EMPTY_ACCOUNT_ID;
}

function resolveSourceCurrency(
  sourceLine: JournalEntryLine | undefined,
  sourceAccount: AccountFields | undefined,
): string | undefined {
  return sourceAccount?.currencyCode || sourceLine?.accountCurrency;
}

export function buildSplitDraftProjection({
  lines,
  accounts,
  workplaceCurrency,
  precision,
  precisionByCurrency,
  sourceAccountId,
}: BuildSplitDraftProjectionOptions): SplitDraftProjection {
  const { sourceLine, destinationLines } = selectSplitDraftLines(lines);
  const resolvedSourceAccountId = resolveSourceAccountId(sourceLine, sourceAccountId);
  const sourceAccount = accounts.find(account => account.id === resolvedSourceAccountId);
  const sourceCurrency = resolveSourceCurrency(sourceLine, sourceAccount);
  const splits = destinationLines.map(line => {
    const account = accounts.find(candidate => candidate.id === line.accountId);
    const accountCurrency = account?.currencyCode || line.accountCurrency;
    const usesSourceCurrency =
      Boolean(accountCurrency && sourceCurrency) &&
      accountCurrency!.trim().toUpperCase() === sourceCurrency!.trim().toUpperCase();

    return {
      id: line.id,
      accountId: line.accountId,
      amount: line.amount,
      accountCurrency,
      exchangeRate: usesSourceCurrency ? sourceLine?.exchangeRate : line.exchangeRate,
      precision: accountCurrency
        ? (precisionByCurrency?.get(accountCurrency.toUpperCase()) ??
          getSplitCurrencyPrecision(accountCurrency))
        : undefined,
    };
  });
  const currencyContext: SplitCurrencyContext = {
    baseCurrency: workplaceCurrency,
    basePrecision:
      precisionByCurrency?.get(workplaceCurrency.toUpperCase()) ??
      getSplitCurrencyPrecision(workplaceCurrency),
    sourceCurrency,
    sourceExchangeRate: sourceLine?.exchangeRate,
  };
  const totalAmount = sourceLine?.amount ?? '';
  const totals = computeSplitTotals(totalAmount, splits, precision, currencyContext);
  const validation = validateSplitState({
    sourceAccountId: resolvedSourceAccountId,
    totalAmount,
    splits,
    precision,
    currency: currencyContext,
  });

  return {
    sourceLine,
    destinationLines,
    sourceAccountId: resolvedSourceAccountId,
    totalAmount,
    sourceCurrency,
    sourceExchangeRate: sourceLine?.exchangeRate,
    splits,
    precision,
    currencyContext,
    totals,
    validation,
  };
}

export function useSplitDraftProjection({
  lines,
  accounts,
  workplaceCurrency,
  sourceAccountId,
  precisionCurrency,
}: UseSplitDraftProjectionOptions): SplitDraftProjection {
  const selectedLines = useMemo(() => selectSplitDraftLines(lines), [lines]);
  const resolvedSourceAccountId = resolveSourceAccountId(selectedLines.sourceLine, sourceAccountId);
  const sourceAccount = useMemo(
    () => accounts.find(account => account.id === resolvedSourceAccountId),
    [accounts, resolvedSourceAccountId],
  );
  const sourceCurrency = resolveSourceCurrency(selectedLines.sourceLine, sourceAccount);
  const { currencies } = useCurrencies();
  const precisionByCurrency = useMemo(
    () => new Map(currencies.map(currency => [currency.code.toUpperCase(), currency.precision])),
    [currencies],
  );
  const selectedCurrency = precisionCurrency || sourceCurrency || workplaceCurrency;
  const precision =
    precisionByCurrency.get(selectedCurrency.toUpperCase()) ??
    getSplitCurrencyPrecision(selectedCurrency);

  return useMemo(
    () =>
      buildSplitDraftProjection({
        lines,
        accounts,
        workplaceCurrency,
        precision,
        precisionByCurrency,
        sourceAccountId,
      }),
    [accounts, lines, precision, precisionByCurrency, sourceAccountId, workplaceCurrency],
  );
}
