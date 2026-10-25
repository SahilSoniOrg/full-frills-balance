import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

type CurrencySideControlProps = {
  code: string;
  symbol: string;
  onPress: () => void;
  /** Muted look, no edit badge; still pressable (e.g. locked currency → info sheet). */
  locked?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/** Account/budget amount-row currency chip: big symbol, ISO code, edit badge. */
export function CurrencySideControl({
  code,
  symbol,
  onPress,
  locked = false,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: CurrencySideControlProps) {
  const { theme } = useTheme();
  return (
    <PressScaleTouchable
      style={[
        styles.control,
        {
          backgroundColor: locked ? theme.surfaceSecondary : theme.surface,
          borderColor: theme.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? code}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <View style={styles.stack}>
        <AppText
          weight="semibold"
          style={[styles.symbol, { color: locked ? theme.textTertiary : theme.primary }]}
        >
          {symbol}
        </AppText>
        <AppText variant="caption" color={locked ? 'tertiary' : 'secondary'} weight="medium">
          {code}
        </AppText>
      </View>
      {!locked ? (
        <View
          style={[styles.editBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <AppIcon name={Icon.Edit} size={Size.xxs} color={theme.textSecondary} />
        </View>
      ) : null}
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  control: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: Size.touchTargetLg,
    minHeight: Size.touchTargetLg,
    padding: Spacing.sm,
    borderWidth: 1,
    borderRadius: Shape.radius.md,
  },
  stack: { alignItems: 'center' },
  symbol: {
    fontSize: Typography.sizes.xxl,
    lineHeight: Typography.sizes.xxl * Typography.lineHeights.tight,
  },
  editBadge: {
    position: 'absolute',
    right: -Spacing.xs,
    bottom: -Spacing.xs,
    width: Size.iconSm,
    height: Size.iconSm,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
