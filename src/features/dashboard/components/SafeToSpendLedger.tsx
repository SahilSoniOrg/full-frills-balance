import { useStsMoneyFormat } from '@/src/components/shared/moneyFormat';
import {
  Icon,
  AppIcon,
  AppText,
  Badge,
  IconName,
  PressScaleTouchable,
} from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { formatAccountSubtypeLabel } from '@/src/types/accountSubtype';
import { Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { useDashboardFeatureActions } from '@/src/features/dashboard/hooks/useDashboardFeatureActions';
import { AccountSimulationSummary } from '@/src/services/simulation/types';
import { AccountSubtype } from '@/src/types/enums';
import { StyleSheet, View } from 'react-native';
import { SafeToSpendLabels } from '../types/SafeToSpendViewModel';

interface SafeToSpendLedgerProps {
  labels: SafeToSpendLabels;
  currencyCode: string;
  isLoading?: boolean;
  liquidAssetSubtypes: AccountSubtype[];
  accountSummaries?: AccountSimulationSummary[];
}

export const SafeToSpendLedger = ({
  labels,
  currencyCode,
  isLoading = false,
  liquidAssetSubtypes,
  accountSummaries,
}: SafeToSpendLedgerProps) => {
  const { theme } = useTheme();
  const formatSts = useStsMoneyFormat(isLoading);
  const { openAccount, openPlannedPayment } = useDashboardFeatureActions();

  return (
    <Stack gap="md">
      <Stack gap="sm">
        <AppText variant="overline" color="secondary">
          {labels.categoriesUsed}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
          {liquidAssetSubtypes.length > 0 ? (
            liquidAssetSubtypes.map((st, i) => (
              <Badge
                key={i}
                size="sm"
                variant="secondary"
                style={{ backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.strong) }}
              >
                {formatAccountSubtypeLabel(st)}
              </Badge>
            ))
          ) : (
            <AppText variant="caption" color="secondary" italic>
              {labels.noneDetectedYet}
            </AppText>
          )}
        </View>
      </Stack>

      <View style={{ gap: Spacing.sm, marginTop: Spacing.xs }}>
        <AppText variant="overline" color="secondary">
          {labels.accountsUsed}
        </AppText>
        <View style={{ gap: Spacing.xs }}>
          {(() => {
            const visibleAccounts = (accountSummaries || []).filter(
              acc => acc.startingBalance > 0 || acc.shortfall > 0 || acc.safeToSpend > 0,
            );

            if (visibleAccounts.length === 0) {
              return (
                <AppText variant="caption" color="secondary" italic>
                  {labels.noneDetectedYet}
                </AppText>
              );
            }

            return visibleAccounts.map((acc, i) => {
              const isShortfall = acc.shortfall > 0;
              const displayAmount = isShortfall ? acc.shortfall : acc.safeToSpend;
              const isZero = acc.startingBalance === 0;

              return (
                <View key={i} style={{ gap: Spacing.xs }}>
                  <View
                    style={[
                      styles.breakdownRow,
                      {
                        // errorLight is a token tint that keeps red and secondary text >= 4.5:1.
                        backgroundColor: isShortfall
                          ? theme.errorLight
                          : withOpacity(
                              theme.surfaceSecondary,
                              isZero ? Opacity.hover : Opacity.muted,
                            ),
                        paddingHorizontal: Spacing.sm,
                        paddingVertical: Spacing.xs,
                        borderRadius: Shape.radius.sm,
                        opacity: isZero ? Opacity.medium : Opacity.solid,
                        borderLeftWidth: isShortfall ? 2 : 0,
                        borderLeftColor: theme.error,
                      },
                    ]}
                  >
                    <PressScaleTouchable
                      style={{ flex: 1 }}
                      onPress={() => openAccount(acc, currencyCode)}
                      activeOpacity={Opacity.heavy}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <AppText variant="caption" weight="bold">
                          {acc.accountName}
                        </AppText>
                        <AppIcon name={Icon.ChevronRight} size={12} color={theme.textSecondary} />
                      </View>
                      <View
                        style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.xs }}
                      >
                        <AppText variant="caption" color="secondary">
                          Current: {formatSts(acc.startingBalance, currencyCode)}
                        </AppText>
                        <AppText
                          variant="caption"
                          color="secondary"
                          style={{ opacity: Opacity.medium }}
                        >
                          •
                        </AppText>
                        <AppText variant="caption" color="secondary">
                          Floor: {formatSts(acc.minBalance, currencyCode)}
                        </AppText>
                      </View>
                    </PressScaleTouchable>
                    <View style={{ alignItems: 'flex-end' }}>
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={isShortfall ? 'error' : 'primary'}
                        tabular
                      >
                        {isShortfall ? '-' : ''}
                        {formatSts(displayAmount, currencyCode)}
                      </AppText>
                      <AppText variant="overline" weight="regular" color="secondary" align="right">
                        {isShortfall
                          ? AppConfig.strings.dashboard.shortfall
                          : AppConfig.strings.dashboard.safeToSpendTitle}
                      </AppText>
                    </View>
                  </View>

                  {/* Usage Details */}
                  {acc.usageDetails &&
                    (acc.usageDetails.totalInflow > 0 || acc.usageDetails.totalOutflow > 0) && (
                      <View
                        style={{
                          paddingLeft: Spacing.md,
                          gap: 5,
                          marginBottom: Spacing.xs,
                          marginTop: 6,
                        }}
                      >
                        {acc.usageDetails.topOutflows.map((item, ii) => {
                          let icon: IconName = Icon.ArrowDown;
                          if (item.source === 'BUDGET') icon = Icon.PieChart;
                          else if (item.source === 'PLANNED_PAYMENT') icon = Icon.Calendar;
                          else if (item.source === 'LIABILITY') icon = Icon.CreditCard;

                          return (
                            <View
                              key={ii}
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <PressScaleTouchable
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 10,
                                  flex: 1,
                                }}
                                onPress={() => {
                                  if (item.id && item.source === 'PLANNED_PAYMENT') {
                                    openPlannedPayment(item.id, 'ledger_usage');
                                  }
                                }}
                                disabled={!item.id || item.source !== 'PLANNED_PAYMENT'}
                                activeOpacity={Opacity.medium}
                              >
                                <AppIcon
                                  name={icon}
                                  size={12}
                                  color={theme.textSecondary}
                                  strokeWidth={1.5}
                                />
                                <View
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                >
                                  <AppText variant="caption" color="secondary" numberOfLines={1}>
                                    {item.name}
                                  </AppText>
                                  {item.id && item.source === 'PLANNED_PAYMENT' && (
                                    <AppIcon
                                      name={Icon.ChevronRight}
                                      size={12}
                                      color={theme.textSecondary}
                                    />
                                  )}
                                  {item.isPostIncome && (
                                    <AppText variant="caption" color="primary" weight="bold">
                                      (Post-payday)
                                    </AppText>
                                  )}
                                </View>
                              </PressScaleTouchable>
                              <AppText variant="caption" color="secondary" tabular>
                                {formatSts(item.amount, currencyCode, { prefix: '-' })}
                              </AppText>
                            </View>
                          );
                        })}
                        {acc.usageDetails.topInflows.map((item, ii) => (
                          <View
                            key={ii}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 10,
                                flex: 1,
                              }}
                            >
                              <AppIcon
                                name={Icon.TrendingUp}
                                size={12}
                                color={theme.textSecondary}
                                strokeWidth={1.5}
                              />
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <AppText variant="caption" color="secondary" numberOfLines={1}>
                                  {item.name}
                                </AppText>
                                {item.isPostIncome && (
                                  <AppText variant="caption" color="primary" weight="bold">
                                    (Payday)
                                  </AppText>
                                )}
                              </View>
                            </View>
                            <AppText variant="caption" color="secondary" tabular>
                              {formatSts(item.amount, currencyCode, { prefix: '+' })}
                            </AppText>
                          </View>
                        ))}
                      </View>
                    )}
                </View>
              );
            });
          })()}
        </View>
      </View>
    </Stack>
  );
};

const styles = StyleSheet.create({
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
