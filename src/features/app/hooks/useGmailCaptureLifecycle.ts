import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { cancelGmailSync, syncGmailForWorkplace } from '@/src/services/email/gmailSyncService';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { gmailBinding } from '@/src/services/email/gmailConnection';
import { registerGmailBackgroundTask } from '@/src/services/email/gmailBackgroundTask';

/** Check connected mail only while the current workplace is open and the app is unlocked. */
export function useGmailCaptureLifecycle(): void {
  const { workplaceId, isSwitchingWorkplace } = useWorkplace();
  const { isAppCurrentlyLocked } = useAppLock();
  const { isAppReady, isDataHydrated } = useAppReady();
  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      isAppCurrentlyLocked ||
      isSwitchingWorkplace ||
      !isAppReady ||
      !isDataHydrated
    )
      return;
    const controller = new AbortController();
    if (gmailBinding(workplaceId)?.backgroundEnabled) {
      void registerGmailBackgroundTask().catch(() => {});
    }
    const check = () => {
      if (AppState.currentState !== 'active' || controller.signal.aborted) return;
      // Retry on the next foreground pass without logging provider data or credentials.
      void syncGmailForWorkplace(workplaceId, controller.signal).catch(() => {});
    };
    check();
    const interval = setInterval(check, 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') check();
      else cancelGmailSync(workplaceId);
    });
    return () => {
      controller.abort();
      cancelGmailSync(workplaceId);
      clearInterval(interval);
      subscription.remove();
    };
  }, [workplaceId, isAppCurrentlyLocked, isSwitchingWorkplace, isAppReady, isDataHydrated]);
}
