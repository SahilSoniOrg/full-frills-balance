import { formatMoneyAmount } from '@/src/utils/moneyFormat';
import { AppConfig } from '@/src/constants/app-config';
import { confirm } from '@/src/utils/alerts';
import { PlainPlannedPayment } from '@/src/types/domain';

interface PlannedPaymentDetailsActionHandlers {
  handleEdit: () => void;
  handleDelete: () => Promise<void>;
  handlePostNow: () => Promise<void>;
  handleSkip: () => Promise<void>;
}

export function buildPlannedPaymentDetailsActions(
  item: PlainPlannedPayment,
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

  const onPost = () => {
    confirm.show({
      title: AppConfig.strings.plannedPayments.details.postNowTitle,
      message: `This will post the upcoming instance for ${displayAmount} and advance the schedule to the next occurrence.`,
      onConfirm: handlers.handlePostNow,
    });
  };

  const onSkip = () => {
    confirm.show({
      title: AppConfig.strings.plannedPayments.details.skipTitle,
      message: `This will skip the upcoming instance on ${new Date(item.nextOccurrence).toLocaleDateString()} and advance the schedule without creating a transaction.`,
      confirmText: AppConfig.strings.plannedPayments.details.skipConfirm,
      destructive: true,
      onConfirm: handlers.handleSkip,
    });
  };

  return { headerActions, onPost, onSkip };
}
