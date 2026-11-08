import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import Transaction from '@/src/data/models/Transaction';
import { JournalStatus, TransactionDirection, TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { fetchSequentiallyInChunks } from '@/src/data/repositories/fetchSequentiallyInChunks';
import { readCaptureMetadata } from '@/src/domain/transaction-intelligence/captureMetadata';

/** Any compatible reference is a review candidate even if the account is unresolved. */
export async function findCaptureReferenceCandidates(input: {
  workplaceId: WorkplaceId;
  reference: string;
  amount: number;
  currencyCode: string;
}): Promise<Journal[]> {
  const [observations, metadata] = await Promise.all([
    database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .query(
        Q.where('workplace_id', input.workplaceId),
        Q.where('reference_number', input.reference),
        Q.where('linked_journal_id', Q.notEq(null)),
      )
      .fetch(),
    database.collections
      .get<JournalMetadata>('journal_metadata')
      .query(
        Q.where('workplace_id', input.workplaceId),
        Q.where('reference_number', input.reference),
      )
      .fetch(),
  ]);
  const ids = [
    ...new Set([
      ...observations.flatMap(row => (row.linkedJournalId ? [row.linkedJournalId] : [])),
      ...metadata.map(row => row.journalId),
    ]),
  ];
  return fetchSequentiallyInChunks(ids, chunk =>
    database.collections
      .get<Journal>('journals')
      .query(
        Q.where('workplace_id', input.workplaceId),
        Q.where('id', Q.oneOf([...chunk])),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', JournalStatus.POSTED),
        Q.where('currency_code', input.currencyCode),
        Q.where('total_amount', input.amount),
      )
      .fetch(),
  );
}

/** Exact references are only linked when amount, currency, account and direction agree uniquely. */
export async function findCaptureReferenceMatches(input: {
  workplaceId: WorkplaceId;
  reference: string;
  amount: number;
  currencyCode: string;
  accountId: AccountId;
  direction: TransactionDirection;
  receivedAt: number;
  /** An incoming SMS may reconcile against email or the opposite side of a transfer. */
  requireOtherObservation?: boolean;
}): Promise<Journal[]> {
  if (input.direction === TransactionDirection.UNKNOWN) return [];
  const [observations, metadata] = await Promise.all([
    database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .query(
        Q.where('workplace_id', input.workplaceId),
        Q.where('reference_number', input.reference),
        Q.where('linked_journal_id', Q.notEq(null)),
      )
      .fetch(),
    database.collections
      .get<JournalMetadata>('journal_metadata')
      .query(
        Q.where('workplace_id', input.workplaceId),
        Q.where('reference_number', input.reference),
      )
      .fetch(),
  ]);
  const opposite =
    input.direction === TransactionDirection.DEBIT
      ? TransactionDirection.CREDIT
      : TransactionDirection.DEBIT;
  if (
    input.requireOtherObservation &&
    !observations.some(
      row => row.channel === 'email' || (row.channel === 'sms' && row.direction === opposite),
    )
  )
    return [];
  const ids = [
    ...new Set([
      ...observations.flatMap(row => (row.linkedJournalId ? [row.linkedJournalId] : [])),
      ...metadata.map(row => row.journalId),
    ]),
  ];
  if (!ids.length) return [];
  const journals = await fetchSequentiallyInChunks(ids, chunk =>
    database.collections
      .get<Journal>('journals')
      .query(
        Q.where('workplace_id', input.workplaceId),
        Q.where('id', Q.oneOf([...chunk])),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', JournalStatus.POSTED),
        Q.where('currency_code', input.currencyCode),
        Q.where('total_amount', input.amount),
      )
      .fetch(),
  );
  if (!journals.length) return [];
  const legs = await fetchSequentiallyInChunks(
    journals.map(journal => journal.id),
    chunk =>
      database.collections
        .get<Transaction>('transactions')
        .query(
          Q.where('workplace_id', input.workplaceId),
          Q.where('journal_id', Q.oneOf([...chunk])),
          Q.where('account_id', input.accountId),
          Q.where('deleted_at', Q.eq(null)),
          Q.where(
            'transaction_type',
            input.direction === 'debit' ? TransactionType.CREDIT : TransactionType.DEBIT,
          ),
        )
        .fetch(),
  );
  const matching = new Set<JournalId>(
    legs
      .filter(leg => leg.amount === input.amount && leg.currencyCode === input.currencyCode)
      .map(leg => leg.journalId),
  );
  const matches = journals.filter(
    journal =>
      matching.has(journal.id) && Math.abs(journal.journalDate - input.receivedAt) <= 86_400_000,
  );
  if (input.requireOtherObservation && matches.length === 1) {
    const id = matches[0].id;
    const email = observations.some(row => row.channel === 'email' && row.linkedJournalId === id);
    const transfer = metadata.some(
      row =>
        row.journalId === id && readCaptureMetadata(row.metadataJson)?.economicKind === 'transfer',
    );
    const oppositeSms =
      transfer &&
      observations.some(
        row => row.channel === 'sms' && row.direction === opposite && row.linkedJournalId === id,
      );
    if (!email && !oppositeSms) return [];
  }
  return matches;
}
