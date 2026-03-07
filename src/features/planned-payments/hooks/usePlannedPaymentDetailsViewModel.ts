import { AppConfig } from '@/src/constants';
import { useAccount } from '@/src/features/accounts';
import { usePlannedPaymentDetails } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetails';
import { useTheme } from '@/src/hooks/use-theme';
import { JournalDisplayType } from '@/src/types/domain';
import { confirm } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';

export function usePlannedPaymentDetailsViewModel(id: string) {
    const { theme } = useTheme();
    const {
        item,
        history,
        isLoading,
        handleEdit,
        handleDelete,
        handleToggleStatus,
        handlePostNow,
        handleSkip,
    } = usePlannedPaymentDetails(id);

    const { account: fromAccount } = useAccount(item?.fromAccountId || null);
    const { account: toAccount } = useAccount(item?.toAccountId || null);

    const isMissing = !isLoading && !item;

    return useMemo(() => {
        if (!item) {
            return {
                theme,
                isLoading,
                isMissing: true,
                onBack: () => AppNavigation.back(),
            } as any;
        }

        const isIncome = item.amount > 0 && fromAccount?.accountType === 'INCOME';
        const isTransfer = !!item.toAccountId && toAccount?.accountType !== 'EXPENSE' && toAccount?.accountType !== 'INCOME';
        const displayType = isTransfer ? JournalDisplayType.TRANSFER : (isIncome ? JournalDisplayType.INCOME : JournalDisplayType.EXPENSE);

        const presentation = journalPresenter.getPresentation(displayType);
        const typeColorKey = presentation.colorKey as string;
        const typeLabel = presentation.label;

        // Interval label
        const n = item.intervalN;
        const type = item.intervalType;

        let baseLabel = '';
        if (n === 1) {
            switch (type) {
                case 'DAILY': baseLabel = AppConfig.strings.plannedPayments.everyDay; break;
                case 'WEEKLY': baseLabel = AppConfig.strings.plannedPayments.everyWeek; break;
                case 'MONTHLY': baseLabel = AppConfig.strings.plannedPayments.everyMonth; break;
                case 'YEARLY': baseLabel = AppConfig.strings.plannedPayments.everyYear; break;
            }
        } else {
            baseLabel = AppConfig.strings.plannedPayments.everyN(n, type.toLowerCase());
        }

        let detailLabel = '';
        if (type === 'WEEKLY' && item.recurrenceDay !== undefined && item.recurrenceDay !== null) {
            const days = AppConfig.strings.plannedPayments.dayNames;
            detailLabel = ` on ${days[item.recurrenceDay]}`;
        } else if (type === 'MONTHLY' && item.recurrenceDay !== undefined && item.recurrenceDay !== null) {
            detailLabel = ` on day ${item.recurrenceDay}`;
        } else if (type === 'YEARLY') {
            const months = AppConfig.strings.plannedPayments.monthNames;
            const monthStr = item.recurrenceMonth ? months[item.recurrenceMonth - 1] : '';
            const dayStr = item.recurrenceDay ? ` day ${item.recurrenceDay}` : '';
            if (monthStr || dayStr) {
                detailLabel = ` on ${monthStr}${dayStr}`;
            }
        }

        const intervalLabel = `${baseLabel}${detailLabel}`;

        const headerActions = {
            onEdit: handleEdit,
            onDelete: () => {
                confirm.show({
                    title: AppConfig.strings.plannedPayments.details.deleteConfirmTitle,
                    message: AppConfig.strings.plannedPayments.details.deleteConfirmMessage,
                    destructive: true,
                    confirmText: AppConfig.strings.common.delete,
                    onConfirm: handleDelete,
                });
            },
        };

        const onPost = () => {
            confirm.show({
                title: AppConfig.strings.plannedPayments.details.postNowTitle,
                message: `This will post the upcoming instance for ${CurrencyFormatter.format(item.amount, item.currencyCode)} and advance the schedule to the next occurrence.`,
                onConfirm: handlePostNow,
            });
        };

        const onSkip = () => {
            confirm.show({
                title: AppConfig.strings.plannedPayments.details.skipTitle,
                message: `This will skip the upcoming instance on ${new Date(item.nextOccurrence).toLocaleDateString()} and advance the schedule without creating a transaction.`,
                confirmText: AppConfig.strings.plannedPayments.details.skipConfirm,
                destructive: true,
                onConfirm: handleSkip,
            });
        };

        const onToggleStatus = handleToggleStatus;

        return {
            theme,
            isLoading,
            isMissing,
            onBack: () => AppNavigation.back(),

            // Core Details
            title: AppConfig.strings.plannedPayments.title,
            amountText: CurrencyFormatter.format(item.amount, item.currencyCode),
            nameText: item.name,
            statusLabel: item.status,
            statusVariant: item.status === 'ACTIVE' ? 'success' : 'default',
            typeLabel,
            typeColorKey,
            iconName: displayType === JournalDisplayType.INCOME ? 'arrowUp' : (displayType === JournalDisplayType.EXPENSE ? 'arrowDown' : 'swapHorizontal'),
            displayType,

            // Recurrence Details
            intervalLabel,
            nextOccurrenceText: new Date(item.nextOccurrence).toLocaleDateString(),
            isAutoPost: item.isAutoPost,

            // Account Flow
            fromAccount,
            toAccount,

            // History
            history,

            rawAmount: item.amount,
            rawName: item.name,

            // Actions
            headerActions,
            onPost,
            onSkip,
            onToggleStatus,
        };
    }, [item, history, isLoading, theme, fromAccount, toAccount, handleEdit, handleDelete, handleToggleStatus, handlePostNow, handleSkip, isMissing]);
}

export type PlannedPaymentDetailsViewModel = ReturnType<typeof usePlannedPaymentDetailsViewModel>;
