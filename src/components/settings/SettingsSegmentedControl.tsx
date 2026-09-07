import { AppSegmentedControl, type SegmentedOption } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { SettingsMenuItem, type SettingsMenuItemProps } from './SettingsMenuItem';

export type SettingsSegmentedControlProps<T extends string | number> = Omit<
  SettingsMenuItemProps,
  'rightContent' | 'hasArrow' | 'onPress'
> & {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  controlTestID?: string;
};

/** A settings row with the standard menu-item copy rail and a full-width selector below it. */
export function SettingsSegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  controlTestID,
  ...itemProps
}: SettingsSegmentedControlProps<T>) {
  return (
    <Stack space={0}>
      <SettingsMenuItem {...itemProps} iconBackground={false} hasArrow={false} />
      <Box paddingHorizontal="md" paddingBottom="sm" marginTop="sm">
        <AppSegmentedControl
          options={options}
          value={value}
          onChange={onChange}
          flex
          size="md"
          testID={controlTestID}
        />
      </Box>
    </Stack>
  );
}
