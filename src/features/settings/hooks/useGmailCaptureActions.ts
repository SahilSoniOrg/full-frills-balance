import { gmailCaptureStrings } from '@/src/constants/copy/domains/gmailCaptureStrings';
import { transactionCaptureStrings } from '@/src/constants/copy/domains/transactionCaptureStrings';
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
import { toast } from '@/src/utils/alerts';
import type { WorkplaceId } from '@/src/types/ids';

type MutationRunner = ReturnType<typeof useCaptureMutationRunner>;

function gmailError(error: unknown): string {
  return error instanceof GmailAccountBindingConflictError
    ? gmailCaptureStrings.accountConflict
    : error instanceof Error
      ? error.message
      : gmailCaptureStrings.error;
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
          title: connected ? gmailCaptureStrings.disconnectTitle : gmailCaptureStrings.connectTitle,
          message: connected
            ? gmailCaptureStrings.disconnectMessage
            : gmailCaptureStrings.connectMessage,
          confirmText: connected
            ? gmailCaptureStrings.disconnectAction
            : gmailCaptureStrings.connectAction,
          cancelText: transactionCaptureStrings.cancel,
        },
        async currentWorkplaceId => {
          if (connected) {
            cancelGmailSync(currentWorkplaceId);
            const result = await disconnectGmailForWorkplace(currentWorkplaceId);
            analytics.trackFeatureUsage('gmail', 'disconnect');
            if (result === 'failed') toast.warning(gmailCaptureStrings.disconnectRevocationFailed);
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
          throw new Error(gmailCaptureStrings.backgroundUnavailable);
        await setGmailBackgroundEnabled(currentWorkplaceId, enabled);
        analytics.trackFeatureUsage('gmail', 'toggle_background', { enabled });
        if (!enabled) cancelGmailSync(currentWorkplaceId);
      };
      if (enabled) {
        mutations.confirmAndRun(
          {
            title: gmailCaptureStrings.backgroundTitle,
            message: gmailCaptureStrings.backgroundMessage,
            confirmText: gmailCaptureStrings.backgroundAction,
            cancelText: transactionCaptureStrings.cancel,
          },
          apply,
          {
            errorMessage: error =>
              error instanceof Error ? error.message : gmailCaptureStrings.backgroundUnavailable,
          },
        );
      } else {
        void mutations.run(apply, {
          errorMessage: error =>
            error instanceof Error ? error.message : gmailCaptureStrings.backgroundUnavailable,
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
            title: gmailCaptureStrings.automaticTitle,
            message: gmailCaptureStrings.automaticMessage,
            confirmText: gmailCaptureStrings.automaticAction,
            cancelText: transactionCaptureStrings.cancel,
          },
          apply,
          {
            errorMessage: error =>
              error instanceof Error ? error.message : transactionCaptureStrings.loadError,
          },
        );
      } else {
        void mutations.run(apply);
      }
    },
  };
}
