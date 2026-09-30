import { database } from '@/src/data/database/Database';
import AuditLog from '@/src/data/models/AuditLog';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import {
  clearsRawSmsContent,
  sanitizeSmsAuditChanges,
  sanitizeSmsMetadataJson,
} from '@/src/utils/smsPrivateMetadata';
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';

const BATCH_SIZE = 100;

function sameOptional(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

function queryAfter<T extends Model>(collection: string, afterId: string | undefined) {
  const clauses: Q.Clause[] = [];
  if (afterId) clauses.push(Q.where('id', Q.gt(afterId)));
  clauses.push(Q.sortBy('id', Q.asc), Q.take(BATCH_SIZE));
  return database.collections.get<T>(collection).query(...clauses);
}

/**
 * Each page decides every update before preparing any: on device, work between a
 * prepareUpdate and batch() lets queued microtasks observe the pending record.
 */
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
        const updates = records.flatMap(record => {
          if (record.channel !== 'sms') return [];
          const fingerprint = hashLegacySmsFingerprint(record.inputFingerprint);
          const metadataJson = sanitizeSmsMetadataJson(record.metadataJson, true);
          const eraseRawContent =
            clearsRawSmsContent(record.processingStatus) &&
            (record.senderAddress != null || record.rawBody != null);
          if (
            fingerprint === record.inputFingerprint &&
            sameOptional(metadataJson, record.metadataJson) &&
            !eraseRawContent
          )
            return [];
          return [{ record, fingerprint, metadataJson, eraseRawContent }];
        });
        if (updates.length) {
          await database.batch(
            updates.map(({ record, fingerprint, metadataJson, eraseRawContent }) =>
              record.prepareUpdate(current => {
                current.inputFingerprint = fingerprint;
                current.metadataJson = metadataJson;
                if (eraseRawContent) {
                  current.senderAddress = undefined;
                  current.rawBody = undefined;
                }
              }),
            ),
          );
        }
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
        const updates = records.flatMap(record => {
          const metadataJson = sanitizeSmsMetadataJson(
            record.metadataJson,
            record.importSource === 'sms',
          );
          if (
            !record.originalSmsSender &&
            !record.originalSmsBody &&
            sameOptional(metadataJson, record.metadataJson)
          )
            return [];
          return [{ record, metadataJson }];
        });
        if (updates.length) {
          await database.batch(
            updates.map(({ record, metadataJson }) =>
              record.prepareUpdate(current => {
                current.originalSmsSender = undefined;
                current.originalSmsBody = undefined;
                current.metadataJson = metadataJson;
              }),
            ),
          );
        }
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
        const updates = records.flatMap(record => {
          const changes = sanitizeSmsAuditChanges(record.changes);
          return changes && changes !== record.changes ? [{ record, changes }] : [];
        });
        if (updates.length) {
          await database.batch(
            updates.map(({ record, changes }) =>
              record.prepareUpdate(current => {
                current.changes = changes;
              }),
            ),
          );
        }
        return records[records.length - 1].id;
      });
      if (!nextCursor) return;
      cursor = nextCursor;
    }
  }
}

export const smsPrivacyRepository = new SmsPrivacyRepository();
