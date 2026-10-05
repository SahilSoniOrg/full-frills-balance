import { deviceSmsInboxRepository } from '@/src/data/repositories/DeviceSmsInboxRepository';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { accountQueryRepository } from '@/src/data/repositories/account';
import {
  notificationService,
  SMS_REVIEW_NOTIFICATION_TYPE,
  type SmsReviewIntent,
} from '@/src/services/notification/NotificationService';
import { preferences } from '@/src/services/preferences';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { inboxDirectionToParsedType } from '@/src/services/sms/inboxDirection';
import { formatSmsReviewNotification } from './smsReviewNotification';
import { merge, auditTime } from 'rxjs';
import { logger } from '@/src/utils/logger';

const actionable = (record: InboxRecordSnapshot | null) =>
  !!record &&
  [InboxProcessingStatus.PENDING, InboxProcessingStatus.PARSE_FAILED].includes(
    record.processingStatus,
  );

type ReviewDeliveryPrefs = {
  devicePrefs: ReturnType<typeof preferences.device.getSnapshot>;
  detailsAllowed: boolean;
  privatePreview: boolean;
};

export class SmsReviewNotificationService {
  private queue: Promise<void> = Promise.resolve();

  observeForegroundChanges(): () => void {
    const subscription = merge(
      deviceSmsInboxRepository.observe(),
      transactionInboxRepository.observeConsumptionChanges(),
      preferences.observe('isPrivacyMode'),
      preferences.device.observe('showSmsNotificationDetails'),
      preferences.device.observe('areSmsReviewNotificationsEnabled'),
      preferences.device.observe('isAppLockEnabled'),
    )
      .pipe(auditTime(0))
      .subscribe(() => {
        void this.refresh();
      });
    return () => subscription.unsubscribe();
  }

  /** Remove unsafe or legacy previews even while launch or unlock gates are still closed. */
  async reconcilePrivacy(): Promise<void> {
    await preferences.loadPreferences();
    const ctx = this.readReviewDeliveryPrefs();
    await notificationService.reconcileSmsReviews(intent =>
      Promise.resolve(this.shouldRetainReviewNotification(intent, ctx)),
    );
  }

  flush(): Promise<void> {
    const pending = this.queue.catch(() => undefined).then(() => this.deliverPending());
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  private readReviewDeliveryPrefs(): ReviewDeliveryPrefs {
    const prefs = preferences.getSnapshot();
    const devicePrefs = preferences.device.getSnapshot();
    const detailsAllowed =
      devicePrefs.showSmsNotificationDetails &&
      !prefs.isPrivacyMode &&
      !preferences.device.isAppLockEnabled;
    return { devicePrefs, detailsAllowed, privatePreview: !detailsAllowed };
  }

  private shouldRetainReviewNotification(
    intent: SmsReviewIntent,
    ctx: ReviewDeliveryPrefs,
  ): boolean {
    return (
      !!intent.inboxRecordId &&
      ctx.devicePrefs.areSmsReviewNotificationsEnabled &&
      (!intent.hasDetails || ctx.detailsAllowed)
    );
  }

  private async deliverPending(): Promise<void> {
    await preferences.loadPreferences();
    const ctx = this.readReviewDeliveryPrefs();
    await notificationService.reconcileSmsReviews(async (intent, identifier) => {
      if (!this.shouldRetainReviewNotification(intent, ctx)) return false;
      if (
        notificationService.isSmsReviewForegroundSuppressed(intent.inboxRecordId) ||
        (ctx.privatePreview && intent.hasDetails)
      )
        return false;
      if (!intent.inboxRecordId || !intent.workplaceId) return false;
      if (intent.grouped) {
        const members = await deviceSmsInboxRepository.notificationGroupMembers(identifier);
        for (const member of members) {
          if (
            actionable(
              await transactionInboxRepository.find(intent.workplaceId as WorkplaceId, member.id),
            )
          )
            return true;
        }
      }
      return actionable(
        await transactionInboxRepository.find(
          intent.workplaceId as WorkplaceId,
          intent.inboxRecordId,
        ),
      );
    });
    const records = await deviceSmsInboxRepository.pendingNotifications();
    const eligible: { id: string; record: InboxRecordSnapshot; catchUp: boolean }[] = [];
    for (const device of records) {
      if (!device.notificationWorkplaceId) {
        await deviceSmsInboxRepository.finishNotifications([device.id], 'suppressed');
        continue;
      }
      const record = await transactionInboxRepository.find(
        device.notificationWorkplaceId,
        device.id,
      );
      if (
        !actionable(record) ||
        !ctx.devicePrefs.areSmsReviewNotificationsEnabled ||
        notificationService.isSmsReviewForegroundSuppressed(device.id)
      ) {
        await deviceSmsInboxRepository.finishNotifications([device.id], 'suppressed');
      } else if (record)
        eligible.push({ id: device.id, record, catchUp: device.notificationOrigin === 'catch_up' });
    }
    if (!eligible.length || !(await notificationService.canDeliverSmsReview())) return;
    // Group catch-up and retries. An arrival with exactly one item opens that specific review.
    const groups = new Map<WorkplaceId, typeof eligible>();
    for (const item of eligible) {
      const group = groups.get(item.record.workplaceId) ?? [];
      group.push(item);
      groups.set(item.record.workplaceId, group);
    }
    for (const [workplaceId, group] of groups) {
      const latest = group[group.length - 1];
      const grouped = group.length > 1 || group.some(item => item.catchUp);
      let body = grouped
        ? `${group.length} SMS transactions need your review. Open the inbox to log them.`
        : 'A transaction message needs your review. Open the app to log it.';
      if (!ctx.privatePreview && !grouped) {
        const hints = {
          sourceAccountId: latest.record.suggestedSourceAccountId,
          categoryAccountId: latest.record.suggestedCategoryAccountId,
        };
        const accounts = await accountQueryRepository.findAllByIds(
          workplaceId,
          [hints.sourceAccountId, hints.categoryAccountId].filter(
            (id): id is NonNullable<typeof id> => !!id,
          ),
        );
        const names = new Map(accounts.map(account => [account.id, account.name]));
        body = formatSmsReviewNotification(
          {
            amount: latest.record.parsedAmount,
            currencyCode: latest.record.parsedCurrencyCode,
            merchant: latest.record.parsedMerchant,
            accountSource: latest.record.parsedAccountSource,
            type: inboxDirectionToParsedType(latest.record.direction),
          },
          {
            sourceAccountName: hints.sourceAccountId ? names.get(hints.sourceAccountId) : undefined,
            categoryName: hints.categoryAccountId ? names.get(hints.categoryAccountId) : undefined,
          },
        );
      }
      const identifier = grouped ? `sms-review:catch-up:${group[0].id}` : `sms-review:${latest.id}`;
      const delivered = await notificationService.deliverSmsReview(identifier, body, {
        type: SMS_REVIEW_NOTIFICATION_TYPE,
        inboxRecordId: latest.id,
        workplaceId,
        grouped,
        hasDetails: !ctx.privatePreview && !grouped,
      });
      if (delivered)
        await deviceSmsInboxRepository.finishNotifications(
          group.map(item => item.id),
          'delivered',
          identifier,
        );
    }
  }

  /** UI maintenance is best effort; the outbox remains retryable after failures. */
  async refresh(): Promise<void> {
    try {
      await this.flush();
    } catch {
      logger.warn('[SMS] Review delivery remains pending');
    }
  }
}
export const smsReviewNotificationService = new SmsReviewNotificationService();
