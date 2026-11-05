import { database } from '@/src/data/database/Database';
import DeviceSmsInboxRecord from '@/src/data/models/DeviceSmsInboxRecord';
import type {
  TransactionInboxRecordWriteData,
  InboxRecordSnapshot,
  SmsNotificationState,
  SmsScanOrigin,
  SmsWorkplaceReviewState,
} from '@/src/types/smsInbox';
import type { SmsRecognitionSummary } from '@/src/types/accountMatcher';
import { stageModelWrite, type AccountingWriteSession } from './AccountingWriteSession';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { isSmsRedelivery } from '@/src/utils/smsDeliveryIdentity';
import { safeParseJSON } from '@/src/utils/serialization';
import { AppConfig } from '@/src/constants/app-config';
import { Model, Q } from '@nozbe/watermelondb';

export interface SmsRecognitionReviewUpdate {
  deviceInboxId: string;
  recognition: SmsRecognitionSummary;
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
}

export interface DeviceSmsWriteOptions {
  origin: SmsScanOrigin;
  queueReview: boolean;
  source?: Readonly<{ senderAddress: string; rawBody: string }>;
  reviewRule?: Pick<SmsWorkplaceReviewState, 'sourceAccountId' | 'categoryAccountId'>;
  recognition?: SmsRecognitionSummary;
}

interface StagedDeviceWrite {
  existing: DeviceSmsInboxRecord | null;
  id: string;
  data: TransactionInboxRecordWriteData;
  states: Record<string, SmsWorkplaceReviewState>;
  reviewCompleted: boolean;
  aliases: Set<string>;
  options: DeviceSmsWriteOptions;
}

export function deviceSmsSnapshot(
  record: DeviceSmsInboxRecord,
  workplaceId: WorkplaceId,
): InboxRecordSnapshot {
  const state = safeParseJSON<Record<string, SmsWorkplaceReviewState>>(record.reviewStatesJson, {})[
    workplaceId
  ];
  return {
    id: record.id,
    deviceInboxId: record.id,
    workplaceId,
    channel: 'sms',
    deviceSourceId: record.deviceSourceId,
    contentDigest: record.contentDigest,
    senderAddress: record.senderAddress ?? undefined,
    rawBody: record.rawBody ?? undefined,
    inputDate: record.inputDate,
    inputFingerprint: record.inputFingerprint,
    parseStatus: record.parseStatus,
    parsedAmount: record.parsedAmount,
    parsedCurrencyCode: record.parsedCurrencyCode,
    parsedMerchant: record.parsedMerchant,
    parsedAccountSource: record.parsedAccountSource,
    referenceNumber: record.referenceNumber,
    direction: record.direction,
    parseConfidence: record.parseConfidence,
    parseReason: record.parseReason,
    processingStatus:
      state?.processingStatus ??
      (record.parseStatus === InboxParseStatus.PARSE_FAILED
        ? InboxProcessingStatus.PARSE_FAILED
        : InboxProcessingStatus.PENDING),
    duplicateJournalId: state?.duplicateJournalId,
    duplicateConfidence: state?.duplicateConfidence,
    suggestedSourceAccountId: state?.sourceAccountId,
    suggestedCategoryAccountId: state?.categoryAccountId,
    recognition: state?.recognition,
    metadataJson: state?.metadataJson,
    firstSeenAt: record.firstSeenAt,
    lastScannedAt: record.lastScannedAt,
  };
}

/** Owns the shared Device feed and its durable review-delivery state. All writes use the DB writer. */
export class DeviceSmsInboxRepository {
  private readonly stagedWrites = new WeakMap<
    AccountingWriteSession,
    Map<string, StagedDeviceWrite>
  >();
  private get inbox() {
    return database.get<DeviceSmsInboxRecord>('device_sms_inbox_records');
  }

  observe() {
    return this.inbox
      .query(Q.sortBy('input_date', Q.desc))
      .observeWithColumns([
        'parse_status',
        'parsed_amount',
        'parsed_currency_code',
        'parsed_merchant',
        'raw_body',
        'review_states_json',
        'last_scanned_at',
      ]);
  }

  async findRecent(limit: number): Promise<DeviceSmsInboxRecord[]> {
    return this.inbox.query(Q.sortBy('input_date', Q.desc), Q.take(limit)).fetch();
  }

