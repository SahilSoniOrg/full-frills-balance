import { useEffect, useState, useSyncExternalStore } from 'react';
import * as Notifications from 'expo-notifications';
import { router, useGlobalSearchParams, usePathname, useRootNavigationState } from 'expo-router';
import { AppState } from 'react-native';
import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { smsNotificationIntentStore } from '@/src/services/sms/SmsNotificationIntentStore';
import { smsReviewNotificationService } from '@/src/services/sms/SmsReviewNotificationService';
import { logger } from '@/src/utils/logger';

/** Mounted above launch gates, so cold-start responses cannot be lost. */
export function SmsNotificationResponseObserver() {
  useEffect(() => {
    const capture = (response: Notifications.NotificationResponse) =>
      smsNotificationIntentStore.capture(response);
    const subscription = Notifications.addNotificationResponseReceivedListener(capture);
    void Notifications.getLastNotificationResponseAsync()
      .then(response => {
        if (response) capture(response);
      })
      .catch(() => logger.warn('[SMS] Could not read notification response'));
    return () => subscription.remove();
  }, []);
  return null;
}

/** Mounted inside the unlocked Workplace shell, alongside the navigation stack. */
export function SmsNotificationNavigation() {
  const pending = useSyncExternalStore(
    smsNotificationIntentStore.subscribe,
    smsNotificationIntentStore.getSnapshot,
  );
  const navigation = useRootNavigationState();
  const { isAppReady, isDataHydrated } = useAppReady();
  const { isAppCurrentlyLocked } = useAppLock();
  const { workplaceId, setWorkplaceId } = useWorkplace();
  const pathname = usePathname();
  const { smsRecordId } = useGlobalSearchParams<{ smsRecordId?: string }>();
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => smsReviewNotificationService.observeForegroundChanges(), []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const foreground = !isAppCurrentlyLocked && appState === 'active';
    smsReviewNotificationService.setReviewVisible(
      foreground && pathname === '/sms-inbox',
      foreground && pathname === '/journal-entry' && typeof smsRecordId === 'string'
        ? smsRecordId
        : undefined,
    );
    void smsReviewNotificationService.refresh();
    return () => smsReviewNotificationService.setReviewVisible(false);
  }, [appState, isAppCurrentlyLocked, pathname, smsRecordId]);

  useEffect(() => {
    if (
      !pending ||
      !navigation?.key ||
      !isAppReady ||
      !isDataHydrated ||
      isAppCurrentlyLocked ||
      appState !== 'active'
    )
      return;
    let cancelled = false;
    void (async () => {
      const target = await smsNotificationIntentStore.targetWorkplace(pending, workplaceId);
      if (cancelled) return;
      if (target !== workplaceId) {
        await setWorkplaceId(target);
        return;
      }
      router.push({
        pathname: '/sms-inbox',
        params:
          pending.grouped || !pending.inboxRecordId
            ? {}
            : { reviewRecordId: pending.inboxRecordId },
      });
      smsNotificationIntentStore.complete(pending.responseId);
      await Notifications.clearLastNotificationResponseAsync();
    })().catch(() => logger.warn('[SMS] Review navigation remains pending'));
    return () => {
      cancelled = true;
    };
  }, [
    pending,
    navigation?.key,
    isAppReady,
    isDataHydrated,
    isAppCurrentlyLocked,
    appState,
    workplaceId,
    setWorkplaceId,
  ]);
  return null;
}
