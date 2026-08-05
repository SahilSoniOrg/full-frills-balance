import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { Size } from '@/src/constants';
import { AppNavigation } from '@/src/utils/navigation';

/** Primary nav actions only — period lives in the secondary filter bar. */
export function JournalListHeaderActions() {
  return (
    <ScreenHeaderActions
      actions={[
        {
          name: 'reports',
          size: Size.iconSm,
          variant: 'surface',
          onPress: AppNavigation.toReports,
          accessibilityLabel: 'View Analytics',
        },
        {
          name: 'search',
          size: Size.iconSm,
          variant: 'surface',
          onPress: () => AppNavigation.toJournalSearch(),
          accessibilityLabel: 'Search and Filter',
        },
      ]}
      trailing={<PrivacyToggleButton />}
    />
  );
}
