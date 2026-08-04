import { useStsMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppIcon, AppText, Badge, IconName } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { AccountSubtype, formatAccountSubtypeLabel } from '@/src/data/models/Account';
import { Stack, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
import { AccountSimulationSummary } from '@/src/services/simulation/types';
import { PlannedPaymentId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
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

  return (
    <Stack gap="md">
      <Stack gap="sm">
        <Text
          variant="xs"
          weight="bold"
          color="secondary"
          style={{ textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 10 }}
        >
          {labels.categoriesUsed}
        </Text>
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
            <Text variant="xs" color="secondary" italic>
              {labels.noneDetectedYet}
            </Text>
          )}
        </View>
      </Stack>

      <View style={{ gap: Spacing.sm, marginTop: Spacing.xs }}>
        <AppText
          variant="caption"
          weight="bold"
          color="secondary"
          style={{ textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 10 }}
        >
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
                        backgroundColor: withOpacity(
                          isShortfall ? theme.error : theme.surfaceSecondary,
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
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        analytics.trackFeatureUsage('safe_to_spend', 'account_viewed', {
                          id: acc.accountId,
                        });
                        AppNavigation.toAccountDetails(acc.accountId);
                      }}
                      activeOpacity={Opacity.heavy}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <AppText variant="caption" weight="bold">
                          {acc.accountName}
                        </AppText>
                        <AppIcon
                          name="chevronRight"
                          size={10}
                          color={theme.textSecondary}
                          style={{ opacity: Opacity.medium }}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                        <AppText variant="caption" color="secondary" style={{ fontSize: 9 }}>
                          Current: {formatSts(acc.startingBalance, currencyCode)}
                        </AppText>
                        <AppText
                          variant="caption"
                          color="secondary"
                          style={{ fontSize: 9, opacity: Opacity.medium }}
                        >
                          •
                        </AppText>
                        <AppText variant="caption" color="secondary" style={{ fontSize: 9 }}>
                          Floor: {formatSts(acc.minBalance, currencyCode)}
                        </AppText>
                      </View>
                    </TouchableOpacity>
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
                      <AppText
                        variant="caption"
                        color="secondary"
                        style={{ fontSize: 8, textTransform: 'uppercase' }}
                      >
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
                          let icon: IconName = 'arrowDown';
                          if (item.source === 'BUDGET') icon = 'pieChart';
                          else if (item.source === 'PLANNED_PAYMENT') icon = 'calendar';
                          else if (item.source === 'LIABILITY') icon = 'creditCard';

                          return (
                            <View
                              key={ii}
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                opacity: Opacity.heavy,
                              }}
                            >
                              <TouchableOpacity
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 10,
                                  flex: 1,
                                }}
                                onPress={() => {
                                  if (item.id && item.source === 'PLANNED_PAYMENT') {
                                    analytics.trackFeatureUsage(
                                      'safe_to_spend',
                                      'planned_payment_viewed',
                                      {
                                        id: item.id,
                                        source: 'ledger_usage',
                                      },
                                    );
                                    AppNavigation.toPlannedPaymentDetails(
                                      item.id as PlannedPaymentId,
                                    );
                                  }
                                }}
                                disabled={!item.id || item.source !== 'PLANNED_PAYMENT'}
                                activeOpacity={Opacity.medium}
                              >
                                <AppIcon
                                  name={icon}
                                  size={11}
                                  color={theme.textSecondary}
                                  strokeWidth={1.2}
                                />
                                <View
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                >
                                  <AppText
                                    style={{
                                      fontSize: 9,
                                      color: theme.textSecondary,
                                      letterSpacing: 0.1,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {item.name}
                                  </AppText>
                                  {item.id && item.source === 'PLANNED_PAYMENT' && (
                                    <AppIcon
                                      name="chevronRight"
                                      size={8}
                                      color={theme.textSecondary}
                                      style={{ opacity: Opacity.muted }}
                                    />
                                  )}
                                  {item.isPostIncome && (
                                    <AppText
                                      style={{ fontSize: 8.5, color: theme.primary }}
                                      weight="bold"
                                    >
                                      (Post-payday)
                                    </AppText>
                                  )}
                                </View>
                              </TouchableOpacity>
                              <AppText
                                variant="caption"
                                color="secondary"
                                tabular
                                style={{ fontSize: 9 }}
                              >
                                -{formatSts(item.amount, currencyCode)}
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
                              opacity: Opacity.heavy,
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
                                name="trendingUp"
                                size={11}
                                color={theme.textSecondary}
                                strokeWidth={1.2}
                              />
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <AppText
                                  style={{
                                    fontSize: 9,
                                    color: theme.textSecondary,
                                    letterSpacing: 0.1,
                                  }}
                                  numberOfLines={1}
                                >
                                  {item.name}
                                </AppText>
                                {item.isPostIncome && (
                                  <AppText
                                    style={{ fontSize: 8.5, color: theme.primary }}
                                    weight="bold"
                                  >
                                    (Payday)
                                  </AppText>
                                )}
                              </View>
                            </View>
                            <AppText
                              variant="caption"
                              color="secondary"
                              tabular
                              style={{ fontSize: 9 }}
                            >
                              +{formatSts(item.amount, currencyCode)}
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
