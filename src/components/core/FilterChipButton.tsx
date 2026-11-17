import { Shape, Size, Spacing } from '@/src/constants';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { triggerPressHaptic } from '@/src/design-system/haptics';
import { memo } from 'react';
import { Keyboard, StyleSheet, type ViewStyle } from 'react-native';
import { AppIcon } from './AppIcon';
import type { IconName } from '@/src/types/domainIcons';
import { AppText } from './AppText';
import { PressScaleTouchable } from './PressScaleTouchable';

interface FilterChipButtonProps {
  label: string;
  icon?: IconName;
  trailingIcon?: IconName;
  isActive?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
  style?: ViewStyle;
  testID?: string;
}

export const FilterChipButton = memo(
  ({
    label,
    icon,
    trailingIcon,
    isActive,
    accessibilityLabel,
    onPress,
    style,
    testID,
  }: FilterChipButtonProps) => {
    const { theme } = useTheme();
    const iconColor = isActive
      ? resolveThemeColor(theme, theme.onPrimary || theme.surface)
      : resolveThemeColor(theme, theme.textSecondary);

    return (
      <PressScaleTouchable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: !!isActive }}
        onPress={() => {
          Keyboard.dismiss();
          if (!isActive) triggerPressHaptic('selection');
          onPress();
        }}
        style={style}
        surfaceStyle={[
          styles.container,
          {
            backgroundColor: resolveThemeColor(theme, isActive ? theme.primary : theme.surface),
            borderColor: resolveThemeColor(theme, isActive ? theme.primary : theme.border),
          },
        ]}
      >
        {icon && <AppIcon name={icon} size={Size.xs} color={iconColor} />}
        <AppText
          variant="caption"
          weight={isActive ? 'semibold' : 'medium'}
          style={{
            color: isActive
              ? resolveThemeColor(theme, theme.onPrimary || theme.surface)
              : resolveThemeColor(theme, theme.text),
          }}
        >
          {label}
        </AppText>
        {trailingIcon && <AppIcon name={trailingIcon} size={Size.xs} color={iconColor} />}
      </PressScaleTouchable>
    );
  },
);

FilterChipButton.displayName = 'FilterChipButton';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
  },
});