  async findPageAfterId(
    afterId: string | undefined,
    limit: number,
  ): Promise<DeviceSmsInboxRecord[]> {
    return this.inbox
      .query(...(afterId ? [Q.where('id', Q.gt(afterId))] : []), Q.sortBy('id'), Q.take(limit))
      .fetch();
  }

  async find(id: string): Promise<DeviceSmsInboxRecord | null> {
    return (await this.inbox.query(Q.where('id', id)).fetch())[0] ?? null;
  }

  /** Replaces only recognition and suggestions on still-pending Workplace review states. */
  async updatePendingRecognition(
    workplaceId: WorkplaceId,
    updates: readonly SmsRecognitionReviewUpdate[],
    shouldApply: () => boolean = () => true,
  ): Promise<void> {
    if (!updates.length) return;
    const byId = new Map(updates.map(update => [update.deviceInboxId, update]));
    await database.write(async () => {
      if (!shouldApply()) return;
      const records = await this.inbox.query(Q.where('id', Q.oneOf([...byId.keys()]))).fetch();
      if (!shouldApply()) return;
      const operations = records.flatMap(record => {
        const update = byId.get(record.id);
        if (!update) return [];
        const states = safeParseJSON<Record<string, SmsWorkplaceReviewState>>(
          record.reviewStatesJson,
          {},
        );
        const current = states[workplaceId];
        const currentStatus =
          current?.processingStatus ??
          (record.parseStatus === InboxParseStatus.PARSE_FAILED
            ? InboxProcessingStatus.PARSE_FAILED
            : InboxProcessingStatus.PENDING);
        if (currentStatus !== InboxProcessingStatus.PENDING) return [];

        const next: SmsWorkplaceReviewState = {
          ...current,
          processingStatus: InboxProcessingStatus.PENDING,
          recognition: update.recognition,
        };
        delete next.sourceAccountId;
        delete next.categoryAccountId;
        if (update.sourceAccountId) next.sourceAccountId = update.sourceAccountId;
        if (update.categoryAccountId) next.categoryAccountId = update.categoryAccountId;
        states[workplaceId] = next;
        const encoded = JSON.stringify(states);
        if (encoded === record.reviewStatesJson) return [];
        return [
          record.prepareUpdate(entry => {
            entry.reviewStatesJson = encoded;
          }),
        ];
      });
      if (operations.length) await database.batch(...operations);
    });
  }

  async findBySourceIds(ids: string[]): Promise<DeviceSmsInboxRecord[]> {
    if (!ids.length) return [];
    return this.inbox
      .query(
        Q.or(
          Q.where('device_source_id', Q.oneOf(ids)),
          ...ids.map(id =>
            Q.where(
              'provider_aliases_json',
              Q.like(`%${Q.sanitizeLikeString(JSON.stringify(id))}%`),
            ),
          ),
        ),
      )
      .fetch();
  }

  async findMatch(data: TransactionInboxRecordWriteData): Promise<DeviceSmsInboxRecord | null> {
    const exact = await this.findBySourceIds([data.deviceSourceId]);
    if (exact[0]) return exact[0];
    if (!data.contentDigest) return null;
    const window = AppConfig.input.sms.duplicateDetection.redeliveryWindowMs;
    const candidates = await this.inbox
      .query(
        Q.where('content_digest', data.contentDigest),
        Q.where('input_date', Q.between(data.inputDate - window, data.inputDate + window)),
      )
      .fetch();
    return candidates.find(candidate => isSmsRedelivery(candidate, data)) ?? null;
  }

