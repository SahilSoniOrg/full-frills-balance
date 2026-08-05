import { TransactionType } from '@/src/data/models/Transaction';
import { BudgetCumulativeTx } from '@/src/services/projections/buildBudgetCumulativeSeries';
import { AccountId, EnrichedJournal } from '@/src/types/domain';

/** Expands scoped journal legs into chart rows (debit/credit per budget account leg). */
export function journalsToBudgetChartTxs(
  journals: EnrichedJournal[],
  scopedAccountIds: AccountId[],
): BudgetCumulativeTx[] {
  if (scopedAccountIds.length === 0) return [];

  const scoped = new Set(scopedAccountIds);
  const txs: BudgetCumulativeTx[] = [];

  for (const journal of journals) {
    for (const account of journal.accounts) {
      if (!scoped.has(account.id)) continue;
      txs.push({
        transactionDate: journal.journalDate,
        amount: account.amount ?? journal.totalAmount,
        currencyCode: journal.currencyCode,
        transactionType: account.role === 'SOURCE' ? TransactionType.CREDIT : TransactionType.DEBIT,
      });
    }
  }

  return txs;
}
