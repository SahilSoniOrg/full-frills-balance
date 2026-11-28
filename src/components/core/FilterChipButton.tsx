import { Shape, Size, Spacing } from '@/src/constants';
import { triggerPressHaptic } from '@/src/design-system/haptics';
import { resolveThemeColor } from '@/src/design-system/utils';
import type { ComponentVariant } from '@/src/design-system/variants';
import { useTheme } from '@/src/hooks/use-theme';
import type { IconName } from '@/src/types/domainIcons';
import { memo } from 'react';
import { Keyboard, StyleSheet, type ViewStyle } from 'react-native';
import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { PressScaleTouchable } from './PressScaleTouchable';

interface FilterChipButtonProps {
  label: string;
  icon?: IconName;
  trailingIcon?: IconName;
  isActive?: boolean;
  /** Colors icon + label with the variant’s main money/status color. Shell stays neutral. */
  tone?: ComponentVariant;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export const FilterChipButton = memo(
  ({
    label,
    icon,
    trailingIcon,
    isActive,
    tone,
    accessibilityLabel,
    accessibilityHint,
    onPress,
    onLongPress,
    style,
    testID,
  }: FilterChipButtonProps) => {
    const { theme, getVariantColors } = useTheme();
    const accent = !isActive && tone ? getVariantColors(tone).main : null;
    const iconColor = isActive
      ? resolveThemeColor(theme, theme.onPrimary || theme.surface)
      : (accent ?? resolveThemeColor(theme, theme.textSecondary));
    const labelColor = isActive
      ? resolveThemeColor(theme, theme.onPrimary || theme.surface)
      : (accent ?? resolveThemeColor(theme, theme.text));

    return (
      <PressScaleTouchable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected: !!isActive }}
        onPress={() => {
          Keyboard.dismiss();
          if (!isActive) triggerPressHaptic('selection');
          onPress();
        }}
        onLongPress={
          onLongPress
            ? () => {
                Keyboard.dismiss();
                triggerPressHaptic('selection');
                onLongPress();
              }
            : undefined
        }
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
          style={{ color: labelColor }}
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
