import { AppIcon, AppText, Badge } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDaySeparator, formatReconciledTime } from '@/src/utils/dateUtils';
import { formatCurrency } from '@/src/utils/money';
import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export interface JournalDayHeaderProps {
  date: number;
  isCollapsed?: boolean;
  onToggle?: () => void;
  count?: number;
  netAmount?: number;
  currencyCode?: string;
  reconciledAt?: number | null;
  isPrivacyMode?: boolean;
}

export function JournalDayHeader({
  date,
  isCollapsed,
  onToggle,
  count,
  netAmount,
  currencyCode,
  reconciledAt,
  isPrivacyMode: isPrivacyModeOverride,
}: JournalDayHeaderProps) {
  const { theme } = useTheme();
  const { isPrivacyMode: globalPrivacyMode } = usePrivacyPrefs();
  const isPrivacyMode = isPrivacyModeOverride ?? globalPrivacyMode;
  const label = formatDaySeparator(date);

  const hasStats = count !== undefined && netAmount !== undefined;
  const isPositive = (netAmount || 0) > 0;
  const isNegative = (netAmount || 0) < 0;

  return (
    <TouchableOpacity
      activeOpacity={Opacity.heavy}
      onPress={onToggle}
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
                <Badge variant="success" size="sm" icon="shieldCheck">
                  {formatReconciledTime(reconciledAt)}
                </Badge>
              </View>
            )}
          </View>
        </View>

        <View style={styles.rightContent}>
          {hasStats && netAmount !== undefined && netAmount !== 0 && (
            <AppText
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
            >
              {isPositive ? '+' : ''}
              {isPrivacyMode ? '••••' : formatCurrency(netAmount, currencyCode)}
            </AppText>
          )}
          <AppIcon
            name={isCollapsed ? 'chevronRight' : 'chevronDown'}
            size={16}
            color={theme.textSecondary}
          />
        </View>
      </View>
    </TouchableOpacity>
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
    marginTop: 2,
  },
  netAmount: {
    fontFamily: Typography.fonts.semibold,
    fontSize: Typography.sizes.xs,
  },
  subLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: Spacing.sm,
  },
  reconciledBadgeWrapper: {
    marginLeft: 2,
  },
});
