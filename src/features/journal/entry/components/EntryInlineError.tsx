import { AppIcon, AppText, Icon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export function EntryInlineError({
  message,
  style,
}: {
  message: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[styles.error, { backgroundColor: withOpacity(theme.error, Opacity.soft) }, style]}
    >
      <AppIcon name={Icon.Error} size={Size.iconXs} color={theme.error} />
      <AppText variant="caption" color="error" weight="semibold" style={styles.errorText}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Shape.radius.r2,
  },
  errorText: { flex: 1 },
});
