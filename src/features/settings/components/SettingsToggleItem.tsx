import { AppToggle } from '@/src/components/core';
import {
  SettingsSearchMenuItem as SettingsMenuItem,
  type SettingsSearchMenuItemProps as SettingsMenuItemProps,
} from '@/src/features/settings/components/SettingsSearchMenuItem';

export type SettingsToggleItemProps = Omit<
  SettingsMenuItemProps,
  'hasArrow' | 'loading' | 'onPress' | 'rightContent' | 'rightAction'
> & {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

/** Standard settings row for a boolean preference. */
export function SettingsToggleItem({
  value,
  onValueChange,
  disabled = false,
  title,
  ...itemProps
}: SettingsToggleItemProps) {
  return (
    <SettingsMenuItem
      {...itemProps}
      title={title}
      disabled={disabled}
      hasArrow={false}
      rightContent={
        <AppToggle
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={title}
        />
      }
    />
  );
}
