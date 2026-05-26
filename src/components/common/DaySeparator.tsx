import { AppIcon, AppText, Badge } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import {
  formatDaySeparator,
  formatReconciledTime,
  formatRelativeReconciledDate,
} from '@/src/utils/dateUtils';
import { formatCurrency } from '@/src/utils/money';
import { useUI } from '@/src/contexts/UIContext';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface DaySeparatorProps {
  date: number;
  isCollapsed?: boolean;
  onToggle?: () => void;
  count?: number;
  netAmount?: number;
  currencyCode?: string;
  isReconciledMarker?: boolean;
  reconciledAt?: number | null;
  isPrivacyMode?: boolean;
}

export function DaySeparator({
  date,
  isCollapsed,
  onToggle,
  count,
  netAmount,
  currencyCode,
  isReconciledMarker,
  reconciledAt,
  isPrivacyMode: isPrivacyModeOverride,
}: DaySeparatorProps) {
  const { theme } = useTheme();
  const { isPrivacyMode: globalPrivacyMode } = useUI();
  const isPrivacyMode = isPrivacyModeOverride ?? globalPrivacyMode;
  const label = isReconciledMarker
    ? AppConfig.strings.journal.reconciledUntilHere(formatRelativeReconciledDate(date))
    : formatDaySeparator(date);

  const hasStats = count !== undefined && netAmount !== undefined;
  const isPositive = (netAmount || 0) > 0;
  const isNegative = (netAmount || 0) < 0;

  const content = (
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
                color: isPositive ? theme.success : isNegative ? theme.error : theme.textSecondary,
              },
            ]}
          >
            {isPositive ? '+' : ''}
            {isPrivacyMode ? '••••' : formatCurrency(netAmount, currencyCode)}
          </AppText>
        )}
        {!isReconciledMarker && (
          <AppIcon
            name={isCollapsed ? 'chevronRight' : 'chevronDown'}
            size={16}
            color={theme.textSecondary}
          />
        )}
      </View>
    </View>
  );

  if (isReconciledMarker) {
    return (
      <View
        style={[
          styles.container,
          styles.reconciledContainer,
          { backgroundColor: theme.background },
        ]}
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

  return (
    <TouchableOpacity
      activeOpacity={Opacity.heavy}
      onPress={onToggle}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {content}
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
