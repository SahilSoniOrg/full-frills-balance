import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { logger } from '@/src/utils/logger';

export type NotificationCadence = 'none' | 'daily' | 'weekly';

class NotificationService {
    constructor() {
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

    async scheduleReminder(cadence: NotificationCadence, hour: number, minute: number): Promise<void> {
        if (Platform.OS === 'web') return;

        await this.cancelAll();

        if (cadence === 'none') {
            return;
        }

        const hasPermission = await this.checkPermissions();
        logger.info(`Notification permission status: ${hasPermission ? 'granted' : 'denied'}`);
        if (!hasPermission) {
            logger.warn('Cannot schedule notification: permissions not granted');
            return;
        }

        const title = "Time to Balance your Books!";
        const body = "Take a moment to add your recent transactions and keep your 'Safe to Spend' accurate.";
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
                calendarTrigger.weekday = 1; // Sunday
            }
            
            trigger = calendarTrigger;
        } else {
            // Android uses explicit 'daily' and 'weekly' types
            if (cadence === 'daily') {
                trigger = {
                    type: Notifications.SchedulableTriggerInputTypes.DAILY,
                    hour,
                    minute,
                } as Notifications.DailyTriggerInput;
            } else {
                trigger = {
                    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                    weekday: 1, // Sunday
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

        logger.info(`Scheduled ${cadence} reminder at ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);

        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        logger.info(`Total scheduled notifications now: ${scheduled.length}`);
    }

    async sendImmediateTest(): Promise<void> {
        if (Platform.OS === 'web') return;
        await Notifications.scheduleNotificationAsync({
            content: {
                title: "Test Reminder",
                body: "This is a test notification from Balance.",
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
