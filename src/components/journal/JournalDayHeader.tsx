import { MoneyText } from '@/src/components/shared/MoneyText';
import { Icon, AppIcon, AppText, Badge, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, Opacity, Size, Spacing, Typography } from '@/src/constants';
import { useEaseInLayoutAnimation } from '@/src/hooks/useEaseInLayoutAnimation';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDaySeparator, formatReconciledTime } from '@/src/utils/dateUtils';
import { StyleSheet, View } from 'react-native';

export interface JournalDayHeaderProps {
  date: number;
  isCollapsed?: boolean;
  onToggle?: () => void;
  count?: number;
  netAmount?: number;
  currencyCode?: string;
  reconciledAt?: number | null;
}

export function JournalDayHeader({
  date,
  isCollapsed,
  onToggle,
  count,
  netAmount,
  currencyCode,
  reconciledAt,
}: JournalDayHeaderProps) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const prepareLayoutAnimation = useEaseInLayoutAnimation();
  const label = formatDaySeparator(date);

  const hasStats = count !== undefined && netAmount !== undefined;
  const isPositive = (netAmount || 0) > 0;
  const isNegative = (netAmount || 0) < 0;

  return (
    <PressScaleTouchable
      onPress={() => {
        prepareLayoutAnimation();
        onToggle?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}${hasStats ? `, ${AppConfig.strings.journal.transactionCount(count!)}` : ''}`}
      accessibilityHint={isCollapsed ? 'Expands this day' : 'Collapses this day'}
      accessibilityState={{ expanded: !isCollapsed }}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        <View style={styles.leftContent}>
          <AppText
            variant="caption"
            color="secondary"
            style={[styles.text, { fontFamily: Typography.fonts.semibold }]}
          >
            {label.toUpperCase()}
          </AppText>
          <View style={styles.subLabelRow}>
            {hasStats && (
              <AppText variant="caption" color="secondary" style={styles.statCount}>
                {AppConfig.strings.journal.transactionCount(count)}
              </AppText>
            )}
            {isCollapsed && reconciledAt && (
              <View style={styles.reconciledBadgeWrapper}>
                <Badge variant="success" size="sm" icon={Icon.ShieldCheck}>
                  {formatReconciledTime(reconciledAt, resolvedHourCycle)}
                </Badge>
              </View>
            )}
          </View>
        </View>

        <View style={styles.rightContent}>
          {hasStats && netAmount !== undefined && netAmount !== 0 && currencyCode && (
            <MoneyText
              amount={netAmount}
              currencyCode={currencyCode}
              prefix={isPositive ? '+' : undefined}
              variant="caption"
              style={[
                styles.netAmount,
                {
                  color: isPositive
                    ? theme.success
                    : isNegative
                      ? theme.error
                      : theme.textSecondary,
                },
              ]}
            />
          )}
          <AppIcon
            name={isCollapsed ? Icon.ChevronRight : Icon.ChevronDown}
            size={Size.xs}
            color={theme.textSecondary}
          />
        </View>
      </View>
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftContent: {
    flex: 1,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  text: {
    letterSpacing: Typography.letterSpacing.wide,
  },
  statCount: {
    fontSize: Typography.sizes.xs,
    opacity: Opacity.heavy,
    marginTop: Spacing.xs / 2,
  },
  netAmount: {
    fontFamily: Typography.fonts.semibold,
    fontSize: Typography.sizes.xs,
  },
  subLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs / 2,
    gap: Spacing.sm,
  },
  reconciledBadgeWrapper: {
    marginLeft: Spacing.xs / 2,
  },
});
