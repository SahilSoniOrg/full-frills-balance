import { database } from '@/src/data/database/Database';
import AuditLog from '@/src/data/models/AuditLog';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import DeviceSmsInboxRecord from '@/src/data/models/DeviceSmsInboxRecord';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import {
  sanitizeSmsAuditChanges,
  hashSmsMetadataFingerprints,
} from '@/src/utils/smsPrivateMetadata';
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';

const BATCH_SIZE = 100;

function queryAfter<T extends Model>(collection: string, afterId: string | undefined) {
  const clauses: Q.Clause[] = [];
  if (afterId) clauses.push(Q.where('id', Q.gt(afterId)));
  clauses.push(Q.sortBy('id', Q.asc), Q.take(BATCH_SIZE));
  return database.collections.get<T>(collection).query(...clauses);
}

type CollectionUpdate<T extends Model> = {
  record: T;
  apply: (entry: T) => void;
};

/**
 * Each page decides every update before preparing any: on device, work between a
 * prepareUpdate and batch() lets queued microtasks observe the pending record.
 */
async function paginateCollection<T extends Model>(
  collection: string,
  toUpdates: (records: readonly T[]) => CollectionUpdate<T>[],
): Promise<void> {
  let cursor: string | undefined;
  while (true) {
    const nextCursor = await database.write(async () => {
      const records = await queryAfter<T>(collection, cursor).fetch();
      if (!records.length) return undefined;
      const updates = toUpdates(records);
      if (updates.length) {
        await database.batch(...updates.map(({ record, apply }) => record.prepareUpdate(apply)));
      }
      return records[records.length - 1].id;
    });
    if (!nextCursor) return;
    cursor = nextCursor;
  }
}

export class SmsPrivacyRepository {
  async sanitizeLegacySmsData(): Promise<void> {
    await this.hashDeviceInboxIdentities();
    await this.hashInboxIdentities();
    await this.hashJournalMetadataIdentities();
    await this.scrubAuditPayloads();
  }

  private async hashDeviceInboxIdentities(): Promise<void> {
    await paginateCollection<DeviceSmsInboxRecord>('device_sms_inbox_records', records =>
      records
        .map(record => ({
          record,
          fingerprint: hashLegacySmsFingerprint(record.inputFingerprint),
          states: hashSmsMetadataFingerprints(record.reviewStatesJson) ?? '{}',
        }))
        .filter(
          update =>
            update.fingerprint !== update.record.inputFingerprint ||
            update.states !== update.record.reviewStatesJson,
        )
        .map(({ record, fingerprint, states }) => ({
          record,
          apply: (entry: DeviceSmsInboxRecord) => {
            entry.inputFingerprint = fingerprint;
            entry.reviewStatesJson = states;
          },
        })),
    );
  }

  private async hashInboxIdentities(): Promise<void> {
    await paginateCollection<TransactionInboxRecord>('transaction_inbox_records', records =>
      records.flatMap(record => {
        if (record.channel !== 'sms') return [];
        const fingerprint = hashLegacySmsFingerprint(record.inputFingerprint);
        const metadataJson = hashSmsMetadataFingerprints(record.metadataJson);
        if (
          fingerprint === record.inputFingerprint &&
          (metadataJson ?? null) === (record.metadataJson ?? null)
        )
          return [];
        return [
          {
            record,
            apply: (current: TransactionInboxRecord) => {
              current.inputFingerprint = fingerprint;
              current.metadataJson = metadataJson;
            },
          },
        ];
      }),
    );
  }

  private async hashJournalMetadataIdentities(): Promise<void> {
    await paginateCollection<JournalMetadata>('journal_metadata', records =>
      records.flatMap(record => {
        const metadataJson = hashSmsMetadataFingerprints(record.metadataJson);
        if ((metadataJson ?? null) === (record.metadataJson ?? null)) return [];
        return [
          {
            record,
            apply: (current: JournalMetadata) => {
              current.metadataJson = metadataJson;
            },
          },
        ];
      }),
    );
  }

  private async scrubAuditPayloads(): Promise<void> {
    await paginateCollection<AuditLog>('audit_logs', records =>
      records.flatMap(record => {
        const changes = sanitizeSmsAuditChanges(record.changes);
        return changes && changes !== record.changes
          ? [
              {
                record,
                apply: (current: AuditLog) => {
                  current.changes = changes;
                },
              },
            ]
          : [];
      }),
    );
  }
}

export const smsPrivacyRepository = new SmsPrivacyRepository();
