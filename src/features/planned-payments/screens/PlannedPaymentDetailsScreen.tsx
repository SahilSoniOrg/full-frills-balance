import {
  CommitmentDetailHeaderActions,
  type CommitmentMenuAction,
} from '@/src/components/shared/CommitmentDetailHeaderActions';
import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
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
    const actions: CommitmentMenuAction[] = vm.headerActions
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
    const detailChrome = buildDetailNavChrome({
      phase: vm.isLoading ? 'loading' : vm.isMissing ? 'missing' : 'ready',
      readyTitle: vm.nameText ?? vm.title ?? AppConfig.strings.plannedPayments.details.screenTitle,
      loadingTitle: AppConfig.strings.plannedPayments.details.screenTitle,
      onBack: vm.onBack,
      headerActions: actions.length ? (
        <CommitmentDetailHeaderActions actions={actions} />
      ) : undefined,
    });
    return applySelectionChrome(detailChrome, {
      active: vm.isSelectionModeActive,
      onExit: vm.exitSelectionMode,
    });
  }, [
    strings,
    vm.exitSelectionMode,
    vm.headerActions,
    vm.isLoading,
    vm.isMissing,
    vm.isSelectionModeActive,
    vm.onBack,
    vm.title,
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
