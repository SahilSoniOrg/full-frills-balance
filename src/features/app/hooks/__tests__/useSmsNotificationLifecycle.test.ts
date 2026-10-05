import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SmsNotificationNavigation } from '../useSmsNotificationLifecycle';
import { smsNotificationIntentStore } from '@/src/services/sms/SmsNotificationIntentStore';
import { WorkplaceId } from '@/src/types/ids';
import {
  mockSmsNotificationNavigationKey,
  mockSmsNotificationPending,
  mockSmsNotificationPush,
  mockSmsNotificationReady,
  mockSmsNotificationLocked,
  mockSmsNotificationSwitch,
  mockSmsNotificationWorkplace,
  mockTargetWorkplace,
  primeSmsNotificationReady,
  resetSmsNotificationLifecycleMocks,
  setSmsNotificationLocked,
  setSmsNotificationNavigationKey,
  setSmsNotificationReady,
  setSmsNotificationWorkplace,
} from './useSmsNotificationLifecycle.test.helpers';

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockSmsNotificationPush(...args) },
  usePathname: () => '/',
  useGlobalSearchParams: () => ({}),
  useRootNavigationState: () => ({ key: mockSmsNotificationNavigationKey }),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/contexts/app-shell/AppReadyProvider', () => ({
  useAppReady: () => ({
    isAppReady: mockSmsNotificationReady,
    isDataHydrated: mockSmsNotificationReady,
  }),
}));
jest.mock('@/src/contexts/app-shell/AppLockProvider', () => ({
  useAppLock: () => ({ isAppCurrentlyLocked: mockSmsNotificationLocked }),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    workplaceId: mockSmsNotificationWorkplace,
    setWorkplaceId: mockSmsNotificationSwitch,
  }),
}));
jest.mock('@/src/services/sms/SmsReviewNotificationService', () => ({
  smsReviewNotificationService: {
    observeForegroundChanges: () => () => {},
    refresh: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/services/sms/SmsNotificationIntentStore', () => ({
  smsNotificationIntentStore: {
    subscribe: () => () => {},
    getSnapshot: () => mockSmsNotificationPending,
    targetWorkplace: jest.fn(),
    complete: jest.fn(),
  },
}));

beforeEach(() => {
  resetSmsNotificationLifecycleMocks();
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  mockTargetWorkplace('workplace-b' as WorkplaceId);
});

it('retains a tap until launch, hydration, unlock, and the navigator are ready', async () => {
  const view = renderHook(() => SmsNotificationNavigation());
  await act(async () => {});
  expect(mockSmsNotificationPush).not.toHaveBeenCalled();
  setSmsNotificationReady(true);
  view.rerender({});
  await act(async () => {});
  expect(mockSmsNotificationPush).not.toHaveBeenCalled();
  setSmsNotificationNavigationKey('navigator');
  view.rerender({});
  await act(async () => {});
  expect(mockSmsNotificationPush).not.toHaveBeenCalled();
  setSmsNotificationLocked(false);
  view.rerender({});
  await act(async () => {});
  expect(mockSmsNotificationPush).toHaveBeenCalledWith({
    pathname: '/sms-inbox',
    params: { reviewRecordId: 'local-id' },
  });
  expect(smsNotificationIntentStore.complete).toHaveBeenCalledWith('response');
});

it('switches to the originating workplace before opening its review', async () => {
  primeSmsNotificationReady();
  mockTargetWorkplace('workplace-a' as WorkplaceId);
  const view = renderHook(() => SmsNotificationNavigation());
  await act(async () => {});
  expect(mockSmsNotificationSwitch).toHaveBeenCalledWith('workplace-a');
  expect(mockSmsNotificationPush).not.toHaveBeenCalled();
  expect(smsNotificationIntentStore.complete).not.toHaveBeenCalled();
  setSmsNotificationWorkplace('workplace-a');
  view.rerender({});
  await act(async () => {});
  expect(mockSmsNotificationPush).toHaveBeenCalledTimes(1);
});
