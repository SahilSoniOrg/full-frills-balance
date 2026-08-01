import { AppConfig } from '@/src/constants/app-config';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { confirm } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';

interface PlannedPaymentDetailsActionHandlers {
  handleEdit: () => void;
  handleDelete: () => Promise<void>;
  handlePostNow: () => Promise<void>;
  handleSkip: () => Promise<void>;
}

export function buildPlannedPaymentDetailsActions(
  item: PlannedPayment,
  handlers: PlannedPaymentDetailsActionHandlers,
  options: { isPrivacyMode?: boolean } = {},
) {
  const displayAmount = options.isPrivacyMode
    ? AppConfig.privacyMask
    : CurrencyFormatter.format(item.amount, item.currencyCode);

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
