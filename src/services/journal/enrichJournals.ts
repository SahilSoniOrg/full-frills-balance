import Journal from '@/src/data/models/Journal';
import type { JournalEnrichmentRow } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { AccountType, TransactionType } from '@/src/types/enums';
import { EnrichedJournal } from '@/src/types/domainReadModels';

function sortEnrichmentRows(rows: JournalEnrichmentRow[]): JournalEnrichmentRow[] {
  return [...rows].sort((a, b) => {
    if (a.journal_id !== b.journal_id) return a.journal_id < b.journal_id ? -1 : 1;
    return a.account_id < b.account_id ? -1 : a.account_id > b.account_id ? 1 : 0;
  });
}

/** Map enrichment SQL rows by journal id for a single enrichment pass. */
export function groupEnrichmentRowsByJournalId(
  rows: JournalEnrichmentRow[],
): Map<string, JournalEnrichmentRow[]> {
  const sorted = sortEnrichmentRows(rows);
  const byJournal = new Map<string, JournalEnrichmentRow[]>();
  for (const row of sorted) {
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
      accountId: r.account_id,
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

/** Canonical fingerprint for reactive list equality (stable account leg order). */
export function journalEnrichmentFingerprint(journal: EnrichedJournal): string {
  return JSON.stringify({
    id: journal.id,
    status: journal.status,
    description: journal.description ?? '',
    notes: journal.notes ?? '',
    totalAmount: journal.totalAmount,
    transactionCount: journal.transactionCount,
    journalDate: journal.journalDate,
    currencyCode: journal.currencyCode,
    displayType: journal.displayType,
    semanticType: journal.semanticType ?? '',
    semanticLabel: journal.semanticLabel ?? '',
    plannedPaymentId: journal.plannedPaymentId ?? '',
    accounts: journal.accounts.map(a => ({
      id: a.id,
      role: a.role,
      amount: a.amount,
      name: a.name,
      accountType: a.accountType,
      icon: a.icon ?? '',
    })),
  });
}

/** Equality for reactive journal list emissions. */
export function enrichedJournalsAreEqual(
  prev: EnrichedJournal[],
  curr: EnrichedJournal[],
): boolean {
  if (prev.length !== curr.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (journalEnrichmentFingerprint(prev[i]) !== journalEnrichmentFingerprint(curr[i])) {
      return false;
    }
  }
  return true;
}
