import { AppConfig } from '@/src/constants';
import { logger } from '@/src/utils/logger';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type NotificationCadence = 'none' | 'daily' | 'weekly';

/**
 * OS notification scheduling only.
 * Safe-to-Spend lives at `@/src/services/simulation/SafeToSpendReadModel`.
 * Insights live at `@/src/services/insight/InsightService`.
 */
export class NotificationService {
  private reminderGeneration = 0;
  private reminderQueue: Promise<void> = Promise.resolve();

  constructor() {
    if (Platform.OS === 'web') return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  }

  async checkPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  }

  cancelAll(): Promise<void> {
    if (Platform.OS === 'web') return Promise.resolve();

    const generation = ++this.reminderGeneration;
    return this.enqueueReminderUpdate(async () => {
      if (!this.ownsReminderGeneration(generation)) return;
      await this.cancelScheduledNotifications();
    });
  }

  private async cancelScheduledNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    logger.info('Cancelled all scheduled notifications');
  }

  scheduleReminder(
    cadence: NotificationCadence,
    hour: number,
    minute: number,
    weekday: number = 1,
  ): Promise<void> {
    if (Platform.OS === 'web') return Promise.resolve();

    const generation = ++this.reminderGeneration;
    return this.enqueueReminderUpdate(() =>
      this.applyReminderSchedule(generation, cadence, hour, minute, weekday),
    );
  }

  private enqueueReminderUpdate(operation: () => Promise<void>): Promise<void> {
    const pending = this.reminderQueue.catch(() => undefined).then(operation);
    this.reminderQueue = pending.catch(() => undefined);
    return pending;
  }

  private ownsReminderGeneration(generation: number): boolean {
    return generation === this.reminderGeneration;
  }

  private async applyReminderSchedule(
    generation: number,
    cadence: NotificationCadence,
    hour: number,
    minute: number,
    weekday: number,
  ): Promise<void> {
    if (!this.ownsReminderGeneration(generation)) return;

    await this.cancelScheduledNotifications();

    if (!this.ownsReminderGeneration(generation)) return;

    if (cadence === 'none') {
      return;
    }

    const hasPermission = await this.checkPermissions();
    if (!hasPermission) {
      logger.debug('Cannot schedule notification: permissions not granted');
      return;
    }

    if (!this.ownsReminderGeneration(generation)) return;

    const title = AppConfig.strings.settings.notifications.reminderTitle;
    const body = AppConfig.strings.settings.notifications.reminderBody;
    const channelId = 'default';

    let trigger: Notifications.NotificationTriggerInput = null;

    if (Platform.OS === 'ios') {
      const calendarTrigger: Notifications.CalendarTriggerInput = {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour,
        minute,
        repeats: true,
      };

      if (cadence === 'weekly') {
        calendarTrigger.weekday = weekday;
      }

      trigger = calendarTrigger;
    } else {
      if (cadence === 'daily') {
        trigger = {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        } as Notifications.DailyTriggerInput;
      } else {
        trigger = {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
        } as Notifications.WeeklyTriggerInput;
      }
    }

    const content: Notifications.NotificationContentInput = {
      title,
      body,
      ...(Platform.OS === 'android' ? { channelId } : {}),
    };

    await Notifications.scheduleNotificationAsync({
      content,
      trigger,
    });

    logger.info(
      `Scheduled ${cadence} reminder at ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} (weekday: ${weekday})`,
    );
  }

  async sendImmediateTest(): Promise<void> {
    if (Platform.OS === 'web') return;
    const content: Notifications.NotificationContentInput = {
      title: AppConfig.strings.settings.notifications.testTitle,
      body: AppConfig.strings.settings.notifications.testBody,
      ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
    };

    await Notifications.scheduleNotificationAsync({
      content,
      trigger: null,
    });
  }
}

export const notificationService = new NotificationService();
