import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  NotificationService,
  SMS_REVIEW_CHANNEL,
  SMS_REVIEW_NOTIFICATION_TYPE,
} from '../NotificationService';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { NONE: 2, DEFAULT: 5 },
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', DAILY: 'daily', WEEKLY: 'weekly' },
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
  getPresentedNotificationsAsync: jest.fn().mockResolvedValue([]),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getNotificationChannelAsync: jest.fn().mockResolvedValue({ importance: 5 }),
  setNotificationHandler: jest.fn(),
}));
const permissions = jest.mocked(Notifications.getPermissionsAsync);
const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
const intent = {
  type: SMS_REVIEW_NOTIFICATION_TYPE,
  inboxRecordId: 'local-inbox-id',
  workplaceId: 'local-workplace-id',
} as const;
const permission = (status: 'granted' | 'denied') =>
  ({
    status,
    granted: status === 'granted',
    canAskAgain: true,
    expires: 'never',
  }) as Notifications.NotificationPermissionsStatus;

const mockAndroidChannel = (
  overrides: Partial<Notifications.NotificationChannel> = {},
): Notifications.NotificationChannel => ({
  id: SMS_REVIEW_CHANNEL,
  name: 'SMS',
  importance: 5,
  bypassDnd: false,
  description: null,
  lightColor: '',
  lockscreenVisibility: 2,
  showBadge: false,
  sound: null,
  vibrationPattern: null,
  enableLights: false,
  enableVibrate: false,
  audioAttributes: {
    usage: 5,
    contentType: 4,
    flags: { enforceAudibility: false, requestHardwareAudioVideoSynchronization: false },
  },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions.mockResolvedValue(permission('granted'));
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([]);
  jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValue(mockAndroidChannel());
});

it('keeps a newer reminder when an older permission check completes late', async () => {
  let resolve!: (value: Notifications.NotificationPermissionsStatus) => void;
  let requested!: () => void;
  const started = new Promise<void>(done => {
    requested = done;
  });
  permissions.mockImplementationOnce(() => {
    requested();
    return new Promise(done => {
      resolve = done;
    });
  });
  const service = new NotificationService();
  const older = service.scheduleReminder('daily', 8, 15);
  await started;
  const newer = service.scheduleReminder('weekly', 19, 45, 5);
  resolve(permission('granted'));
  await Promise.all([older, newer]);
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(schedule).toHaveBeenCalledWith(
    expect.objectContaining({
      trigger: expect.objectContaining({ hour: 19, minute: 45, weekday: 5 }),
    }),
  );
});

it('uses a stable local identity and puts the Android channel in the trigger', async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    await new NotificationService().deliverSmsReview(
      'sms-review:local-inbox-id',
      'A transaction needs review.',
      intent,
    );
    expect(schedule).toHaveBeenCalledWith({
      identifier: 'sms-review:local-inbox-id',
      content: {
        title: 'Transaction needs your input',
        body: 'A transaction needs review.',
        data: intent,
      },
      trigger: { channelId: SMS_REVIEW_CHANNEL },
    });
    const data = schedule.mock.calls[0][0].content?.data;
    expect(data).not.toHaveProperty('sender');
    expect(data).not.toHaveProperty('rawBody');
    expect(data).not.toHaveProperty('amount');
  } finally {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  }
});

it('keeps delivery pending when permission or the SMS channel is blocked', async () => {
  permissions.mockResolvedValue(permission('denied'));
  expect(await new NotificationService().deliverSmsReview('sms-review:one', 'Review', intent)).toBe(
    false,
  );
  expect(schedule).not.toHaveBeenCalled();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

it('cancels only reminders when their setting changes', async () => {
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([
    {
      identifier: 'journal-reminder',
      content: {
        title: '',
        subtitle: null,
        body: '',
        categoryIdentifier: null,
        sound: null,
        data: { type: 'journal_reminder' },
      },
      trigger: null,
    },
    {
      identifier: 'sms-review:one',
      content: {
        title: '',
        subtitle: null,
        body: '',
        categoryIdentifier: null,
        sound: null,
        data: intent,
      },
      trigger: null,
    },
  ]);
  await new NotificationService().scheduleReminder('none', 8, 15);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('journal-reminder');
});
