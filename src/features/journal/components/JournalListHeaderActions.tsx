import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { ScreenHeaderActions } from '@/src/components/shared/ScreenHeaderActions';
import { Size } from '@/src/constants';
import { Icon } from '@/src/types/domainIcons';

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
          name: Icon.Reports,
          size: Size.iconSm,
          variant: 'surface',
          onPress: onOpenReports,
          accessibilityLabel: 'View Analytics',
        },
        {
          name: Icon.Search,
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
