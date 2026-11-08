import { gmailCaptureStrings as strings } from '@/src/constants/copy/domains/gmailCaptureStrings';
import { transactionCaptureStrings as captureStrings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import {
  GmailAccountBindingConflictError,
  connectGmailForWorkplace,
  disconnectGmailForWorkplace,
  setGmailAutomaticCapture,
  setGmailBackgroundEnabled,
} from '@/src/services/email/gmailConnection';
import { registerGmailBackgroundTask } from '@/src/services/email/gmailBackgroundTask';
import { cancelGmailSync, syncGmailForWorkplace } from '@/src/services/email/gmailSyncService';
import { useCaptureMutationRunner } from '@/src/features/settings/hooks/useCaptureMutationRunner';
import { analytics } from '@/src/services/analytics';
import type { WorkplaceId } from '@/src/types/ids';

type MutationRunner = ReturnType<typeof useCaptureMutationRunner>;

function gmailError(error: unknown): string {
  return error instanceof GmailAccountBindingConflictError
    ? strings.accountConflict
    : error instanceof Error
      ? error.message
      : strings.error;
}

export function useGmailCaptureActions({
  mutations,
  loading,
  connected,
}: {
  mutations: MutationRunner;
  loading: boolean;
  connected: boolean;
}) {
  return {
    onToggleGmail: () => {
      if (loading) return;
      mutations.confirmAndRun(
        {
          title: connected ? strings.disconnectTitle : strings.connectTitle,
          message: connected ? strings.disconnectMessage : strings.connectMessage,
          confirmText: connected ? strings.disconnectAction : strings.connectAction,
          cancelText: captureStrings.cancel,
        },
        async currentWorkplaceId => {
          if (connected) {
            cancelGmailSync(currentWorkplaceId);
            await disconnectGmailForWorkplace(currentWorkplaceId);
            analytics.trackFeatureUsage('gmail', 'disconnect');
          } else if (await connectGmailForWorkplace(currentWorkplaceId)) {
            analytics.trackFeatureUsage('gmail', 'connect');
            void syncGmailForWorkplace(currentWorkplaceId).catch(() => {});
          }
        },
        { errorMessage: gmailError },
      );
    },
    onReconnectGmail: () => {
      if (loading) return;
      void mutations.run(
        async currentWorkplaceId => {
          if (await connectGmailForWorkplace(currentWorkplaceId, true)) {
            analytics.trackFeatureUsage('gmail', 'reconnect');
            await syncGmailForWorkplace(currentWorkplaceId);
          }
        },
        { errorMessage: gmailError },
      );
    },
    onToggleGmailBackground: (enabled: boolean) => {
      if (loading || !connected) return;
      const apply = async (currentWorkplaceId: WorkplaceId) => {
        if (enabled && !(await registerGmailBackgroundTask()))
          throw new Error(strings.backgroundUnavailable);
        await setGmailBackgroundEnabled(currentWorkplaceId, enabled);
        analytics.trackFeatureUsage('gmail', 'toggle_background', { enabled });
        if (!enabled) cancelGmailSync(currentWorkplaceId);
      };
      if (enabled) {
        mutations.confirmAndRun(
          {
            title: strings.backgroundTitle,
            message: strings.backgroundMessage,
            confirmText: strings.backgroundAction,
            cancelText: captureStrings.cancel,
          },
          apply,
          {
            errorMessage: error =>
              error instanceof Error ? error.message : strings.backgroundUnavailable,
          },
        );
      } else {
        void mutations.run(apply, {
          errorMessage: error =>
            error instanceof Error ? error.message : strings.backgroundUnavailable,
        });
      }
    },
    onToggleGmailAutomaticCapture: (enabled: boolean) => {
      if (loading || !connected) return;
      const apply = async (currentWorkplaceId: WorkplaceId) => {
        if (!enabled) cancelGmailSync(currentWorkplaceId);
        await setGmailAutomaticCapture(currentWorkplaceId, enabled);
        analytics.trackFeatureUsage('gmail', 'toggle_automatic_capture', { enabled });
      };
      if (enabled) {
        mutations.confirmAndRun(
          {
            title: strings.automaticTitle,
            message: strings.automaticMessage,
            confirmText: strings.automaticAction,
            cancelText: captureStrings.cancel,
          },
          apply,
          {
            errorMessage: error =>
              error instanceof Error ? error.message : captureStrings.loadError,
          },
        );
      } else {
        void mutations.run(apply);
      }
    },
  };
}
