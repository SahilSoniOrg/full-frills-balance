import type { PendingSmsNotificationIntent } from '@/src/services/sms/SmsNotificationIntentStore';
import { WorkplaceId } from '@/src/types/ids';

export const mockSmsNotificationPush = jest.fn();
export let mockSmsNotificationReady = false;
export let mockSmsNotificationLocked = true;
export let mockSmsNotificationNavigationKey: string | undefined;
export let mockSmsNotificationWorkplace = 'workplace-b';
export let mockSmsNotificationPending: PendingSmsNotificationIntent | null;
export const mockSmsNotificationSwitch = jest.fn();

export function resetSmsNotificationLifecycleMocks() {
  jest.clearAllMocks();
  mockSmsNotificationReady = false;
  mockSmsNotificationLocked = true;
  mockSmsNotificationNavigationKey = undefined;
  mockSmsNotificationWorkplace = 'workplace-b';
  mockSmsNotificationPending = {
    responseId: 'response',
    receivedAt: 100,
    inboxRecordId: 'local-id',
    workplaceId: 'workplace-a',
    grouped: false,
  };
}

export function primeSmsNotificationReady() {
  mockSmsNotificationReady = true;
  mockSmsNotificationLocked = false;
  mockSmsNotificationNavigationKey = 'navigator';
}

export function setSmsNotificationReady(ready: boolean) {
  mockSmsNotificationReady = ready;
}

export function setSmsNotificationLocked(locked: boolean) {
  mockSmsNotificationLocked = locked;
}

export function setSmsNotificationNavigationKey(key: string | undefined) {
  mockSmsNotificationNavigationKey = key;
}

export function setSmsNotificationWorkplace(workplaceId: string) {
  mockSmsNotificationWorkplace = workplaceId;
}

export function mockTargetWorkplace(workplaceId: WorkplaceId) {
  const { smsNotificationIntentStore } = jest.requireMock<
    typeof import('@/src/services/sms/SmsNotificationIntentStore')
  >('@/src/services/sms/SmsNotificationIntentStore');
  jest.mocked(smsNotificationIntentStore.targetWorkplace).mockResolvedValue(workplaceId);
}
