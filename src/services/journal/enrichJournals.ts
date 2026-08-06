import Journal from '@/src/data/models/Journal';
import { AccountId, AccountType, EnrichedJournal, TransactionType } from '@/src/types/domain';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';

/** Raw enrichment row from `journalEnrichmentQueries.getEnrichmentDataRaw`. */
export type JournalEnrichmentRow = {
  journal_id: string;
  account_id: string;
  amount: number;
  transaction_type: TransactionType;
  account_name: string;
  account_type: AccountType;
  account_icon?: string;
};

/** Map enrichment SQL rows by journal id for a single enrichment pass. */
export function groupEnrichmentRowsByJournalId(
  rows: JournalEnrichmentRow[],
): Map<string, JournalEnrichmentRow[]> {
  const byJournal = new Map<string, JournalEnrichmentRow[]>();
  for (const row of rows) {
    const list = byJournal.get(row.journal_id) || [];
    list.push(row);
    byJournal.set(row.journal_id, list);
  }
  return byJournal;
}

/**
 * Enrich journal records with account legs and presenter-derived display fields.
 * Single locality for journal list row semantics.
 */
export function enrichJournals(
  journals: Journal[],
  enrichmentRows: JournalEnrichmentRow[],
): EnrichedJournal[] {
  const dataByJournal = groupEnrichmentRowsByJournalId(enrichmentRows);

  return journals.map(j => {
    const rows = dataByJournal.get(j.id) || [];

    const accountTypesMap = new Map<string, AccountType>();
    rows.forEach(r => accountTypesMap.set(r.account_id, r.account_type));

    const enrichedAccounts = rows.map(r => ({
      id: r.account_id,
      name: r.account_name,
      accountType: r.account_type,
      role: (r.transaction_type === TransactionType.CREDIT ? 'SOURCE' : 'DESTINATION') as
        'SOURCE' | 'DESTINATION',
      icon: r.account_icon,
      amount: r.amount,
    }));

    const txsForPresenter = rows.map(r => ({
      accountId: r.account_id as AccountId,
      amount: r.amount,
      transactionType: r.transaction_type,
    }));

    const { source, destination } = journalPresenter.getSourceAndDestTypes(
      txsForPresenter,
      accountTypesMap,
    );
    const semanticType = journalPresenter.getSemanticType(source, destination);
    const displayType = journalPresenter.getJournalDisplayType(txsForPresenter, accountTypesMap);
    const semanticLabel = journalPresenter.getJournalSemanticLabel(
      txsForPresenter,
      accountTypesMap,
    );

    return {
      id: j.id,
      journalDate: j.journalDate,
      description: j.description,
      notes: j.notes,
      currencyCode: j.currencyCode,
      status: j.status,
      totalAmount: j.totalAmount || 0,
      transactionCount: j.transactionCount || 0,
      displayType,
      semanticType,
      semanticLabel,
      accounts: enrichedAccounts,
      plannedPaymentId: j.plannedPaymentId,
    } as EnrichedJournal;
  });
}

/** Equality for reactive journal list emissions (includes per-leg amounts). */
export function enrichedJournalsAreEqual(
  prev: EnrichedJournal[],
  curr: EnrichedJournal[],
): boolean {
  if (prev.length !== curr.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const c = curr[i];
    if (
      p.id !== c.id ||
      p.status !== c.status ||
      p.description !== c.description ||
      p.notes !== c.notes ||
      p.totalAmount !== c.totalAmount ||
      p.transactionCount !== c.transactionCount ||
      p.journalDate !== c.journalDate ||
      p.currencyCode !== c.currencyCode ||
      p.displayType !== c.displayType ||
      p.semanticType !== c.semanticType ||
      p.semanticLabel !== c.semanticLabel ||
      p.plannedPaymentId !== c.plannedPaymentId ||
      p.accounts.length !== c.accounts.length
    ) {
      return false;
    }

    for (let j = 0; j < p.accounts.length; j++) {
      const pa = p.accounts[j];
      const ca = c.accounts[j];
      if (
        pa.id !== ca.id ||
        pa.name !== ca.name ||
        pa.accountType !== ca.accountType ||
        pa.role !== ca.role ||
        pa.icon !== ca.icon ||
        pa.amount !== ca.amount
      ) {
        return false;
      }
    }
  }
  return true;
}
