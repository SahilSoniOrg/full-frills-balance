import type { SmsMessage } from '@/modules/expo-sms-inbox';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import type { AccountMatcherPreviewMessage } from '@/src/services/accounts/accountMatcherPreviewQueries';
import type { SmsInboxCursor } from '@/src/types/smsInbox';
import type { WorkplaceId } from '@/src/types/ids';
import { AppConfig } from '@/src/constants';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';

const PAGE_SIZE = AppConfig.pagination.smsImportScanLimit;

export interface AccountMatcherOlderMessagePage {
  messages: AccountMatcherPreviewMessage[];
  nextCursor: SmsInboxCursor | null;
  hasMore: boolean;
}

function compareNativeIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function newestFirst(messages: SmsMessage[]): SmsMessage[] {
  return [...messages].sort(
    (left, right) => right.date - left.date || compareNativeIds(right.id, left.id),
  );
}

function toMatcherMessage(
  message: SmsMessage,
  workplaceId: WorkplaceId,
): AccountMatcherPreviewMessage {
  return {
    id: `android-sms:${message.id}`,
    workplaceId,
    channel: 'sms',
    deviceSourceId: message.id,
    senderAddress: message.address,
    rawBody: message.body,
    inputDate: message.date,
    inputFingerprint: `android-picker:${message.id}`,
    parseStatus: InboxParseStatus.PARSED,
    direction: TransactionDirection.UNKNOWN,
    processingStatus: InboxProcessingStatus.PENDING,
    firstSeenAt: message.date,
    lastScannedAt: message.date,
    linkedAccountIds: [],
    linkedAccountNames: [],
  };
}

function makePage(
  messages: SmsMessage[],
  workplaceId: WorkplaceId,
): AccountMatcherOlderMessagePage {
  const ordered = newestFirst(messages);
  const oldest = ordered.at(-1);
  return {
    messages: ordered.map(message => toMatcherMessage(message, workplaceId)),
    nextCursor: oldest ? { date: oldest.date, id: oldest.id } : null,
    hasMore: ordered.length === PAGE_SIZE,
  };
}

/** Reads one device inbox page for matcher configuration without importing or storing it. */
export async function readLatestAccountMatcherMessages(
  workplaceId: WorkplaceId,
): Promise<AccountMatcherOlderMessagePage> {
  const messages = await smsInboxBridge.getLatestMessages(PAGE_SIZE, true);
  return makePage(messages, workplaceId);
}

/** Continues the read-only device inbox paging cursor used by the matcher picker. */
export async function readOlderAccountMatcherMessages(
  workplaceId: WorkplaceId,
  cursor: SmsInboxCursor,
): Promise<AccountMatcherOlderMessagePage> {
  const messages = await smsInboxBridge.getOlderMessages(cursor, PAGE_SIZE);
  return makePage(messages, workplaceId);
}
