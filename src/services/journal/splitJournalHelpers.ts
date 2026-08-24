import type { AccountFields } from '@/src/types/plainDtos';
import { TransactionType, AccountType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID, TransactionId } from '@/src/types/ids';
import { JournalEntryLine } from '@/src/types/domainJournal';

import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';

export const SPLIT_SOURCE_LINE_ID = 'split-source' as TransactionId;

export interface SplitRowState {
  id: string;
  accountId: AccountId;
  amount: string;
}

export interface SplitTotals {
  total: number;
  allocated: number;
  remaining: number;
}

export interface BuildSplitJournalLinesInput {
  sourceAccountId: AccountId;
  sourceAmount: string;
  splits: { id: string; accountId: AccountId; amount: string }[];
  accounts?: AccountFields[];
}

export type SplitValidationError =
  | 'missing_source'
  | 'invalid_total'
  | 'too_few_splits'
  | 'missing_split_account'
  | 'invalid_split_amount'
  | 'sum_mismatch';

export function createEmptySplitRow(id: string): SplitRowState {
  return {
    id,
    accountId: EMPTY_ACCOUNT_ID,
    amount: '',
  };
}

export function computeSplitTotals(totalAmount: string, splits: SplitRowState[]): SplitTotals {
  const total = parseSimpleAmountInput(totalAmount);
  const allocated = splits.reduce((sum, row) => sum + parseSimpleAmountInput(row.amount), 0);
  return {
    total,
    allocated,
    remaining: total - allocated,
  };
}

function resolveAccountFields(
  accountId: AccountId,
  accounts: AccountFields[] | undefined,
): Pick<JournalEntryLine, 'accountName' | 'accountType' | 'accountCurrency'> {
  const account = accounts?.find(a => a.id === accountId);
  return {
    accountName: account?.name ?? '',
    accountType: account?.accountType ?? AccountType.EXPENSE,
    accountCurrency: account?.currencyCode,
  };
}

/** One credit on the source account for the full amount; debits per category split. */
export function buildJournalLinesFromSplitState(
  input: BuildSplitJournalLinesInput,
): JournalEntryLine[] {
  const { sourceAccountId, sourceAmount, splits, accounts } = input;
  const sourceFields = resolveAccountFields(sourceAccountId, accounts);
  const sourceLine: JournalEntryLine = {
    id: SPLIT_SOURCE_LINE_ID,
    accountId: sourceAccountId,
    accountName: sourceFields.accountName,
    accountType: sourceFields.accountType || AccountType.ASSET,
    amount: sourceAmount,
    transactionType: TransactionType.CREDIT,
    notes: '',
    exchangeRate: '',
    accountCurrency: sourceFields.accountCurrency,
  };

  const debitLines: JournalEntryLine[] = splits.map(split => {
    const fields = resolveAccountFields(split.accountId, accounts);
    return {
      id: split.id as TransactionId,
      accountId: split.accountId,
      accountName: fields.accountName,
      accountType: AccountType.EXPENSE,
      amount: split.amount,
      transactionType: TransactionType.DEBIT,
      notes: '',
      exchangeRate: '',
      accountCurrency: fields.accountCurrency,
    };
  });

  return [sourceLine, ...debitLines];
}

export function validateSplitState(input: {
  sourceAccountId: AccountId;
  totalAmount: string;
  splits: SplitRowState[];
}): { valid: true } | { valid: false; error: SplitValidationError } {
  const { sourceAccountId, totalAmount, splits } = input;

  if (!sourceAccountId || sourceAccountId === EMPTY_ACCOUNT_ID) {
    return { valid: false, error: 'missing_source' };
  }

  const total = parseSimpleAmountInput(totalAmount);
  if (total <= 0) {
    return { valid: false, error: 'invalid_total' };
  }

  if (splits.length < 2) {
    return { valid: false, error: 'too_few_splits' };
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
    allocated += amount;
  }

  if (Math.abs(allocated - total) > 0.001) {
    return { valid: false, error: 'sum_mismatch' };
  }

  return { valid: true };
}
