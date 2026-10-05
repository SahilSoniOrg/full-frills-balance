import { AppConfig } from '@/src/constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type NotificationCadence = 'none' | 'daily' | 'weekly';
export const SMS_REVIEW_NOTIFICATION_TYPE = 'sms_transaction_needs_review';
export const SMS_REVIEW_CHANNEL = 'sms-review';
const REMINDER_CHANNEL = 'journal-reminders';
const REMINDER_ID = 'journal-reminder';

export interface SmsReviewIntent {
  type: typeof SMS_REVIEW_NOTIFICATION_TYPE;
  inboxRecordId: string;
  workplaceId?: string;
  grouped?: boolean;
  hasDetails?: boolean;
}

export class NotificationService {
  private channels: Promise<void> | null = null;
  private reminderGeneration = 0;
  private reminderQueue: Promise<void> = Promise.resolve();
  private reviewVisible = false;
  private reviewRecordId?: string;

  constructor() {
    if (Platform.OS === 'web') return;
    Notifications.setNotificationHandler({
      handleNotification: async notification => {
        const show = !(
          (this.reviewVisible ||
            (this.reviewRecordId &&
              notification.request.content.data?.inboxRecordId === this.reviewRecordId)) &&
          notification.request.content.data?.type === SMS_REVIEW_NOTIFICATION_TYPE
        );
        return {
          shouldShowAlert: show,
          shouldShowBanner: show,
          shouldShowList: show,
          shouldPlaySound: show,
          shouldSetBadge: false,
        };
      },
    });
  }

  setSmsReviewVisible(visible: boolean, recordId?: string): void {
    this.reviewVisible = visible;
    this.reviewRecordId = recordId;
  }

  isSmsReviewForegroundSuppressed(recordId?: string): boolean {
    return this.reviewVisible || (recordId !== undefined && this.reviewRecordId === recordId);
  }

  private ensureChannels(): Promise<void> {
    if (Platform.OS !== 'android') return Promise.resolve();
    if (!this.channels) {
      this.channels = (async () => {
        await Notifications.setNotificationChannelAsync(SMS_REVIEW_CHANNEL, {
          name: 'SMS to review',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
        await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
          name: 'Journal reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      })().catch(error => {
        this.channels = null;
        throw error;
      });
    }
    return this.channels;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    await this.ensureChannels();
    const existing = await Notifications.getPermissionsAsync();
    if (existing?.status === 'granted') return true;
    if (existing?.canAskAgain === false) return false;
    return (await Notifications.requestPermissionsAsync())?.status === 'granted';
  }

  async checkPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return (await Notifications.getPermissionsAsync())?.status === 'granted';
  }

  async canDeliverSmsReview(): Promise<boolean> {
    if (!(await this.checkPermissions())) return false;
    await this.ensureChannels();
    if (Platform.OS !== 'android') return true;
    const channel = await Notifications.getNotificationChannelAsync(SMS_REVIEW_CHANNEL);
    return !!channel && channel.importance !== Notifications.AndroidImportance.NONE;
  }

  async deliverSmsReview(
    identifier: string,
    body: string,
    intent: SmsReviewIntent,
  ): Promise<boolean> {
    if (!(await this.canDeliverSmsReview())) return false;
    // A stable ID replaces an alert if delivery succeeds but saving its receipt is interrupted.
    await Notifications.dismissNotificationAsync(identifier);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: intent.grouped ? 'SMS transactions to review' : 'Transaction needs your input',
        body,
        data: { ...intent },
      },
      trigger: Platform.OS === 'android' ? { channelId: SMS_REVIEW_CHANNEL } : null,
    });
    return true;
  }

  /** Removes only SMS alerts that no longer represent an actionable review. */
  async reconcileSmsReviews(
    keep: (intent: SmsReviewIntent, identifier: string) => Promise<boolean>,
  ): Promise<void> {
    if (Platform.OS === 'web') return;
    const [presented, scheduled] = await Promise.all([
      Notifications.getPresentedNotificationsAsync(),
      Notifications.getAllScheduledNotificationsAsync(),
    ]);
    const requests = new Map<string, Notifications.NotificationRequest>([
      ...presented.map(
        notification => [notification.request.identifier, notification.request] as const,
      ),
      ...scheduled.map(request => [request.identifier, request] as const),
    ]);
    for (const request of requests.values()) {
      const data = request.content.data;
      if (data?.type !== SMS_REVIEW_NOTIFICATION_TYPE) continue;
      const intent: SmsReviewIntent = {
        type: SMS_REVIEW_NOTIFICATION_TYPE,
        inboxRecordId: typeof data.inboxRecordId === 'string' ? data.inboxRecordId : '',
        workplaceId: typeof data.workplaceId === 'string' ? data.workplaceId : undefined,
        grouped: data.grouped === true,
        hasDetails: data.hasDetails === true,
      };
      if (await keep(intent, request.identifier)) continue;
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
      await Notifications.dismissNotificationAsync(request.identifier);
    }
  }

  scheduleReminder(
    cadence: NotificationCadence,
    hour: number,
    minute: number,
    weekday = 1,
  ): Promise<void> {
    if (Platform.OS === 'web') return Promise.resolve();
    const generation = ++this.reminderGeneration;
    const pending = this.reminderQueue
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.reminderGeneration) return;
        // Include legacy reminder IDs, without touching review alerts or other notification owners.
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        for (const request of scheduled) {
          if (
            request.identifier === REMINDER_ID ||
            request.content.data?.type === 'journal_reminder' ||
            (request.content.title === AppConfig.strings.settings.notifications.reminderTitle &&
              !request.content.data?.type)
          ) {
            await Notifications.cancelScheduledNotificationAsync(request.identifier);
          }
        }
        if (
          generation !== this.reminderGeneration ||
          cadence === 'none' ||
          !(await this.checkPermissions())
        )
          return;
        await this.ensureChannels();
        if (generation !== this.reminderGeneration) return;
        const trigger: Notifications.NotificationTriggerInput =
          Platform.OS === 'ios'
            ? {
                type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                hour,
                minute,
                repeats: true,
                ...(cadence === 'weekly' ? { weekday } : {}),
              }
            : cadence === 'daily'
              ? {
                  type: Notifications.SchedulableTriggerInputTypes.DAILY,
                  hour,
                  minute,
                  channelId: REMINDER_CHANNEL,
                }
              : {
                  type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                  hour,
                  minute,
                  weekday,
                  channelId: REMINDER_CHANNEL,
                };
        await Notifications.scheduleNotificationAsync({
          identifier: REMINDER_ID,
          content: {
            title: AppConfig.strings.settings.notifications.reminderTitle,
            body: AppConfig.strings.settings.notifications.reminderBody,
            data: { type: 'journal_reminder' },
          },
          trigger,
        });
      });
    this.reminderQueue = pending.catch(() => undefined);
    return pending;
  }

  async sendImmediateTest(): Promise<void> {
    if (Platform.OS === 'web') return;
    await this.ensureChannels();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: AppConfig.strings.settings.notifications.testTitle,
        body: AppConfig.strings.settings.notifications.testBody,
      },
      trigger: Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL } : null,
    });
  }
}
export const notificationService = new NotificationService();
