import { ScreenHeaderActions } from '@/src/components/shared/ScreenHeaderActions';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { SmsRuleFormView } from '@/src/features/settings/components/SmsRuleFormView';
import { useSmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Icon } from '@/src/types/domainIcons';

export default function SmsRuleFormScreen() {
  const params = useLocalSearchParams<{
    id: string;
    senderMatch?: string;
    bodyMatch?: string;
    sourceAccountId?: AccountId;
    categoryAccountId?: AccountId;
  }>();
  const vm = useSmsRuleFormViewModel(params.id, {
    senderMatch: params.senderMatch,
    bodyMatch: params.bodyMatch,
    sourceAccountId: params.sourceAccountId,
    categoryAccountId: params.categoryAccountId,
  });
  const fingerprint = useMemo(
    () =>
      JSON.stringify({
        mode: vm.mode,
        legacySenderMatch: vm.legacySenderMatch,
        legacyBodyMatch: vm.legacyBodyMatch,
        senderContains: vm.senderContains,
        bodyContains: vm.bodyContains,
        merchantContains: vm.merchantContains,
        accountSourceContains: vm.accountSourceContains,
        direction: vm.direction,
        currencyCode: vm.currencyCode,
        amountOperator: vm.amountOperator,
        amountValue: vm.amountValue,
        amountSecondaryValue: vm.amountSecondaryValue,
        disposition: vm.disposition,
        priority: vm.priority,
        sourceAccountId: vm.sourceAccountId,
        categoryAccountId: vm.categoryAccountId,
        journalDescription: vm.journalDescription,
        isActive: vm.isActive,
      }),
    [
      vm.accountSourceContains,
      vm.amountOperator,
      vm.amountSecondaryValue,
      vm.amountValue,
      vm.bodyContains,
      vm.categoryAccountId,
      vm.currencyCode,
      vm.direction,
      vm.disposition,
      vm.isActive,
      vm.journalDescription,
      vm.legacyBodyMatch,
      vm.legacySenderMatch,
      vm.merchantContains,
      vm.mode,
      vm.priority,
      vm.senderContains,
      vm.sourceAccountId,
    ],
  );
  const guard = useConfirmUnsavedChanges({
    fingerprint,
    baselineReady: vm.isLoaded,
    disabled: vm.isSubmitting,
    title: 'Discard SMS rule changes?',
  });
  const { theme } = useTheme();

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: params.id ? 'Edit SMS Rule' : 'New SMS Rule',
      showBack: true,
      backIcon: Icon.Back,
      onBack: guard.onBack,
      headerActions: params.id ? (
        <ScreenHeaderActions
          actions={[
            {
              name: Icon.Delete,
              onPress: vm.handleDelete,
              iconColor: theme.error,
              variant: 'surface',
              disabled: vm.isSubmitting,
              testID: 'delete-rule-button',
            },
          ]}
        />
      ) : undefined,
    }),
    [guard.onBack, params.id, theme.error, vm.handleDelete, vm.isSubmitting],
  );

  return <SmsRuleFormView {...vm} chrome={chrome} />;
}
