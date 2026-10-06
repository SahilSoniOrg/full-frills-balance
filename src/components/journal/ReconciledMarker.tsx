import { Icon, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, Typography } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import { StyleSheet, View } from 'react-native';

export interface ReconciledMarkerProps {
  date: number;
}

export function ReconciledMarker({ date }: ReconciledMarkerProps) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const label = AppConfig.strings.journal.reconciledUntilHere(
    formatRelativeReconciledDate(date, resolvedHourCycle),
  );

  return (
    <View style={[styles.reconciledContainer, { backgroundColor: theme.background }]}>
      <Separator background="income" style={styles.reconciledLine} />
      <View style={styles.reconciledContent}>
        <AppIcon name={Icon.Shield} size={14} color={theme.income} />
        <AppText
          variant="caption"
          weight="semibold"
          style={[styles.reconciledText, { color: theme.income }]}
        >
          {label.toUpperCase()}
        </AppText>
      </View>
      <Separator background="income" style={styles.reconciledLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  reconciledContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  reconciledLine: {
    flex: 1,
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
