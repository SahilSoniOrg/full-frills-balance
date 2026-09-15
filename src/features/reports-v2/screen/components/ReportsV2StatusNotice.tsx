import { AppButton, AppIcon, AppText, Icon } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function ReportsV2StatusNotice({
  state,
  onRetry,
}: {
  state: 'refreshing' | 'error';
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const isError = state === 'error';
  const color = isError ? theme.error : theme.primary;

  return (
    <View
      style={[
        styles.statusNotice,
        {
          borderColor: isError ? theme.error : theme.divider,
          backgroundColor: isError ? theme.errorLight : theme.surfaceSecondary,
        },
      ]}
      accessibilityRole="alert"
    >
      <View
        style={[
          styles.statusIcon,
          { backgroundColor: isError ? theme.errorLight : theme.primaryLight },
        ]}
      >
        <AppIcon name={isError ? Icon.Alert : Icon.Refresh} size={16} color={color} />
      </View>
      <View style={styles.statusCopy}>
        <AppText variant="caption" weight="semibold">
          {isError ? 'Report update failed' : 'Updating report'}
        </AppText>
        <AppText variant="caption" color="secondary" numberOfLines={2}>
          {isError
            ? 'Showing the previous results. Try again.'
            : 'Your current results stay visible while we update.'}
        </AppText>
      </View>
      {isError ? (
        <AppButton variant="ghost" size="sm" onPress={onRetry}>
          Retry
        </AppButton>
      ) : (
        <ActivityIndicator size="small" color={theme.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statusNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Shape.radius.r2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  statusIcon: {
    width: 30,
    height: 30,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: { flex: 1, gap: Spacing.xs },
});
