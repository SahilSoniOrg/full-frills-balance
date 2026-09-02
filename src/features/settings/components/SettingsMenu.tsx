import {
  SettingsMenu as CommonSettingsMenu,
  type SettingsMenuProps as CommonSettingsMenuProps,
} from '@/src/components/common/SettingsMenu';

export function SettingsMenu(props: CommonSettingsMenuProps) {
  return <CommonSettingsMenu {...props} allowOverflow />;
}
