import { ScreenHeaderActions } from '@/src/components/shared/ScreenHeaderActions';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import { AppConfig, Size } from '@/src/constants';
import { Icon } from '@/src/types/domainIcons';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { ReportsView } from '@/src/features/reports/components/ReportsView';
import { useReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';

function ReportsScreen() {
  const vm = useReportsViewModel();

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      ...privacyNavChrome(AppConfig.strings.reports.title, AppNavigation.back),
      headerActions: (
        <ScreenHeaderActions
          actions={[
            {
              name: Icon.Filter,
              size: Size.iconSm,
              variant: 'clear',
              onPress: vm.filters.filterChrome.onOpen,
              accessibilityLabel: 'Open report filters',
              testID: 'reports-filter-header-button',
            },
            {
              name: Icon.Sparkles,
              size: Size.iconSm,
              variant: 'primary',
              onPress: AppNavigation.toReportsV2,
              accessibilityLabel: 'Open Reports V2',
              testID: 'reports-v2-header-button',
            },
          ]}
          trailing={<PrivacyToggleButton />}
        />
      ),
    }),
    [vm.filters.filterChrome.onOpen],
  );

  return <ReportsView vm={vm} chrome={chrome} />;
}

export default withPrivacyScope(ReportsScreen);
