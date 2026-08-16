import * as Notifications from 'expo-notifications';
import { NotificationService } from '../NotificationService';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5 },
  SchedulableTriggerInputTypes: {
    CALENDAR: 'calendar',
    DAILY: 'daily',
    WEEKLY: 'weekly',
  },
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const cancelScheduled = Notifications.cancelAllScheduledNotificationsAsync as jest.Mock;
const getPermissions = Notifications.getPermissionsAsync as jest.Mock;
const scheduleNotification = Notifications.scheduleNotificationAsync as jest.Mock;

describe('NotificationService reminder ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cancelScheduled.mockResolvedValue(undefined);
    getPermissions.mockResolvedValue({ status: 'granted' });
    scheduleNotification.mockResolvedValue('notification-id');
  });

  it('does not let a stale permission result schedule over a newer reminder', async () => {
    const firstPermission = deferred<{ status: 'granted' }>();
    const firstPermissionRequested = deferred<void>();
    getPermissions
      .mockImplementationOnce(() => {
        firstPermissionRequested.resolve(undefined);
        return firstPermission.promise;
      })
      .mockResolvedValueOnce({ status: 'granted' });
    const service = new NotificationService();

    const older = service.scheduleReminder('daily', 8, 15);
    await firstPermissionRequested.promise;

    const newer = service.scheduleReminder('weekly', 19, 45, 5);
    firstPermission.resolve({ status: 'granted' });
    await Promise.all([older, newer]);

    expect(scheduleNotification).toHaveBeenCalledTimes(1);
    expect(scheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ hour: 19, minute: 45, weekday: 5 }),
      }),
    );
  });

  it('lets a newer cancellation win over a schedule already in flight', async () => {
    const inFlightSchedule = deferred<string>();
    const scheduleStarted = deferred<void>();
    scheduleNotification.mockImplementationOnce(() => {
      scheduleStarted.resolve(undefined);
      return inFlightSchedule.promise;
    });
    const service = new NotificationService();

    const older = service.scheduleReminder('daily', 8, 15);
    await scheduleStarted.promise;

    const newer = service.cancelAll();
    inFlightSchedule.resolve('old-notification');
    await Promise.all([older, newer]);

    expect(cancelScheduled).toHaveBeenCalledTimes(2);
    expect(scheduleNotification.mock.invocationCallOrder[0]).toBeLessThan(
      cancelScheduled.mock.invocationCallOrder[1],
    );
  });
});
