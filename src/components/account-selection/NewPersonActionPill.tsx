import { AppIcon, AppText, PressScaleTouchable } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon } from '@/src/types/domainIcons';
import { StyleSheet } from 'react-native';

export function NewPersonActionPill({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <PressScaleTouchable
      testID="account-picker-new-person-button"
      accessibilityRole="button"
      accessibilityLabel="New person"
      onPress={onPress}
      surfaceStyle={[
        styles.pill,
        {
          borderColor: withOpacity(theme.primary, Opacity.heavy),
          backgroundColor: withOpacity(theme.primary, Opacity.hover),
        },
      ]}
    >
      <AppIcon name={Icon.Plus} size={Size.iconXs} color={theme.primary} />
      <AppText variant="caption" weight="semibold" color="primary">
        New person
      </AppText>
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
