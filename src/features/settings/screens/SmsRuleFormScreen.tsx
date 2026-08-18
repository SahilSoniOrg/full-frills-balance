import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { SmsRuleFormView } from '@/src/features/settings/components/SmsRuleFormView';
import { useSmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

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
  const { theme } = useTheme();

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: params.id ? 'Edit SMS Rule' : 'New SMS Rule',
      showBack: true,
      backIcon: 'back',
      onBack: AppNavigation.back,
      headerActions: params.id ? (
        <ScreenHeaderActions
          actions={[
            {
              name: 'delete',
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
    [params.id, theme.error, vm.handleDelete, vm.isSubmitting],
  );

  return <SmsRuleFormView {...vm} chrome={chrome} />;
}
