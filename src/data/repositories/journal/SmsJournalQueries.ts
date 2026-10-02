import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q } from '@nozbe/watermelondb';

export class SmsJournalQueries {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  private get journalMetadata() {
    return database.collections.get<JournalMetadata>('journal_metadata');
  }

  private async findByIds(workplaceId: WorkplaceId, ids: JournalId[]): Promise<Journal[]> {
    if (ids.length === 0) return [];
    return this.journals
      .query(
        Q.where('id', Q.oneOf(ids)),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();
  }

  async findJournalsByOriginalSmsIds(
    smsIds: string[],
    workplaceId: WorkplaceId,
  ): Promise<Map<string, Journal>> {
    if (smsIds.length === 0) return new Map();
    const metadataRecords = await this.journalMetadata
      .query(Q.where('original_sms_id', Q.oneOf(smsIds)), Q.where('workplace_id', workplaceId))
      .fetch();

    if (metadataRecords.length === 0) return new Map();

    const journalIds = metadataRecords.map(m => m.journalId);
    const journals = await this.findByIds(workplaceId, journalIds);
    const journalMap = new Map(journals.map(j => [j.id, j]));

    const resultMap = new Map<string, Journal>();
    for (const metadata of metadataRecords) {
      const journal = journalMap.get(metadata.journalId);
      if (journal && metadata.originalSmsId) {
        resultMap.set(metadata.originalSmsId, journal);
      }
    }
    return resultMap;
  }

  /** Linked SMS inbox records stored under any of the fingerprints, with their live journals. */
  async findLinkedSmsRecordsByFingerprints(
    fingerprints: string[],
    workplaceId: WorkplaceId,
  ): Promise<{ record: TransactionInboxRecord; journal: Journal }[]> {
    if (fingerprints.length === 0) return [];

    const inboxRecords = await database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .query(
        Q.where('input_fingerprint', Q.oneOf(fingerprints)),
        Q.where('linked_journal_id', Q.notEq(null)),
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
      )
      .fetch();
    if (inboxRecords.length === 0) return [];

    const journals = await this.findByIds(
      workplaceId,
      inboxRecords.map(record => record.linkedJournalId!),
    );
    const journalMap = new Map(journals.map(journal => [journal.id, journal]));
    return inboxRecords.flatMap(record => {
      const journal = journalMap.get(record.linkedJournalId!);
      return journal ? [{ record, journal }] : [];
    });
  }

  async findJournalsByReferenceNumbers(
    referenceNumbers: string[],
    workplaceId: WorkplaceId,
  ): Promise<Map<string, Journal>> {
    if (referenceNumbers.length === 0) return new Map();

    const normalizedRefs = new Set(referenceNumbers.map(normalizeSmsReferenceNumber));
    const resultMap = new Map<string, Journal>();
    const referenceToJournalId = new Map<string, JournalId>();
    const journalIds: JournalId[] = [];

    const inboxRecords = await database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .query(
        Q.where('reference_number', Q.oneOf([...normalizedRefs])),
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
      )
      .fetch();

    for (const record of inboxRecords) {
      const linkedJournalId = record.linkedJournalId;
      const referenceNumber = record.referenceNumber;
      if (!linkedJournalId || !referenceNumber) continue;
      const normalized = normalizeSmsReferenceNumber(referenceNumber);
      if (!normalizedRefs.has(normalized) || referenceToJournalId.has(normalized)) continue;
      journalIds.push(linkedJournalId);
      referenceToJournalId.set(normalized, linkedJournalId);
    }

    const unresolvedRefs = [...normalizedRefs].filter(ref => !referenceToJournalId.has(ref));
    if (unresolvedRefs.length > 0) {
      const metadataRecords = await this.journalMetadata
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('reference_number', Q.oneOf(unresolvedRefs)),
        )
        .fetch();

      for (const metadata of metadataRecords) {
        const ref = metadata.referenceNumber;
        if (!ref || referenceToJournalId.has(ref)) continue;
        referenceToJournalId.set(ref, metadata.journalId);
        journalIds.push(metadata.journalId);
      }
    }

    if (journalIds.length === 0) return resultMap;

    const journals = await this.findByIds(workplaceId, journalIds);
    const journalMap = new Map(journals.map(j => [j.id, j]));

    for (const [reference, journalId] of referenceToJournalId) {
      const journal = journalMap.get(journalId);
      if (journal) {
        resultMap.set(reference, journal);
      }
    }

    return resultMap;
  }

  async findNearbyJournals(
    params: {
      centerDate: number;
      windowMs: number;
      amount?: number;
      amounts?: number[];
      excludeJournalId?: string;
      limit?: number;
    },
    workplaceId: WorkplaceId,
  ): Promise<Journal[]> {
    const { centerDate, windowMs, amount, amounts, excludeJournalId, limit = 10 } = params;
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      Q.where('journal_date', Q.gte(centerDate - windowMs)),
      Q.where('journal_date', Q.lte(centerDate + windowMs)),
      Q.where('workplace_id', workplaceId),
      Q.sortBy('journal_date', 'desc'),
      Q.take(limit),
    ];

    if (typeof amount === 'number') {
      clauses.unshift(Q.where('total_amount', amount));
    } else if (amounts && amounts.length > 0) {
      clauses.unshift(Q.where('total_amount', Q.oneOf(amounts)));
    }

    if (excludeJournalId) {
      clauses.unshift(Q.where('id', Q.notEq(excludeJournalId)));
    }

    return this.journals.query(...clauses).fetch();
  }
}

export const smsJournalQueries = new SmsJournalQueries();
