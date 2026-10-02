import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SmsNotificationNavigation } from '../useSmsNotificationLifecycle';
import {
  smsNotificationIntentStore,
  PendingSmsNotificationIntent,
} from '@/src/services/sms/SmsNotificationIntentStore';
import { WorkplaceId } from '@/src/types/ids';

const mockPush = jest.fn();
let mockReady = false;
let mockLocked = true;
let mockNavigationKey: string | undefined;
let mockWorkplace = 'workplace-b';
let mockPending: PendingSmsNotificationIntent | null;
const mockSwitch = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  usePathname: () => '/',
  useGlobalSearchParams: () => ({}),
  useRootNavigationState: () => ({ key: mockNavigationKey }),
}));
jest.mock('expo-notifications', () => ({
  clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/contexts/app-shell/AppReadyProvider', () => ({
  useAppReady: () => ({ isAppReady: mockReady, isDataHydrated: mockReady }),
}));
jest.mock('@/src/contexts/app-shell/AppLockProvider', () => ({
  useAppLock: () => ({ isAppCurrentlyLocked: mockLocked }),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: mockWorkplace, setWorkplaceId: mockSwitch }),
}));
jest.mock('@/src/services/sms/SmsReviewNotificationService', () => ({
  smsReviewNotificationService: {
    observeForegroundChanges: () => () => {},
    setReviewVisible: jest.fn(),
    refresh: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/services/sms/SmsNotificationIntentStore', () => ({
  smsNotificationIntentStore: {
    subscribe: () => () => {},
    getSnapshot: () => mockPending,
    targetWorkplace: jest.fn(),
    complete: jest.fn(),
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  mockReady = false;
  mockLocked = true;
  mockNavigationKey = undefined;
  mockWorkplace = 'workplace-b';
  mockPending = {
    responseId: 'response',
    receivedAt: 100,
    inboxRecordId: 'local-id',
    workplaceId: 'workplace-a',
    grouped: false,
  };
  jest
    .mocked(smsNotificationIntentStore.targetWorkplace)
    .mockResolvedValue('workplace-b' as WorkplaceId);
});
it('retains a tap until launch, hydration, unlock, and the navigator are ready', async () => {
  const view = renderHook(() => SmsNotificationNavigation());
  await act(async () => {});
  expect(mockPush).not.toHaveBeenCalled();
  mockReady = true;
  view.rerender({});
  await act(async () => {});
  expect(mockPush).not.toHaveBeenCalled();
  mockNavigationKey = 'navigator';
  view.rerender({});
  await act(async () => {});
  expect(mockPush).not.toHaveBeenCalled();
  mockLocked = false;
  view.rerender({});
  await act(async () => {});
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/sms-inbox',
    params: { reviewRecordId: 'local-id' },
  });
  expect(smsNotificationIntentStore.complete).toHaveBeenCalledWith('response');
});
it('switches to the originating workplace before opening its review', async () => {
  mockReady = true;
  mockLocked = false;
  mockNavigationKey = 'navigator';
  jest
    .mocked(smsNotificationIntentStore.targetWorkplace)
    .mockResolvedValue('workplace-a' as WorkplaceId);
  const view = renderHook(() => SmsNotificationNavigation());
  await act(async () => {});
  expect(mockSwitch).toHaveBeenCalledWith('workplace-a');
  expect(mockPush).not.toHaveBeenCalled();
  expect(smsNotificationIntentStore.complete).not.toHaveBeenCalled();
  mockWorkplace = 'workplace-a';
  view.rerender({});
  await act(async () => {});
  expect(mockPush).toHaveBeenCalledTimes(1);
});
