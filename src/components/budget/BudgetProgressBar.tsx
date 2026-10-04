import { AppText } from '@/src/components/core';
import { AppConfig, ColorKey, Opacity, Spacing } from '@/src/constants';
import { Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export interface BudgetProgressBarProps {
  /** Unclamped percentage: values beyond 100 render a striped overspend segment. */
  progress: number;
  statusColor?: ColorKey;
  size?: 'sm' | 'md';
  elapsedShare?: number;
  accessibilityLabel?: string;
  label?: string;
  showPercentage?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function BudgetProgressBar({
  progress,
  statusColor = 'primary',
  size = 'sm',
  elapsedShare,
  accessibilityLabel,
  label,
  showPercentage = false,
  style,
  testID,
}: BudgetProgressBarProps) {
  const { theme } = useTheme();
  const privateMode = useEffectivePrivacyMode();
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const stripeShare = Math.min(25, Math.max(0, progress - 100));
  const height = size === 'md' ? Spacing.md : Spacing.sm;
  const accessibilityLabelValue =
    accessibilityLabel ??
    AppConfig.strings.commitmentsRedesign.progressAccessibility(
      privateMode ? AppConfig.privacyMask : `${Math.round(progress)}%`,
    );
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabelValue}
      style={[styles.wrapper, style]}
    >
      {(label || showPercentage) && (
        <View style={styles.header}>
          {label ? (
            <AppText variant="caption" color="secondary" style={styles.label} numberOfLines={1}>
              {label}
            </AppText>
          ) : null}
          {showPercentage ? (
            <AppText variant="caption" color="secondary" style={styles.percentage}>
              {Math.round(progress)}%
            </AppText>
          ) : null}
        </View>
      )}
      <Box height={height} background="surfaceSecondary" borderRadius="full" overflow="hidden">
        <Box
          height="100%"
          width={`${clampedProgress}%`}
          background={statusColor}
          borderRadius="full"
        />
        {stripeShare > 0 && (
          <View
            testID="budget-over-segment"
            style={[
              styles.stripes,
              { width: `${stripeShare}%`, backgroundColor: theme[statusColor] },
            ]}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <View
                key={index}
                style={[styles.stripe, { backgroundColor: theme.surface, opacity: Opacity.muted }]}
              />
            ))}
          </View>
        )}
      </Box>
      {elapsedShare !== undefined && (
        <View
          testID="budget-today-marker"
          pointerEvents="none"
          style={[
            styles.marker,
            {
              backgroundColor: theme.text,
              left: `${Math.min(1, Math.max(0, elapsedShare)) * 100}%`,
              height: height + Spacing.sm,
            },
          ]}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  wrapper: { position: 'relative', paddingVertical: Spacing.xs },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  label: { flex: 1 },
  percentage: { marginLeft: Spacing.sm, fontVariant: ['tabular-nums'] },
  marker: { position: 'absolute', top: 0, width: 2, marginLeft: -1, borderRadius: 1 },
  stripes: {
    position: 'absolute',
    right: 0,
    height: '100%',
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 5,
  },
  stripe: { width: 5, height: 28, marginTop: -8, transform: [{ rotate: '35deg' }] },
});
