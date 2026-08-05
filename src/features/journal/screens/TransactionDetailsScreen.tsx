import { MoneyDetailHeaderActions } from '@/src/components/common/MoneyDetailHeaderActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Typography } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { TransactionDetailsView } from '@/src/features/journal/components/TransactionDetailsView';
import { useTransactionDetailsViewModel } from '@/src/features/journal/hooks/useTransactionDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';

function TransactionDetailsScreen() {
  const vm = useTransactionDetailsViewModel();
  const { theme } = useTheme();

  const chrome = useMemo<ScreenNavChrome>(() => {
    const phase = vm.isLoading ? 'loading' : vm.isMissing ? 'missing' : 'ready';

    return buildDetailNavChrome({
      phase,
      readyTitle: vm.title,
      missingBackIcon: 'close',
      headerActions: (
        <MoneyDetailHeaderActions
          actions={[
            {
              name: 'copy',
              onPress: vm.headerActions.onCopy,
              iconColor: theme.text,
              size: Typography.sizes.xl,
              testID: 'copy-button',
            },
            {
              name: 'edit',
              onPress: vm.headerActions.onEdit,
              iconColor: theme.text,
              size: Typography.sizes.xl,
              testID: 'edit-button',
            },
            {
              name: 'delete',
              onPress: vm.headerActions.onDelete,
              iconColor: theme.error,
              size: Typography.sizes.xl,
              testID: 'delete-button',
            },
          ]}
        />
      ),
    });
  }, [
    theme.error,
    theme.text,
    vm.headerActions.onCopy,
    vm.headerActions.onDelete,
    vm.headerActions.onEdit,
    vm.isLoading,
    vm.isMissing,
    vm.title,
  ]);

  return <TransactionDetailsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(TransactionDetailsScreen);
