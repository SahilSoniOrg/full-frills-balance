import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { Size } from '@/src/constants';

/** Primary nav actions only — period lives in the secondary filter bar. */
export function JournalListHeaderActions({
  onOpenReports,
  onOpenSearch,
}: {
  onOpenReports: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <ScreenHeaderActions
      actions={[
        {
          name: 'reports',
          size: Size.iconSm,
          variant: 'surface',
          onPress: onOpenReports,
          accessibilityLabel: 'View Analytics',
        },
        {
          name: 'search',
          size: Size.iconSm,
          variant: 'surface',
          onPress: onOpenSearch,
          accessibilityLabel: 'Search and Filter',
        },
      ]}
      trailing={<PrivacyToggleButton />}
    />
  );
}
