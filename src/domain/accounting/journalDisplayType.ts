import { AccountType, JournalDisplayType, TransactionType } from '@/src/types/enums';

export interface DisplayTypeLine {
  accountId: string;
  amount?: number;
  transactionType?: TransactionType;
}

/**
 * Identifies the primary Source and Destination account types for a journal.
 * Handles both 2-leg and complex multi-leg/split transactions by finding the dominant flow.
 */
export function getSourceAndDestTypes(
  lines: readonly DisplayTypeLine[],
  accountTypes: ReadonlyMap<string, AccountType>,
): { source: AccountType; destination: AccountType } {
  const creditWeights = new Map<AccountType, number>();
  const debitWeights = new Map<AccountType, number>();

  lines.forEach(line => {
    const type = accountTypes.get(line.accountId);
    if (!type) return;

    const weight = Math.abs(line.amount || 0);
    if (line.transactionType === TransactionType.CREDIT) {
      creditWeights.set(type, (creditWeights.get(type) || 0) + weight);
    } else {
      debitWeights.set(type, (debitWeights.get(type) || 0) + weight);
    }
  });

  let source = AccountType.ASSET;
  let maxSourceWeight = -1;
  creditWeights.forEach((weight, type) => {
    if (weight > maxSourceWeight) {
      maxSourceWeight = weight;
      source = type;
    }
  });

  let destination = AccountType.ASSET;
  let maxDestWeight = -1;
  debitWeights.forEach((weight, type) => {
    if (weight > maxDestWeight) {
      maxDestWeight = weight;
      destination = type;
    }
  });

  return { source, destination };
}

/**
 * Determines the high-level type of a journal based on its lines.
 * Uses explicit income/expense presence first, then falls back to structural analysis.
 */
export function deriveJournalDisplayType(
  lines: readonly DisplayTypeLine[],
  accountTypes: ReadonlyMap<string, AccountType>,
): JournalDisplayType {
  let hasIncome = false;
  let hasExpense = false;

  lines.forEach(line => {
    const type = accountTypes.get(line.accountId);
    if (type === AccountType.INCOME) hasIncome = true;
    else if (type === AccountType.EXPENSE) hasExpense = true;
  });

  if (hasIncome && hasExpense) return JournalDisplayType.MIXED;
  if (hasIncome) return JournalDisplayType.INCOME;
  if (hasExpense) return JournalDisplayType.EXPENSE;

  const { source, destination } = getSourceAndDestTypes(lines, accountTypes);
  if (source === AccountType.INCOME || source === AccountType.EQUITY)
    return JournalDisplayType.INCOME;
  if (destination === AccountType.EXPENSE || destination === AccountType.EQUITY)
    return JournalDisplayType.EXPENSE;

  return JournalDisplayType.TRANSFER;
}
