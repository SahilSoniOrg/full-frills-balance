import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import { StyleSheet, View } from 'react-native';

export interface ReconciledMarkerProps {
  date: number;
}

export function ReconciledMarker({ date }: ReconciledMarkerProps) {
  const { theme } = useTheme();
  const label = AppConfig.strings.journal.reconciledUntilHere(
    formatRelativeReconciledDate(date),
  );

  return (
    <View
      style={[styles.container, styles.reconciledContainer, { backgroundColor: theme.background }]}
    >
      <View style={[styles.reconciledLine, { backgroundColor: theme.income }]} />
      <View style={styles.reconciledContent}>
        <AppIcon name="shield" size={14} color={theme.income} />
        <AppText
          variant="caption"
          style={[
            styles.reconciledText,
            { color: theme.income, fontFamily: Typography.fonts.bold },
          ]}
        >
          {label.toUpperCase()}
        </AppText>
      </View>
      <View style={[styles.reconciledLine, { backgroundColor: theme.income }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  reconciledContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  reconciledLine: {
    flex: 1,
    height: 1,
    opacity: Opacity.muted,
  },
  reconciledContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reconciledText: {
    letterSpacing: Typography.letterSpacing.wide,
    fontSize: Typography.sizes.xs,
  },
});
