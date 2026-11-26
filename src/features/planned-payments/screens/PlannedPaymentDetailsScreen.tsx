import { buildListSelectionChrome } from '@/src/components/shared/buildSelectionChrome';
import {
  DetailHeaderMenuActions,
  type DetailMenuAction,
} from '@/src/components/shared/DetailHeaderMenuActions';
import { selectedPlannedPaymentTotal } from '../hooks/plannedPaymentDetailsPresentation';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { PlannedPaymentDetailsView } from '@/src/features/planned-payments/components/PlannedPaymentDetailsView';
import { usePlannedPaymentDetailsViewModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel';
import { PlannedPaymentStatus } from '@/src/types/enums';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

function PlannedPaymentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = usePlannedPaymentDetailsViewModel(id);
  const { outstandingJournalId, onOpenJournal } = vm;
  const strings = AppConfig.strings.commitmentsRedesign;
  const chrome = useMemo<ScreenNavChrome>(() => {
    const actions: DetailMenuAction[] = vm.headerActions
      ? [
          { label: strings.edit, onPress: vm.headerActions.onEdit, testID: 'edit-button' },
          ...(vm.onToggleStatus
            ? [
                {
                  label: vm.status === PlannedPaymentStatus.PAUSED ? strings.resume : strings.pause,
                  onPress: vm.onToggleStatus,
                },
              ]
            : []),
          ...(outstandingJournalId
            ? [
                {
                  label: strings.openPending,
                  onPress: () => onOpenJournal(outstandingJournalId),
                },
              ]
            : []),
          {
            label: strings.delete,
            onPress: vm.headerActions.onDelete,
            destructive: true,
            testID: 'delete-button',
          },
        ].map(action => ({ ...action, disabled: !!vm.pendingAction }))
      : [];
    const phase = vm.isLoading ? 'loading' : vm.isMissing ? 'missing' : 'ready';
    const detailChrome = buildDetailNavChrome({
      phase,
      readyTitle: vm.nameText ?? AppConfig.strings.plannedPayments.details.screenTitle,
      loadingTitle: AppConfig.strings.plannedPayments.details.screenTitle,
      onBack: vm.onBack,
      headerActions: actions.length ? <DetailHeaderMenuActions actions={actions} /> : undefined,
    });
    if (phase !== 'ready' || !vm.isSelectionModeActive) return detailChrome;
    const history = vm.history ?? [];
    const selectedTotal = selectedPlannedPaymentTotal(
      history,
      vm.selectedIds,
      vm.currencyCode,
      vm.reversalJournalIds,
    );
    return {
      ...detailChrome,
      selection: buildListSelectionChrome({
        selectedIds: vm.selectedIds,
        selectableIds: history.map(journal => journal.id),
        amountSummary: {
          label: AppConfig.strings.selection.paymentAmounts,
          ...selectedTotal,
        },
        itemTypeLabel: AppConfig.strings.selection.itemTypes.payment,
        selectAll: vm.selectAll,
        clearItems: vm.clearItems,
        exitSelectionMode: vm.exitSelectionMode,
        actions: vm.actions,
      }),
    };
  }, [
    strings,
    vm.exitSelectionMode,
    vm.selectAll,
    vm.clearItems,
    vm.actions,
    vm.history,
    vm.reversalJournalIds,
    vm.selectedIds,
    vm.currencyCode,
    vm.headerActions,
    vm.isLoading,
    vm.isMissing,
    vm.isSelectionModeActive,
    vm.onBack,
    vm.nameText,
    vm.status,
    vm.pendingAction,
    vm.onToggleStatus,
    outstandingJournalId,
    onOpenJournal,
  ]);
  return <PlannedPaymentDetailsView {...vm} chrome={chrome} />;
}
export default withPrivacyScope(PlannedPaymentDetailsScreen);
