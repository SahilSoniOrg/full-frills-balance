import { MoneyText } from '@/src/components/shared/MoneyText';
import { Icon, AppCard, AppIcon, AppText, PressScaleTouchable } from '@/src/components/core';
import { ScreenSectionHeader } from '@/src/components/shared/ScreenSectionHeader';
import { AppConfig, Opacity, Size, Spacing } from '@/src/constants';
import { Inline } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import { resolveInsightSeverityPresentation } from '@/src/features/hub/helpers/insightSeverityChrome';
import { insightTypePresentation } from '@/src/features/hub/helpers/insightTypePresentation';
import { useTheme } from '@/src/hooks/use-theme';
import type { Insight } from '@/src/services/insight/insightTypes';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { EmergencyFundPopupModal } from './EmergencyFundPopupModal';

interface HubWidgetProps {
  insights: Insight[];
  currencyCode: string;
  onDismiss: (id: string) => void;
  onOpenInsight: (insight: Insight) => void;
  onCreateEmergencyAccount: () => void;
  onManageDismissed?: () => void;
  hideManageDismissed?: boolean;
}

export const HubWidget = ({
  insights,
  currencyCode,
  onDismiss,
  onOpenInsight,
  onCreateEmergencyAccount,
  onManageDismissed,
  hideManageDismissed = false,
}: HubWidgetProps) => {
  const { theme, fonts } = useTheme();

  const [isEmergencyFundInfoVisible, setEmergencyFundInfoVisible] = React.useState(false);

  const isEmergencyFundInsight = (insight: Insight) => insight.id === 'no_emergency_fund';

  const handleOpenInsightDetails = (insight: Insight) => {
    onOpenInsight(insight);
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
    onManageDismissed?.();
  };

  const hubSeverityLabels = {
    high: AppConfig.strings.alerts.validationError,
    medium: AppConfig.strings.alerts.warning,
    low: AppConfig.strings.alerts.info,
  };

  return (
    <>
      <View style={styles.container}>
        <ScreenSectionHeader
          title={AppConfig.strings.dashboard.insightsTitle}
          style={styles.titleRow}
          action={
            <Inline gap="sm" align="center">
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
              {!hideManageDismissed ? (
                <PressScaleTouchable
                  pressScale="subtle"
                  onPress={handleManageDismissed}
                  style={[styles.managePill, { backgroundColor: theme.surfaceSecondary }]}
                  accessibilityRole="button"
                  accessibilityLabel="Manage dismissed notifications"
                >
                  <AppIcon name={Icon.History} size={Size.iconXs} color={theme.textSecondary} />
                  <AppText variant="caption" color="secondary">
                    {AppConfig.strings.dashboard.manageDismissed}
                  </AppText>
                </PressScaleTouchable>
              ) : null}
            </Inline>
          }
        />
        <View style={styles.listContent}>
          {insights.map(insight => {
            const presentation = insightTypePresentation(insight.type);
            if (insight.type === 'app-update' && insight.updateReady)
              presentation.actionLabel = AppConfig.strings.update.restart;
            const severity = resolveInsightSeverityPresentation(
              insight.severity,
              theme,
              hubSeverityLabels,
            );
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
                <View style={styles.cardPressable}>
                  <PressScaleTouchable
                    pressScale="subtle"
                    onPress={() => handlePress(insight)}
                    accessibilityRole="button"
                  >
                    <View style={styles.metaRow}>
                      <View style={[styles.severityChip, { backgroundColor: severity.chipBg }]}>
                        <AppIcon name={Icon.Alert} size={Size.xxs} color={severity.color} />
                        <AppText
                          variant="caption"
                          weight="medium"
                          style={{ color: severity.color }}
                        >
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
                          <AppIcon name={presentation.icon} size={Size.xs} color={severity.color} />
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
                        <AppText
                          variant="caption"
                          weight="medium"
                          style={{ color: severity.color }}
                        >
                          {AppConfig.strings.dashboard.notifications.impact}
                        </AppText>
                        <MoneyText
                          amount={insight.amount}
                          currencyCode={insight.currencyCode || currencyCode}
                          variant="subheading"
                          style={[
                            styles.amountValue,
                            { color: severity.color, fontFamily: fonts.bold },
                          ]}
                        />
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

                    {insight.context ? (
                      <View style={styles.contextRow}>
                        {insight.context.basis?.kind === 'lookback' ? (
                          <AppText variant="caption" color="secondary" numberOfLines={1}>
                            {AppConfig.strings.dashboard.notifications.basedOnLastDays(
                              insight.context.basis.days,
                            )}
                          </AppText>
                        ) : null}
                        {insight.context.triggersCount ? (
                          <AppText variant="caption" color="secondary">
                            {AppConfig.strings.dashboard.notifications.triggersCount(
                              insight.context.triggersCount,
                            )}
                          </AppText>
                        ) : null}
                      </View>
                    ) : null}
                  </PressScaleTouchable>

                  <View style={[styles.footer, { borderTopColor: theme.border }]}>
                    <PressScaleTouchable
                      pressScale="subtle"
                      onPress={() => handlePress(insight)}
                      style={[
                        styles.primaryCta,
                        { backgroundColor: withOpacity(severity.color, Opacity.hover) },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={presentation.actionLabel}
                    >
                      <AppText variant="caption" weight="medium" style={{ color: severity.color }}>
                        {presentation.actionLabel}
                      </AppText>
                      <AppIcon name={Icon.ChevronRight} size={Size.iconXs} color={severity.color} />
                    </PressScaleTouchable>

                    {presentation.dismissible ? (
                      <PressScaleTouchable
                        pressScale="subtle"
                        onPress={() => onDismiss(insight.id)}
                        style={[styles.dismissPill, { backgroundColor: theme.surfaceSecondary }]}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss insight"
                      >
                        <AppIcon name={Icon.Close} size={Size.iconXs} color={theme.textSecondary} />
                        <AppText variant="caption" color="secondary">
                          {AppConfig.strings.dashboard.hub.dismiss}
                        </AppText>
                      </PressScaleTouchable>
                    ) : null}
                  </View>

                  <AppText
                    variant="caption"
                    color="secondary"
                    numberOfLines={2}
                    style={styles.tipText}
                  >
                    {AppConfig.strings.dashboard.notifications.nextStep}
                    {insight.suggestion}
                  </AppText>
                </View>
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
          onCreateEmergencyAccount();
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  titleRow: {
    marginBottom: Spacing.md,
  },
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
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tipText: {
    marginTop: Spacing.sm,
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
