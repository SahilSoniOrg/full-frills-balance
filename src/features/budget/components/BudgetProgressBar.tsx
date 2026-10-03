import { AppConfig, ColorKey, Opacity, Spacing } from '@/src/constants';
import { Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { StyleSheet, View } from 'react-native';

interface BudgetProgressBarProps {
  /** Unclamped percentage: values beyond 100 render a striped overspend segment. */
  progress: number;
  statusColor: ColorKey;
  size?: 'sm' | 'md';
  elapsedShare?: number;
  accessibilityLabel?: string;
}

export function BudgetProgressBar({
  progress,
  statusColor,
  size = 'sm',
  elapsedShare,
  accessibilityLabel,
}: BudgetProgressBarProps) {
  const { theme } = useTheme();
  const privateMode = useEffectivePrivacyMode();
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const stripeShare = Math.min(25, Math.max(0, progress - 100));
  const height = size === 'md' ? Spacing.md : Spacing.sm;
  const label =
    accessibilityLabel ??
    AppConfig.strings.commitmentsRedesign.progressAccessibility(
      privateMode ? AppConfig.privacyMask : `${Math.round(progress)}%`,
    );
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.wrapper}>
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
