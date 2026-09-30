import { database } from '@/src/data/database/Database';
import AuditLog from '@/src/data/models/AuditLog';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { InboxProcessingStatus } from '@/src/types/enums';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import { sanitizeSmsAuditChanges, sanitizeSmsMetadataJson } from '@/src/utils/smsPrivateMetadata';
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';

const BATCH_SIZE = 100;

function terminal(status: InboxProcessingStatus): boolean {
  return [
    InboxProcessingStatus.IMPORTED,
    InboxProcessingStatus.AUTO_POSTED,
    InboxProcessingStatus.DISMISSED,
  ].includes(status);
}

function queryAfter<T extends Model>(collection: string, afterId: string | undefined) {
  const clauses: Q.Clause[] = [];
  if (afterId) clauses.push(Q.where('id', Q.gt(afterId)));
  clauses.push(Q.sortBy('id', Q.asc), Q.take(BATCH_SIZE));
  return database.collections.get<T>(collection).query(...clauses);
}

export class SmsPrivacyRepository {
  async scrubLegacySmsContent(): Promise<void> {
    await this.scrubInboxRecords();
    await this.scrubJournalMetadata();
    await this.scrubAuditPayloads();
  }

  private async scrubInboxRecords(): Promise<void> {
    let cursor: string | undefined;
    while (true) {
      const nextCursor = await database.write(async () => {
        const records = await queryAfter<TransactionInboxRecord>(
          'transaction_inbox_records',
          cursor,
        ).fetch();
        if (!records.length) return undefined;
        const operations: Model[] = [];
        for (const record of records) {
          if (record.channel !== 'sms') continue;
          const fingerprint = hashLegacySmsFingerprint(record.inputFingerprint);
          const metadataJson = sanitizeSmsMetadataJson(record.metadataJson, true);
          const eraseRawContent =
            terminal(record.processingStatus) &&
            (record.senderAddress != null || record.rawBody != null);
          if (
            fingerprint === record.inputFingerprint &&
            metadataJson === record.metadataJson &&
            !eraseRawContent
          )
            continue;
          operations.push(
            record.prepareUpdate(current => {
              current.inputFingerprint = fingerprint;
              current.metadataJson = metadataJson;
              if (terminal(current.processingStatus)) {
                current.senderAddress = undefined;
                current.rawBody = undefined;
              }
            }),
          );
        }
        if (operations.length) await database.batch(...operations);
        return records[records.length - 1].id;
      });
      if (!nextCursor) return;
      cursor = nextCursor;
    }
  }

  private async scrubJournalMetadata(): Promise<void> {
    let cursor: string | undefined;
    while (true) {
      const nextCursor = await database.write(async () => {
        const records = await queryAfter<JournalMetadata>('journal_metadata', cursor).fetch();
        if (!records.length) return undefined;
        const operations: Model[] = [];
        for (const record of records) {
          const metadataJson = sanitizeSmsMetadataJson(
            record.metadataJson,
            record.importSource === 'sms',
          );
          if (
            !record.originalSmsSender &&
            !record.originalSmsBody &&
            metadataJson === record.metadataJson
          )
            continue;
          operations.push(
            record.prepareUpdate(current => {
              current.originalSmsSender = undefined;
              current.originalSmsBody = undefined;
              current.metadataJson = sanitizeSmsMetadataJson(
                current.metadataJson,
                current.importSource === 'sms',
              );
            }),
          );
        }
        if (operations.length) await database.batch(...operations);
        return records[records.length - 1].id;
      });
      if (!nextCursor) return;
      cursor = nextCursor;
    }
  }

  private async scrubAuditPayloads(): Promise<void> {
    let cursor: string | undefined;
    while (true) {
      const nextCursor = await database.write(async () => {
        const records = await queryAfter<AuditLog>('audit_logs', cursor).fetch();
        if (!records.length) return undefined;
        const operations: Model[] = [];
        for (const record of records) {
          const changes = sanitizeSmsAuditChanges(record.changes);
          if (changes && changes !== record.changes) {
            operations.push(
              record.prepareUpdate(current => {
                current.changes = changes;
              }),
            );
          }
        }
        if (operations.length) await database.batch(...operations);
        return records[records.length - 1].id;
      });
      if (!nextCursor) return;
      cursor = nextCursor;
    }
  }
}

export const smsPrivacyRepository = new SmsPrivacyRepository();
