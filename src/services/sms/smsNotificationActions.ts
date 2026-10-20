import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountType, InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';

export const SMS_LOG_ACTION = 'sms-review-log';
export const SMS_IGNORE_ACTION = 'sms-review-ignore';
export const SMS_REVIEW_ACTIONS_CATEGORY = 'sms-review-actions';
export const SMS_REVIEW_IGNORE_CATEGORY = 'sms-review-ignore-only';

export function smsReviewRevision(record: InboxRecordSnapshot, accounts: AccountFields[]): string {
  return hashLegacySmsFingerprint(
    JSON.stringify([
      record.id,
      record.workplaceId,
      record.parsedAmount,
      record.parsedCurrencyCode,
      record.parsedMerchant,
      record.parsedAccountSource,
      record.direction,
      record.inputDate,
      record.suggestedSourceAccountId,
      record.suggestedCategoryAccountId,
      [...accounts]
        .sort((first, second) => first.id.localeCompare(second.id))
        .map(account => [
          account.id,
          account.name,
          account.accountType,
          account.currencyCode,
          account.archivedAt,
        ]),
    ]),
  );
}

export function canQuickLogSms(record: InboxRecordSnapshot, accounts: AccountFields[]): boolean {
  const source = accounts.find(account => account.id === record.suggestedSourceAccountId);
  const category = accounts.find(account => account.id === record.suggestedCategoryAccountId);
  const currency = record.parsedCurrencyCode || source?.currencyCode;
  return (
    record.channel === 'sms' &&
    record.processingStatus === InboxProcessingStatus.PENDING &&
    record.parseStatus === InboxParseStatus.PARSED &&
    !record.linkedJournalId &&
    !record.duplicateJournalId &&
    !record.consumedWorkplaces?.length &&
    typeof record.parsedAmount === 'number' &&
    Number.isFinite(record.parsedAmount) &&
    record.parsedAmount > 0 &&
    Number.isFinite(record.inputDate) &&
    record.inputDate > 0 &&
    record.inputDate <= Date.now() &&
    !!source &&
    !!category &&
    source.id !== category.id &&
    !source.archivedAt &&
    !category.archivedAt &&
    [AccountType.ASSET, AccountType.LIABILITY].includes(source.accountType) &&
    ((record.direction === 'debit' && category.accountType === AccountType.EXPENSE) ||
      (record.direction === 'credit' && category.accountType === AccountType.INCOME)) &&
    !!currency &&
    source.currencyCode === currency &&
    category.currencyCode === currency
  );
}
