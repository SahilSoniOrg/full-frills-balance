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

  async cancelAll(): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    logger.info('Cancelled all scheduled notifications');
  }

  async scheduleReminder(
    cadence: NotificationCadence,
    hour: number,
    minute: number,
    weekday: number = 1,
  ): Promise<void> {
    if (Platform.OS === 'web') return;

    await this.cancelAll();

    if (cadence === 'none') {
      return;
    }

    const hasPermission = await this.checkPermissions();
    if (!hasPermission) {
      logger.debug('Cannot schedule notification: permissions not granted');
      return;
    }

    const title = AppConfig.strings.settings.notifications.reminderTitle;
    const body = AppConfig.strings.settings.notifications.reminderBody;
    const channelId = 'default';

    let trigger: Notifications.NotificationTriggerInput = null;

    if (Platform.OS === 'ios') {
      const calendarTrigger: any = {
        type: 'calendar',
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

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        ...Platform.select({
          android: { channelId } as any,
          default: {},
        }),
      },
      trigger,
    });

    logger.info(
      `Scheduled ${cadence} reminder at ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} (weekday: ${weekday})`,
    );
  }

  async sendImmediateTest(): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: AppConfig.strings.settings.notifications.testTitle,
        body: AppConfig.strings.settings.notifications.testBody,
        ...Platform.select({
          android: { channelId: 'default' } as any,
          default: {},
        }),
      },
      trigger: null,
    });
  }
}

export const notificationService = new NotificationService();
