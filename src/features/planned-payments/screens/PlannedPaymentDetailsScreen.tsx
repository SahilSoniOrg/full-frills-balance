import {
  MoneyDetailHeaderActions,
  moneyDetailEditDeleteActions,
} from '@/src/components/common/MoneyDetailHeaderActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { PlannedPaymentDetailsView } from '@/src/features/planned-payments/components/PlannedPaymentDetailsView';
import { usePlannedPaymentDetailsViewModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

function PlannedPaymentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = usePlannedPaymentDetailsViewModel(id);
  const { theme } = useTheme();

  const chrome = useMemo<ScreenNavChrome>(() => {
    const phase = vm.isLoading ? 'loading' : vm.isMissing ? 'missing' : 'ready';

    return buildDetailNavChrome({
      phase,
      readyTitle: vm.title ?? AppConfig.strings.plannedPayments.details.screenTitle,
      onBack: vm.onBack,
      headerActions: vm.headerActions ? (
        <MoneyDetailHeaderActions
          actions={moneyDetailEditDeleteActions(
            vm.headerActions.onEdit,
            vm.headerActions.onDelete,
            theme,
          )}
        />
      ) : undefined,
    });
  }, [theme, vm.headerActions, vm.isLoading, vm.isMissing, vm.onBack, vm.title]);

  return <PlannedPaymentDetailsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(PlannedPaymentDetailsScreen);
