import { MoneyDetailHeaderActions } from '@/src/components/common/MoneyDetailHeaderActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Typography } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { JournalDetailsView } from '@/src/features/journal/components/JournalDetailsView';
import { useJournalDetailsViewModel } from '@/src/features/journal/hooks/useJournalDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';

function JournalDetailsScreen() {
  const vm = useJournalDetailsViewModel();
  const { theme } = useTheme();

  const chrome = useMemo<ScreenNavChrome>(() => {
    const phase = vm.isLoading ? 'loading' : vm.isMissing ? 'missing' : 'ready';

    return buildDetailNavChrome({
      phase,
      readyTitle: vm.title,
      missingBackIcon: 'close',
      onBack: vm.onBack,
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
    vm.onBack,
    vm.title,
  ]);

  return <JournalDetailsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(JournalDetailsScreen);
