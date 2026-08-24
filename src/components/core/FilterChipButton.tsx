import { Shape, Spacing } from '@/src/constants';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { memo } from 'react';
import { Keyboard, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { AppIcon } from './AppIcon';
import type { IconName } from '@/src/types/domainIcons';
import { AppText } from './AppText';

interface FilterChipButtonProps {
  label: string;
  icon?: IconName;
  isActive?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

export const FilterChipButton = memo(
  ({ label, icon, isActive, onPress, style }: FilterChipButtonProps) => {
    const { theme } = useTheme();

    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected: !!isActive }}
        activeOpacity={0.7}
        onPress={() => {
          Keyboard.dismiss();
          onPress();
        }}
        style={[
          styles.container,
          {
            backgroundColor: resolveThemeColor(theme, theme.surface),
            borderColor: resolveThemeColor(theme, isActive ? theme.primary : theme.border),
          },
          isActive && {
            backgroundColor: resolveThemeColor(theme, theme.primary),
          },
          style,
        ]}
      >
        {icon && (
          <AppIcon
            name={icon}
            size={16}
            color={
              isActive
                ? resolveThemeColor(theme, theme.onPrimary || theme.surface)
                : resolveThemeColor(theme, theme.textSecondary)
            }
          />
        )}
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
      </TouchableOpacity>
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
    paddingVertical: 8,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
  },
});
