import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Typography } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { JournalDetailsView } from '@/src/features/journal/components/JournalDetailsView';
import { useJournalDetailsViewModel } from '@/src/features/journal/hooks/useJournalDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';
import { Icon } from '@/src/types/domainIcons';

function JournalDetailsScreen() {
  const vm = useJournalDetailsViewModel();
  const { theme } = useTheme();
  const phase = vm.isLoading ? 'loading' : vm.details ? 'ready' : 'missing';

  const chrome = useMemo<ScreenNavChrome>(
    () =>
      buildDetailNavChrome({
        phase,
        readyTitle: AppConfig.strings.journalDetails.title,
        missingBackIcon: Icon.Close,
        onBack: vm.onBack,
        headerActions: (
          <DetailHeaderMenuActions
            privacyPosition="leading"
            leadingActions={[
              {
                name: Icon.Edit,
                onPress: vm.headerActions.onEdit,
                variant: 'surface',
                iconColor: theme.text,
                size: Typography.sizes.xl,
                testID: 'edit-button',
                accessibilityLabel: AppConfig.strings.journalDetails.edit,
              },
            ]}
            actions={[
              {
                label: AppConfig.strings.journalDetails.duplicate,
                onPress: vm.headerActions.onCopy,
                testID: 'copy-button',
              },
              {
                label: AppConfig.strings.journalDetails.delete,
                onPress: vm.headerActions.onDelete,
                testID: 'delete-button',
                destructive: true,
              },
            ]}
          />
        ),
      }),
    [
      phase,
      theme.text,
      vm.headerActions.onCopy,
      vm.headerActions.onDelete,
      vm.headerActions.onEdit,
      vm.onBack,
    ],
  );

  return <JournalDetailsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(JournalDetailsScreen);
