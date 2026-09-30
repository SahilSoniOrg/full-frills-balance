import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { AppConfig } from '@/src/constants/app-config';
import { confirm } from '@/src/utils/alerts';
import { formatDate } from '@/src/utils/dateUtils';
import { PlainPlannedPayment } from '@/src/types/plainDtos';
import type { JournalId } from '@/src/types/ids';

export function resolvePlannedPaymentActionTarget(item: {
  status: PlainPlannedPayment['status'];
  nextDueOccurrence?: number;
  outstandingJournalId?: string;
}): { occurrenceDate: number; journalId?: JournalId } | undefined {
  if (item.status === 'PAUSED' || item.nextDueOccurrence === undefined) return undefined;
  return {
    occurrenceDate: item.nextDueOccurrence,
    ...(item.outstandingJournalId ? { journalId: item.outstandingJournalId as JournalId } : {}),
  };
}

interface PlannedPaymentDetailsActionHandlers {
  handleEdit: () => void;
  handleDelete: () => Promise<void>;
  handlePostNow: () => Promise<void>;
  handleSkip: () => Promise<void>;
}

export function buildPlannedPaymentDetailsActions(
  item: PlainPlannedPayment & { nextDueOccurrence?: number; outstandingJournalId?: string },
  handlers: PlannedPaymentDetailsActionHandlers,
  options: { isPrivacyMode?: boolean } = {},
) {
  const displayAmount = formatMoneyAmount(
    item.amount,
    item.currencyCode,
    options.isPrivacyMode ?? false,
  );

  const headerActions = {
    onEdit: handlers.handleEdit,
    onDelete: () => {
      confirm.show({
        title: AppConfig.strings.plannedPayments.details.deleteConfirmTitle,
        message: AppConfig.strings.plannedPayments.details.deleteConfirmMessage,
        destructive: true,
        confirmText: AppConfig.strings.common.delete,
        onConfirm: handlers.handleDelete,
      });
    },
  };

  const target = resolvePlannedPaymentActionTarget(item);
  const occurrenceLabel = target ? formatDate(target.occurrenceDate) : '';
  const onPost = !target
    ? undefined
    : () => {
        confirm.show({
          title: AppConfig.strings.plannedPayments.details.postNowTitle,
          message: AppConfig.strings.plannedPayments.details.postNowMessage(
            occurrenceLabel,
            displayAmount,
          ),
          onConfirm: handlers.handlePostNow,
        });
      };

  const onSkip = !target
    ? undefined
    : () => {
        confirm.show({
          title: AppConfig.strings.plannedPayments.details.skipTitle,
          message: AppConfig.strings.plannedPayments.details.skipMessage(occurrenceLabel),
          confirmText: AppConfig.strings.plannedPayments.details.skipConfirm,
          destructive: true,
          onConfirm: handlers.handleSkip,
        });
      };

  return { headerActions, onPost, onSkip };
}
