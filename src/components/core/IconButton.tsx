/**
 * IconButton - Consistent circular button with icon
 * Encodes visual identity for navigation and action buttons
 */

import { AppIcon } from '@/src/components/core/AppIcon';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import type { IconName } from '@/src/types/domainIcons';
import { Keyboard, StyleSheet, type TouchableOpacityProps, type ViewStyle } from 'react-native';

export type IconButtonVariant = 'primary' | 'surface' | 'clear' | 'error' | 'success';

export type IconButtonProps = Omit<TouchableOpacityProps, 'children'> & {
  name: IconName;
  size?: number;
  variant?: IconButtonVariant;
  iconColor?: string;
};

type VariantConfig = {
  backgroundColor: ViewStyle['backgroundColor'];
  iconColor: string;
  elevation?: ViewStyle;
};

const VARIANTS: Record<
  IconButtonVariant,
  (theme: ReturnType<typeof useTheme>['theme'], disabled: boolean) => VariantConfig
> = {
  primary: (theme, disabled) => ({
    backgroundColor: disabled ? theme.surfaceSecondary : theme.primary,
    iconColor: disabled ? theme.textTertiary : theme.onPrimary,
  }),
  surface: (theme, disabled) => ({
    backgroundColor: disabled ? theme.surfaceSecondary : theme.surface,
    iconColor: disabled ? theme.textTertiary : theme.text,
    elevation: Shape.elevation.sm,
  }),
  clear: (theme, disabled) => ({
    backgroundColor: 'transparent',
    iconColor: disabled ? theme.textTertiary : theme.primary,
  }),
  error: (theme, disabled) => ({
    backgroundColor: disabled ? theme.surfaceSecondary : theme.error,
    iconColor: disabled ? theme.textTertiary : theme.pureInverse,
  }),
  success: (theme, disabled) => ({
    backgroundColor: disabled ? theme.surfaceSecondary : theme.success,
    iconColor: disabled ? theme.textTertiary : theme.pureInverse,
  }),
};

export function IconButton({
  name,
  size = Size.md,
  variant = 'surface',
  iconColor,
  style,
  onPress,
  disabled,
  ...props
}: IconButtonProps) {
  const { theme } = useTheme();

  const config = VARIANTS[variant](theme, disabled ?? false);
  const finalIconColor = iconColor ?? config.iconColor;

  return (
    <PressScaleTouchable
      {...props}
      onPress={e => {
        Keyboard.dismiss();
        onPress?.(e);
      }}
      style={style}
      surfaceStyle={[styles.button, { backgroundColor: config.backgroundColor }, config.elevation]}
      hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <AppIcon name={name} size={size} color={finalIconColor} />
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
