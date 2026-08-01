import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { Insight } from '@/src/services/insight/InsightService';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { AppNavigation } from '@/src/utils/navigation';
import React from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { EmergencyFundPopupModal } from './EmergencyFundPopupModal';

interface HubWidgetProps {
  insights: Insight[];
  currencyCode: string;
  onDismiss: (id: string) => void;
  hideManageDismissed?: boolean;
  isPrivacyMode?: boolean;
}

export const HubWidget = ({
  insights,
  currencyCode,
  onDismiss,
  hideManageDismissed = false,
  isPrivacyMode = false,
}: HubWidgetProps) => {
  const { theme, fonts } = useTheme();

  const [isEmergencyFundInfoVisible, setEmergencyFundInfoVisible] = React.useState(false);

  const isEmergencyFundInsight = (insight: Insight) => insight.id === 'no_emergency_fund';

  const handleOpenInsightDetails = (insight: Insight) => {
    AppNavigation.toInsightDetails({
      id: insight.id,
      message: insight.message,
      description: insight.description,
      suggestion: insight.suggestion,
      journalIds: insight.journalIds,
      severity: insight.severity,
      amount: insight.amount,
      currencyCode: insight.currencyCode,
    });
  };

  const handleEmergencyFundPress = () => setEmergencyFundInfoVisible(true);

  const handlePress = (insight: Insight) => {
    if (isEmergencyFundInsight(insight)) {
      handleEmergencyFundPress();
      return;
    }
    handleOpenInsightDetails(insight);
  };

  if (insights.length === 0) return null;

  const handleManageDismissed = () => {
    AppNavigation.toHub();
  };

  const getSeverityMeta = (severity: Insight['severity']) => {
    const errorColor = resolveThemeColor(theme, theme.error) as string;
    const warningColor = resolveThemeColor(theme, theme.warning) as string;
    const primaryColor = resolveThemeColor(theme, theme.primary) as string;

    if (severity === 'high') {
      return {
        color: errorColor,
        label: AppConfig.strings.alerts.validationError,
        chipBg: withOpacity(errorColor, Opacity.hover),
      };
    }
    if (severity === 'medium') {
      return {
        color: warningColor,
        label: AppConfig.strings.alerts.warning,
        chipBg: withOpacity(warningColor, Opacity.hover),
      };
    }
    return {
      color: primaryColor,
      label: AppConfig.strings.alerts.info,
      chipBg: withOpacity(primaryColor, Opacity.hover),
    };
  };

  const getPrimaryActionLabel = (patternType: Insight['type']) => {
    if (patternType === 'subscription-amnesiac') {
      return AppConfig.strings.journal.plannedPayments;
    }
    if (patternType === 'slow-leak') {
      return AppConfig.strings.reports.spendingBreakdown;
    }
    if (patternType === 'lifestyle-drift') {
      return AppConfig.strings.dashboard.notifications.planEmergencyFund;
    }
    return AppConfig.strings.dashboard.hub.title;
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <View style={styles.titleGroup}>
            <AppText variant="subheading" color="secondary" style={styles.title}>
              {AppConfig.strings.dashboard.notificationsTitle}
            </AppText>
            <View
              style={[
                styles.countChip,
                { backgroundColor: withOpacity(theme.primary, Opacity.soft) },
              ]}
            >
              <AppText
                variant="caption"
                style={{ color: theme.textSecondary, fontFamily: fonts.medium }}
              >
                {insights.length}
              </AppText>
            </View>
          </View>
          {!hideManageDismissed && (
            <TouchableOpacity
              onPress={handleManageDismissed}
              style={[styles.managePill, { backgroundColor: theme.surfaceSecondary }]}
              accessibilityRole="button"
              accessibilityLabel="Manage dismissed notifications"
            >
              <AppIcon name="history" size={14} color={theme.textSecondary} />
              <AppText variant="caption" color="secondary">
                {AppConfig.strings.dashboard.manageDismissed}
              </AppText>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.listContent}>
          {insights.map(insight => {
            const severity = getSeverityMeta(insight.severity);
            return (
              <AppCard
                key={insight.id}
                elevation="sm"
                padding="none"
                style={[
                  styles.card,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                  },
                ]}
              >
                <Pressable
                  onPress={() => handlePress(insight)}
                  style={styles.cardPressable}
                  android_ripple={{ color: withOpacity(theme.primary, Opacity.soft) }}
                >
                  <View style={styles.metaRow}>
                    <View style={[styles.severityChip, { backgroundColor: severity.chipBg }]}>
                      <AppIcon name="alert" size={12} color={severity.color} />
                      <AppText variant="caption" weight="medium" style={{ color: severity.color }}>
                        {severity.label}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.header}>
                    <View style={styles.iconTitle}>
                      <View
                        style={[
                          styles.iconBadge,
                          { backgroundColor: withOpacity(severity.color, Opacity.hover) },
                        ]}
                      >
                        <AppIcon
                          name={insight.type === 'subscription-amnesiac' ? 'history' : 'trendingUp'}
                          size={Size.xs}
                          color={severity.color}
                        />
                      </View>
                      <AppText
                        variant="body"
                        weight="semibold"
                        numberOfLines={2}
                        style={styles.headline}
                      >
                        {insight.message}
                      </AppText>
                    </View>
                  </View>

                  {typeof insight.amount === 'number' ? (
                    <View
                      style={[
                        styles.amountCard,
                        { backgroundColor: withOpacity(severity.color, Opacity.hover) },
                      ]}
                    >
                      <AppText variant="caption" weight="medium" style={{ color: severity.color }}>
                        {AppConfig.strings.dashboard.notifications.impact}
                      </AppText>
                      <AppText
                        variant="subheading"
                        style={[
                          styles.amountValue,
                          { color: severity.color, fontFamily: fonts.bold },
                        ]}
                      >
                        {isPrivacyMode
                          ? AppConfig.privacyMask
                          : CurrencyFormatter.format(
                              insight.amount,
                              insight.currencyCode || currencyCode,
                            )}
                      </AppText>
                    </View>
                  ) : null}

                  <AppText
                    variant="caption"
                    color="secondary"
                    style={styles.reason}
                    numberOfLines={2}
                  >
                    {AppConfig.strings.dashboard.notifications.whyThisAppeared}
                    {insight.description}
                  </AppText>

                  <View style={styles.contextRow}>
                    <AppText
                      variant="caption"
                      color="secondary"
                      numberOfLines={1}
                      style={styles.contextText}
                    >
                      {AppConfig.strings.dashboard.notifications.basedOnLastDays(
                        AppConfig.insights.lookbackDays,
                      )}
                    </AppText>
                    {insight.journalIds.length > 0 ? (
                      <AppText variant="caption" color="secondary" style={styles.contextText}>
                        {AppConfig.strings.dashboard.notifications.triggersCount(
                          insight.journalIds.length,
                        )}
                      </AppText>
                    ) : null}
                  </View>

                  <View style={[styles.footer, { borderTopColor: theme.border }]}>
                    <TouchableOpacity
                      onPress={() => handlePress(insight)}
                      style={[
                        styles.primaryCta,
                        { backgroundColor: withOpacity(severity.color, Opacity.hover) },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={getPrimaryActionLabel(insight.type)}
                    >
                      <AppText variant="caption" weight="medium" style={{ color: severity.color }}>
                        {getPrimaryActionLabel(insight.type)}
                      </AppText>
                      <AppIcon name="chevronRight" size={14} color={severity.color} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={e => {
                        e.stopPropagation();
                        onDismiss(insight.id);
                      }}
                      style={[styles.dismissPill, { backgroundColor: theme.surfaceSecondary }]}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss insight"
                    >
                      <AppIcon name="close" size={14} color={theme.textSecondary} />
                      <AppText variant="caption" color="secondary">
                        {AppConfig.strings.dashboard.hub.dismiss}
                      </AppText>
                    </TouchableOpacity>
                  </View>

                  <AppText
                    variant="caption"
                    color="secondary"
                    numberOfLines={1}
                    style={styles.tipText}
                  >
                    {AppConfig.strings.dashboard.notifications.nextStep}
                    {insight.suggestion}
                  </AppText>
                </Pressable>
              </AppCard>
            );
          })}
        </View>
      </View>

      <EmergencyFundPopupModal
        visible={isEmergencyFundInfoVisible}
        onClose={() => setEmergencyFundInfoVisible(false)}
        onCreateAccount={() => {
          setEmergencyFundInfoVisible(false);
          AppNavigation.toAccountCreation('ASSET');
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {},
  countChip: {
    minWidth: 28,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  card: {
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardPressable: {
    position: 'relative',
    padding: Spacing.md,
  },
  listContent: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  iconTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  headline: {
    flex: 1,
  },
  iconBadge: {
    width: Size.md,
    height: Size.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCard: {
    borderRadius: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  amountValue: {
    marginTop: Spacing.xs / 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  severityChip: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs / 2,
  },
  reason: {
    marginBottom: Spacing.sm,
    opacity: Opacity.medium,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  contextText: {
    opacity: Opacity.medium,
  },
  tipText: {
    marginTop: Spacing.sm,
    opacity: Opacity.medium,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  primaryCta: {
    borderRadius: Spacing.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 1,
  },
  dismissPill: {
    borderRadius: Spacing.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  managePill: {
    borderRadius: Spacing.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
