import { AttachToJournalConfirmContent } from '@/src/components/transaction-capture/AttachToJournalConfirmContent';
import { buildAttachToJournalConfirmMessage } from '@/src/utils/attachToJournalConfirm';
import { transactionCaptureStrings as copy } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { analytics } from '@/src/services/analytics';
import { smsService } from '@/src/services/sms-service';
import type { WorkplaceId } from '@/src/types/ids';
import type { JournalLinkConfirmTarget } from '@/src/utils/attachToJournalConfirm';
import type { ResolvedHourCycle } from '@/src/utils/hourCycle';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';

/** Confirm, unlink inbox↔journal, restore the inbox item to Pending. */
export function showDetachFromJournalConfirm(args: {
  workplaceId: WorkplaceId;
  inboxId: string;
  channel: 'sms' | 'email' | 'voice';
  journal: JournalLinkConfirmTarget | null;
  journalLabel: string;
  hourCycle: ResolvedHourCycle;
  defaultCurrencyCode: string;
  onSuccess?: () => void;
}): void {
  const {
    workplaceId,
    inboxId,
    channel,
    journal,
    journalLabel,
    hourCycle,
    defaultCurrencyCode,
    onSuccess,
  } = args;

  const show = (inbox: Awaited<ReturnType<typeof smsService.findInboxRecord>>) => {
    confirm.show({
      title: copy.detachFromJournalConfirmTitle,
      message: buildAttachToJournalConfirmMessage({
        inbox,
        journal,
        journalLabel,
        hourCycle,
        mode: 'detach',
      }),
      messageContent: (
        <AttachToJournalConfirmContent
          inbox={inbox}
          journal={journal}
          journalLabel={journalLabel}
          hourCycle={hourCycle}
          defaultCurrencyCode={defaultCurrencyCode}
          mode="detach"
        />
      ),
      confirmText: copy.detachFromJournalConfirmAction,
      destructive: true,
      onConfirm: () => {
        analytics.trackFeatureUsage('sms', 'inbox_accept', {
          channel,
          action: 'detach_from_journal',
        });
        void smsService
          .unlinkFromJournal(workplaceId, inboxId)
          .then(() => {
            toast.success(
              channel === 'email'
                ? copy.detachFromJournalSuccessEmail
                : copy.detachFromJournalSuccessSms,
            );
            onSuccess?.();
          })
          .catch(error => {
            showErrorAlert(error, copy.detachFromJournalErrorTitle, true);
          });
      },
    });
  };

  void smsService.findInboxRecord(workplaceId, inboxId).then(show);
}
