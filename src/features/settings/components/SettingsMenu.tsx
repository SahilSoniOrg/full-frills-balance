import {
  SettingsMenu as CommonSettingsMenu,
  type SettingsMenuProps as CommonSettingsMenuProps,
} from '@/src/components/settings/SettingsMenu';

export function SettingsMenu(props: CommonSettingsMenuProps) {
  return <CommonSettingsMenu {...props} variant={props.variant ?? 'flat'} />;
}
