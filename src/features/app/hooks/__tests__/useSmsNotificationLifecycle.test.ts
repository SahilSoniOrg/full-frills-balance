import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SmsNotificationNavigation } from '../useSmsNotificationLifecycle';
import { smsNotificationIntentStore } from '@/src/services/sms/SmsNotificationIntentStore';
import { smsReviewNotificationService } from '@/src/services/sms/SmsReviewNotificationService';
import { notificationService } from '@/src/services/notification/NotificationService';
import { WorkplaceId } from '@/src/types/ids';
import {
  mockSmsNotificationNavigationKey,
  mockSmsNotificationPending,
  mockSmsNotificationPush,
  mockSmsNotificationReady,
  mockSmsNotificationLocked,
  mockSmsNotificationSwitch,
  mockSmsNotificationWorkplace,
  mockSmsNotificationPathname,
  mockSmsNotificationRecordId,
  mockTargetWorkplace,
  primeSmsNotificationReady,
  resetSmsNotificationLifecycleMocks,
  setSmsNotificationLocked,
  setSmsNotificationNavigationKey,
  setSmsNotificationReady,
  setSmsNotificationWorkplace,
  setSmsNotificationRoute,
} from './useSmsNotificationLifecycle.test.helpers';

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockSmsNotificationPush(...args) },
  usePathname: () => mockSmsNotificationPathname,
  useGlobalSearchParams: () => ({ smsRecordId: mockSmsNotificationRecordId }),
  useRootNavigationState: () => ({ key: mockSmsNotificationNavigationKey }),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/services/notification/NotificationService', () => {
  let inboxVisible = false;
  let reviewedRecordId: string | undefined;
  return {
    notificationService: {
      setSmsReviewVisible: jest.fn((visible: boolean, recordId?: string) => {
        inboxVisible = visible;
        reviewedRecordId = recordId;
      }),
      isSmsReviewForegroundSuppressed: (recordId?: string) =>
        inboxVisible || (recordId !== undefined && recordId === reviewedRecordId),
    },
  };
});
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

it('refreshes only when navigation changes review suppression', async () => {
  // Keep response navigation gated while exercising foreground route changes.
  setSmsNotificationLocked(false);
  const view = renderHook(() => SmsNotificationNavigation());
  await act(async () => {});
  jest.mocked(smsReviewNotificationService.refresh).mockClear();

  for (const route of ['/accounts', '/account-details', '/journal-entry', '/journal-details']) {
    setSmsNotificationRoute(route);
    view.rerender({});
    await act(async () => {});
  }
  expect(smsReviewNotificationService.refresh).not.toHaveBeenCalled();

  setSmsNotificationRoute('/sms-inbox');
  view.rerender({});
  await act(async () => {});
  expect(notificationService.isSmsReviewForegroundSuppressed('review')).toBe(true);

  setSmsNotificationRoute('/journal-entry', 'review');
  view.rerender({});
  await act(async () => {});
  expect(notificationService.isSmsReviewForegroundSuppressed('review')).toBe(true);
  expect(notificationService.isSmsReviewForegroundSuppressed('other')).toBe(false);

  setSmsNotificationRoute('/journal-details');
  view.rerender({});
  await act(async () => {});
  expect(notificationService.isSmsReviewForegroundSuppressed('review')).toBe(false);
  expect(smsReviewNotificationService.refresh).toHaveBeenCalledTimes(3);
  view.unmount();
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
