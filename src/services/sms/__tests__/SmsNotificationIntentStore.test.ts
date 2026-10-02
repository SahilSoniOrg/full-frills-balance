import type { NotificationResponse } from 'expo-notifications';
import { SmsNotificationIntentStore } from '../SmsNotificationIntentStore';
import { WorkplaceId } from '@/src/types/ids';
import { storage } from '@/src/utils/storage';

jest.mock('@/src/utils/storage', () => {
  const memory = new Map<string, string>();
  return {
    storage: {
      getString: (key: string) => memory.get(key),
      set: (key: string, value: string) => memory.set(key, value),
      remove: (key: string) => memory.delete(key),
      clearAll: () => memory.clear(),
    },
  };
});
jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: { find: jest.fn().mockResolvedValue(null) },
}));
const response = (
  date = 100,
  data: Record<string, unknown> = {},
  action = 'expo.modules.notifications.actions.DEFAULT',
): NotificationResponse => ({
  actionIdentifier: action,
  notification: {
    date,
    request: {
      identifier: 'stable-id',
      trigger: null,
      content: {
        title: null,
        subtitle: null,
        body: null,
        sound: null,
        categoryIdentifier: null,
        data: {
          type: 'sms_transaction_needs_review',
          inboxRecordId: 'local-id',
          workplaceId: 'workplace-a',
          ...data,
        },
      },
    },
  },
});
beforeEach(() => storage.clearAll());

it('persists a cold-start tap until it is handled and ignores duplicate listener/initial responses', () => {
  const store = new SmsNotificationIntentStore();
  const notify = jest.fn();
  store.subscribe(notify);
  store.capture(response());
  store.capture(response());
  expect(notify).toHaveBeenCalledTimes(1);
  const restarted = new SmsNotificationIntentStore();
  expect(restarted.getSnapshot()?.inboxRecordId).toBe('local-id');
  restarted.complete(restarted.getSnapshot()!.responseId);
  restarted.capture(response());
  expect(restarted.getSnapshot()).toBeNull();
});
it('keeps a newer tap when an older initial response arrives late', () => {
  const store = new SmsNotificationIntentStore();
  store.capture(response(200));
  store.capture(response(100));
  expect(store.getSnapshot()?.receivedAt).toBe(200);
});
it('does not retain SMS text or accept unrelated actions', () => {
  const store = new SmsNotificationIntentStore();
  store.capture(response(100, {}, 'dismiss'));
  expect(store.getSnapshot()).toBeNull();
  store.capture(response(100, { rawBody: 'private', sender: 'private', amount: 500 }));
  expect(JSON.stringify(store.getSnapshot())).not.toContain('private');
  expect(store.getSnapshot()).not.toHaveProperty('amount');
});
it('falls back to the current shared feed when the originating workplace was deleted', async () => {
  const store = new SmsNotificationIntentStore();
  store.capture(response());
  expect(await store.targetWorkplace(store.getSnapshot()!, 'current' as WorkplaceId)).toBe(
    'current',
  );
});
