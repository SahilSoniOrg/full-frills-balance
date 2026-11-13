import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { preferences } from '@/src/services/preferences';
import { gmailBinding } from './gmailConnection';
import { cancelGmailSync, syncGmailForWorkplace } from './gmailSyncService';
import { storage } from '@/src/utils/storage';
import { DEVICE_PREFERENCES_KEY } from '@/src/services/preferences/deviceTypes';
import { safeParseJSON } from '@/src/utils/serialization';
import { analytics } from '@/src/services/analytics';
import { POSTHOG_FEATURE_FLAGS } from '@/src/services/analytics/featureFlags';

const GMAIL_BACKGROUND_TASK = 'gmail-capture-background';

// Defined at bundle load so an OS-launched headless task can find its handler.
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(GMAIL_BACKGROUND_TASK)) {
  TaskManager.defineTask(GMAIL_BACKGROUND_TASK, async ({ error }) => {
    if (error) return BackgroundTask.BackgroundTaskResult.Failed;
    try {
      await preferences.loadPreferences();
      preferences.device.reload();
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
    const device = preferences.device.getSnapshot();
    const workplaceId = device.activeWorkplaceId;
    const isGmailCaptureEnabled = () =>
      analytics.isFeatureFlagEnabledFromLastFetch(
        POSTHOG_FEATURE_FLAGS.gmailCaptureSettings,
        device.anonymizedId,
      );
    // Do not access the mailbox in the background while app lock is enabled.
    if (
      !isGmailCaptureEnabled() ||
      !device.deviceRegistered ||
      device.isAppLockEnabled ||
      !workplaceId ||
      !gmailBinding(workplaceId)?.backgroundEnabled
    )
      return BackgroundTask.BackgroundTaskResult.Success;

    const controller = new AbortController();
    const shouldContinue = () => {
      const raw = storage.getString(DEVICE_PREFERENCES_KEY);
      const current = raw ? safeParseJSON<unknown>(raw, null) : null;
      if (!current || typeof current !== 'object' || Array.isArray(current)) return false;
      const value = current as Record<string, unknown>;
      return (
        isGmailCaptureEnabled() &&
        value.deviceRegistered === true &&
        value.isAppLockEnabled === false &&
        value.activeWorkplaceId === workplaceId &&
        gmailBinding(workplaceId)?.backgroundEnabled === true
      );
    };
    const stop = () => {
      controller.abort();
      cancelGmailSync(workplaceId);
    };
    const lockSubscription = preferences.device.observe('isAppLockEnabled').subscribe(value => {
      if (value) stop();
    });
    const workplaceSubscription = preferences.device
      .observe('activeWorkplaceId')
      .subscribe(value => {
        if (value !== workplaceId) stop();
      });
    let expiration: { remove: () => void } | undefined;
    try {
      expiration = Platform.OS === 'ios' ? BackgroundTask.addExpirationListener(stop) : undefined;
      await syncGmailForWorkplace(
        workplaceId,
        controller.signal,
        shouldContinue,
        device.anonymizedId,
      );
      return controller.signal.aborted
        ? BackgroundTask.BackgroundTaskResult.Failed
        : BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      // Never write mailbox content or credentials to the log.
      return BackgroundTask.BackgroundTaskResult.Failed;
    } finally {
      lockSubscription.unsubscribe();
      workplaceSubscription.unsubscribe();
      expiration?.remove();
    }
  });
}

/** OS scheduling is opportunistic; foreground checks remain available if unavailable. */
export async function registerGmailBackgroundTask(): Promise<boolean> {
  const isGmailCaptureEnabled = () =>
    analytics.isFeatureFlagEnabledFromLastFetch(POSTHOG_FEATURE_FLAGS.gmailCaptureSettings);
  if (Platform.OS === 'web' || !isGmailCaptureEnabled()) return false;
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available)
    return false;
  if (!isGmailCaptureEnabled()) return false;
  await BackgroundTask.registerTaskAsync(GMAIL_BACKGROUND_TASK, { minimumInterval: 15 });
  if (!isGmailCaptureEnabled()) {
    await unregisterGmailBackgroundTask();
    return false;
  }
  return TaskManager.isTaskRegisteredAsync(GMAIL_BACKGROUND_TASK);
}

export async function unregisterGmailBackgroundTask(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (await TaskManager.isTaskRegisteredAsync(GMAIL_BACKGROUND_TASK))
    await BackgroundTask.unregisterTaskAsync(GMAIL_BACKGROUND_TASK);
}
