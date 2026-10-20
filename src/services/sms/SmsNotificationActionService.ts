import { accountQueryRepository } from '@/src/data/repositories/account';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { journalService } from '@/src/services/journal/journalDomainService';
import { assembleCreateJournalData } from '@/src/services/journal/journalSaveHelpers';
import { preferences } from '@/src/services/preferences';
import { InboxParseStatus, InboxProcessingStatus, TransactionType } from '@/src/types/enums';
import { asTransactionId, type WorkplaceId } from '@/src/types/ids';
import { generator } from '@/src/data/database/idGenerator';
import type { PendingSmsNotificationIntent } from './SmsNotificationIntentStore';
import {
  canQuickLogSms,
  smsReviewRevision,
  SMS_IGNORE_ACTION,
  SMS_LOG_ACTION,
} from './smsNotificationActions';

export class SmsNotificationActionService {
  private queue: Promise<unknown> = Promise.resolve();

  execute(intent: PendingSmsNotificationIntent, workplaceId: WorkplaceId, isReady: () => boolean) {
    const pending = this.queue
      .catch(() => undefined)
      .then(() => this.apply(intent, workplaceId, isReady));
    this.queue = pending;
    return pending;
  }

  private async apply(
    intent: PendingSmsNotificationIntent,
    workplaceId: WorkplaceId,
    isReady: () => boolean,
  ): Promise<'logged' | 'ignored' | 'review' | 'handled'> {
    if (!isReady() || intent.grouped || !intent.inboxRecordId || intent.workplaceId !== workplaceId)
      return 'review';
    const record = await transactionInboxRepository.find(workplaceId, intent.inboxRecordId);
    if (!isReady()) return 'review';
    if (
      !record ||
      record.linkedJournalId ||
      ![InboxProcessingStatus.PENDING, InboxProcessingStatus.PARSE_FAILED].includes(
        record.processingStatus,
      )
    )
      return 'handled';
    if (intent.actionIdentifier === SMS_IGNORE_ACTION) {
      await transactionInboxRepository.persistStatus(
        workplaceId,
        record.id,
        InboxProcessingStatus.DISMISSED,
      );
      return 'ignored';
    }
    if (intent.actionIdentifier !== SMS_LOG_ACTION) return 'review';
    if (
      !preferences.device.getSnapshot().showSmsNotificationDetails ||
      preferences.getSnapshot().isPrivacyMode ||
      preferences.device.isAppLockEnabled
    )
      return 'review';
    const ids = [record.suggestedSourceAccountId, record.suggestedCategoryAccountId].filter(
      (id): id is NonNullable<typeof id> => !!id,
    );
    const accounts = await accountQueryRepository.findAllByIds(workplaceId, ids);
    if (
      !isReady() ||
      !canQuickLogSms(record, accounts) ||
      intent.reviewRevision !== smsReviewRevision(record, accounts)
    )
      return 'review';
    const source = accounts.find(account => account.id === record.suggestedSourceAccountId)!;
    const category = accounts.find(account => account.id === record.suggestedCategoryAccountId)!;
    const expense = record.direction === 'debit';
    const assembled = await assembleCreateJournalData({
      workplaceId,
      smsRecordId: record.id,
      smsId: record.deviceSourceId,
      currencyCode: record.parsedCurrencyCode || source.currencyCode,
      journalDate: record.inputDate,
      description:
        record.parsedMerchant?.trim() || (expense ? 'Expense via SMS' : 'Income via SMS'),
      lines: [source, category].map((account, index) => ({
        id: asTransactionId(generator()),
        accountId: account.id,
        accountName: account.name,
        accountType: account.accountType,
        accountCurrency: account.currencyCode,
        amount: String(record.parsedAmount),
        transactionType: (index === 0) === expense ? TransactionType.CREDIT : TransactionType.DEBIT,
        notes: '',
        exchangeRate: '1',
      })),
    });
    if (!assembled.success)
      throw new Error('Could not log the transaction. Review it before trying again.');
    if (
      !isReady() ||
      preferences.getSnapshot().isPrivacyMode ||
      preferences.device.isAppLockEnabled
    )
      return 'review';
    await journalService.createJournal(assembled.journalData, workplaceId, record);
    return 'logged';
  }

  async undoIgnore(
    intent: PendingSmsNotificationIntent,
    workplaceId: WorkplaceId,
    isReady: () => boolean,
  ): Promise<void> {
    if (!isReady() || !intent.inboxRecordId || intent.workplaceId !== workplaceId) return;
    const record = await transactionInboxRepository.find(workplaceId, intent.inboxRecordId);
    if (
      !isReady() ||
      record?.processingStatus !== InboxProcessingStatus.DISMISSED ||
      record.linkedJournalId
    )
      return;
    await transactionInboxRepository.persistStatus(
      workplaceId,
      record.id,
      record.parseStatus === InboxParseStatus.PARSE_FAILED
        ? InboxProcessingStatus.PARSE_FAILED
        : InboxProcessingStatus.PENDING,
    );
  }
}

export const smsNotificationActionService = new SmsNotificationActionService();