  async stageUpsert(
    session: AccountingWriteSession,
    data: TransactionInboxRecordWriteData,
    options: DeviceSmsWriteOptions,
  ): Promise<{ id: string; deviceSourceId: string; inputDate: number }> {
    let writes = this.stagedWrites.get(session);
    if (!writes) {
      writes = new Map();
      this.stagedWrites.set(session, writes);
    }
    let staged = [...writes.values()].find(
      write =>
        write.data.deviceSourceId === data.deviceSourceId || isSmsRedelivery(write.data, data),
    );
    if (!staged) {
      const existing = await this.findMatch(data);
      const id = existing?.id ?? data.deviceInboxId;
      if (!id) throw new Error('A new Device SMS requires a stable inbox identity');
      staged = {
        existing,
        id,
        data,
        options,
        reviewCompleted: false,
        aliases: new Set(safeParseJSON<string[]>(existing?.providerAliasesJson, [])),
        states: safeParseJSON<Record<string, SmsWorkplaceReviewState>>(
          existing?.reviewStatesJson,
          {},
        ),
      };
      writes.set(id, staged);
      const write = staged;
      stageModelWrite(session, () => [this.prepareWrite(write)]);
    }
    staged.aliases.add(data.providerSourceId ?? data.deviceSourceId);
    staged.aliases.add(staged.data.deviceSourceId);
    staged.states[data.workplaceId] = {
      processingStatus:
        data.processingStatus === InboxProcessingStatus.IMPORTED ||
        data.processingStatus === InboxProcessingStatus.AUTO_POSTED ||
        data.processingStatus === InboxProcessingStatus.DISMISSED
          ? InboxProcessingStatus.PENDING
          : data.processingStatus,
      duplicateJournalId: data.duplicateJournalId,
      duplicateConfidence: data.duplicateConfidence,
      metadataJson: data.metadataJson,
      ...options.reviewRule,
      ...(options.recognition ? { recognition: options.recognition } : {}),
    };
    staged.reviewCompleted ||=
      data.processingStatus === InboxProcessingStatus.IMPORTED ||
      data.processingStatus === InboxProcessingStatus.AUTO_POSTED;
    // Keep original content/identity on redelivery, but allow later parsing corrections.
    staged.data = {
      ...data,
      deviceSourceId: staged.data.deviceSourceId,
      inputDate: staged.data.inputDate,
    };
    return {
      id: staged.id,
      deviceSourceId: staged.data.deviceSourceId,
      inputDate: staged.data.inputDate,
    };
  }

  private prepareWrite(write: StagedDeviceWrite): Model {
    const { data, options, existing } = write;
    const apply = (record: DeviceSmsInboxRecord) => {
      record.deviceSourceId = data.deviceSourceId;
      record.providerAliasesJson = JSON.stringify([...write.aliases]);
      record.inputDate = data.inputDate;
      record.inputFingerprint = data.inputFingerprint;
      record.contentDigest = data.contentDigest ?? existing?.contentDigest;
      record.senderAddress =
        existing?.senderAddress ?? options.source?.senderAddress ?? data.senderAddress;
      record.rawBody = existing?.rawBody ?? options.source?.rawBody ?? data.rawBody;
      record.parseStatus = data.parseStatus;
      record.parsedAmount = data.parsedAmount;
      record.parsedCurrencyCode = data.parsedCurrencyCode;
      record.parsedMerchant = data.parsedMerchant;
      record.parsedAccountSource = data.parsedAccountSource;
      record.referenceNumber = data.referenceNumber;
      record.direction = data.direction;
      record.parseConfidence = data.parseConfidence;
      record.parseReason = data.parseReason;
      record.reviewStatesJson = JSON.stringify(write.states);
      record.firstSeenAt = existing?.firstSeenAt ?? data.firstSeenAt;
      record.lastScannedAt = data.lastScannedAt;
      if (!existing) {
        record.notificationOrigin = options.origin;
        record.notificationWorkplaceId = data.workplaceId;
        record.notificationState = options.queueReview ? 'pending' : 'none';
      }
      if (write.reviewCompleted || data.processingStatus === InboxProcessingStatus.DISMISSED) {
        record.notificationState = 'suppressed';
      }
    };
    return existing
      ? existing.prepareUpdate(apply)
      : this.inbox.prepareCreate(record => {
          record._raw.id = write.id;
          apply(record);
        });
  }

  async pendingNotifications(): Promise<DeviceSmsInboxRecord[]> {
    return this.inbox
      .query(Q.where('notification_state', 'pending'), Q.sortBy('input_date', Q.asc))
      .fetch();
  }

  async notificationGroupMembers(groupId: string): Promise<DeviceSmsInboxRecord[]> {
    return this.inbox.query(Q.where('notification_group_id', groupId)).fetch();
  }

  async finishNotifications(
    ids: string[],
    state: SmsNotificationState,
    groupId?: string,
  ): Promise<void> {
    if (!ids.length) return;
    await database.write(async () => {
      const records = await this.inbox
        .query(Q.where('id', Q.oneOf(ids)), Q.where('notification_state', 'pending'))
        .fetch();
      await database.batch(
        ...records.map(record =>
          record.prepareUpdate(entry => {
            entry.notificationState = state;
            entry.notificationGroupId = groupId ?? entry.notificationGroupId;
          }),
        ),
      );
    });
  }
}

export const deviceSmsInboxRepository = new DeviceSmsInboxRepository();
