import type { PlannedOccurrenceViewModel } from '@/src/features/dashboard';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo } from 'react';
import { useJournalListViewModel } from './useJournalListViewModel';

/**
 * Helper hook that encapsulates the common pattern of using JournalListViewModel
 * and mapping its props to JournalListView component.
 *
 * Eliminates duplication between Dashboard and Journal screens.
 */
export function useJournalListScreen(
  config: Parameters<typeof useJournalListViewModel>[0],
  workplaceId: WorkplaceId,
) {
  const vm = useJournalListViewModel(config, workplaceId);

  const onPlannedJournalPress = useCallback(
    async (item: PlannedOccurrenceViewModel) => {
      const sourceAcc = item.accounts.find(a => a.role === 'SOURCE');
      const destAcc = item.accounts.find(a => a.role === 'DESTINATION');

      let type: 'expense' | 'income' | 'transfer' = 'expense';
      if (destAcc?.accountType === 'LIABILITY' || destAcc?.accountType === 'ASSET') {
        type = 'transfer';
      } else if (sourceAcc?.accountType === 'INCOME') {
        type = 'income';
      } else if (destAcc?.accountType === 'EXPENSE') {
        type = 'expense';
      } else {
        type = (String(item.displayType).toLowerCase() || 'expense') as
          'expense' | 'income' | 'transfer';
      }

      const displayAmount = CurrencyFormatter.format(item.amount, item.currencyCode);
      const displayTitle = item.title;
      const isSimulated = item.origin === 'SIMULATED_LIABILITY';

      const primaryLabel = type === 'income' ? 'Receive' : type === 'transfer' ? 'Transfer' : 'Pay';
      const dialogTitle =
        type === 'income'
          ? 'Record Income'
          : type === 'transfer'
            ? 'Record Transfer'
            : 'Record Payment';

      if (!isSimulated && item.origin === 'PLANNED_JOURNAL' && item.plannedPaymentId) {
        const plannedPaymentId = item.plannedPaymentId as PlannedPaymentId;
        confirm.show({
          title: dialogTitle,
          message: `Do you want to record a payment of ${displayAmount} for ${displayTitle}?`,
          confirmText: primaryLabel,
          cancelText: 'Skip',
          destructiveCancel: true,
          onConfirm: async () => {
            try {
              const pp = await plannedPaymentRepository.find(workplaceId, plannedPaymentId);
              if (pp) {
                await plannedPaymentService.postOccurrence(workplaceId, pp, item.occurrenceDate);
                toast.success('Payment recorded successfully');
              } else {
                toast.error('Planned payment details not found');
              }
            } catch (err) {
              showErrorAlert(err);
            }
          },
          onCancel: async () => {
            confirm.show({
              title: 'Skip Occurrence',
              message: `Are you sure you want to skip the occurrence for ${displayTitle}?`,
              confirmText: 'Skip',
              cancelText: 'Cancel',
              destructive: true,
              onConfirm: async () => {
                try {
                  const pp = await plannedPaymentRepository.find(workplaceId, plannedPaymentId);
                  if (pp) {
                    await plannedPaymentService.skipOccurrence(
                      workplaceId,
                      pp,
                      item.occurrenceDate,
                    );
                    toast.success('Payment skipped successfully');
                  } else {
                    toast.error('Planned payment details not found');
                  }
                } catch (err) {
                  showErrorAlert(err);
                }
              },
              onCancel: () => {},
              onClose: () => {},
            });
          },
          onClose: () => {},
        });
      } else {
        confirm.show({
          title: dialogTitle,
          message: `Do you want to record a payment of ${displayAmount} for ${displayTitle}?`,
          confirmText: primaryLabel,
          cancelText: 'Cancel',
          onConfirm: () => {
            AppNavigation.toSimpleJournalEntry(type, {
              sourceAccountId: sourceAcc?.id,
              destinationAccountId: destAcc?.id,
              amount: String(item.amount),
              journalId: item.origin === 'PLANNED_JOURNAL' ? item.journalId : undefined,
            });
          },
          onCancel: () => {},
          onClose: () => {},
        });
      }
    },
    [workplaceId],
  );

  const listViewProps = useMemo(
    () => ({
      items: vm.items,
      isLoading: vm.isLoading,
      isLoadingMore: vm.isLoadingMore,
      loadingText: vm.loadingText,
      loadingMoreText: vm.loadingMoreText,
      emptyTitle: vm.emptyState.title,
      emptySubtitle: vm.emptyState.subtitle,
      onEndReached: vm.onEndReached,
      plannedJournals: vm.plannedJournals,
      onPlannedJournalPress,
      datePicker: {
        visible: vm.isDatePickerVisible,
        onClose: vm.hideDatePicker,
        currentFilter: vm.periodFilter,
        onSelect: vm.onDateSelect,
      },
      selection: {
        selectedIds: vm.selectedIds,
        isSelectionModeActive: vm.isSelectionModeActive,
        onLongPressItem: vm.onLongPressItem,
        toggleSelection: vm.toggleSelection,
        selectAll: vm.selectAll,
        clearItems: vm.clearItems,
        exitSelectionMode: vm.exitSelectionMode,
        onShareSelected: vm.onShareSelected,
      },
    }),
    [
      vm.items,
      vm.isLoading,
      vm.isLoadingMore,
      vm.loadingText,
      vm.loadingMoreText,
      vm.emptyState.title,
      vm.emptyState.subtitle,
      vm.onEndReached,
      vm.plannedJournals,
      onPlannedJournalPress,
      vm.isDatePickerVisible,
      vm.hideDatePicker,
      vm.periodFilter,
      vm.onDateSelect,
      vm.selectedIds,
      vm.isSelectionModeActive,
      vm.onLongPressItem,
      vm.toggleSelection,
      vm.selectAll,
      vm.clearItems,
      vm.exitSelectionMode,
      vm.onShareSelected,
    ],
  );

  return {
    listViewProps,
    vm,
  };
}
