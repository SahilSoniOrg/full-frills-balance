import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';

const REVERT_CONFLICT_MESSAGE =
  'This journal changed after the selected history entry. Refresh and review the latest change.';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableJson(item)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Rejects an undo if any event field no longer matches, using rows loaded from
 * inside the serialized write session that will apply the compensating change.
 */
export function assertExpectedJournalSnapshot(
  expected: Record<string, unknown> | undefined,
  journal: Journal,
  transactions: readonly Transaction[],
): void {
  if (!expected) return;

  const current: Record<string, unknown> = {
    description: journal.description ?? null,
    notes: journal.notes ?? null,
    journalDate: journal.journalDate,
    currencyCode: journal.currencyCode,
    status: journal.status,
    totalAmount: journal.totalAmount,
    deletedAt: journal.deletedAt?.toISOString() ?? null,
    updatedAt: journal.updatedAt?.toISOString() ?? null,
    transactions: transactions.map(transaction => ({
      accountId: transaction.accountId,
      amount: transaction.amount,
      transactionType: transaction.transactionType,
      notes: transaction.notes ?? null,
      exchangeRate: transaction.exchangeRate ?? null,
      currencyCode: transaction.currencyCode ?? null,
    })),
  };

  for (const [field, expectedValue] of Object.entries(expected)) {
    if (!(field in current)) throw new Error(REVERT_CONFLICT_MESSAGE);
    const actualValue = current[field];
    const matches =
      field === 'transactions' && Array.isArray(actualValue) && Array.isArray(expectedValue)
        ? stableJson(
            [...actualValue].sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
          ) ===
          stableJson([...expectedValue].sort((a, b) => stableJson(a).localeCompare(stableJson(b))))
        : stableJson(actualValue) === stableJson(expectedValue);
    if (!matches) throw new Error(REVERT_CONFLICT_MESSAGE);
  }
}
