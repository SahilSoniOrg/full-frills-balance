import {
  SettingsMenuItem as CommonSettingsMenuItem,
  type SettingsMenuItemProps as CommonSettingsMenuItemProps,
} from '@/src/components/settings/SettingsMenuItem';

export type SettingsSearchMenuItemProps = CommonSettingsMenuItemProps & {
  /** Required for every settings row so search can navigate and focus it. */
  searchId: string;
};

export function SettingsSearchMenuItem({ searchId, ...props }: SettingsSearchMenuItemProps) {
  return (
    <CommonSettingsMenuItem
      {...props}
      focusId={searchId}
      iconBackground={props.iconBackground ?? false}
    />
  );
}
