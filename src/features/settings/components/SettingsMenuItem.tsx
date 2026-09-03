import {
  SettingsMenuItem as CommonSettingsMenuItem,
  type SettingsMenuItemProps as CommonSettingsMenuItemProps,
} from '@/src/components/settings/SettingsMenuItem';
import { SettingsFocusTarget } from '@/src/features/settings/components/SettingsFocusTarget';
import { getSettingsSearchIcon } from '@/src/features/settings/components/settingsSearchCatalog';

export type SettingsMenuItemProps = CommonSettingsMenuItemProps & {
  /** Required for every settings row so search can navigate and focus it. */
  searchId: string;
};

export function SettingsMenuItem({ searchId, ...props }: SettingsMenuItemProps) {
  const registeredIcon = getSettingsSearchIcon(searchId);

  return (
    <SettingsFocusTarget targetId={searchId}>
      <CommonSettingsMenuItem
        {...props}
        leftIcon={registeredIcon ?? props.leftIcon}
        iconBackground={false}
      />
    </SettingsFocusTarget>
  );
}
