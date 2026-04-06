import { AppIcon, AppText, Badge } from '@/src/components/core';
import { Shape, Spacing, withOpacity } from '@/src/constants';
import { AccountSubtype, formatAccountSubtypeLabel } from '@/src/data/models/Account';
import { Stack, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountSimulationSummary } from '@/src/services/simulation/types';
import { AppNavigation } from '@/src/utils/navigation';
import { analytics } from '@/src/services/analytics-service';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface SafeToSpendLedgerProps {
  labels: any;
  formatValue: (val: number) => string | React.ReactNode;
  liquidAssetSubtypes: AccountSubtype[];
  accountSummaries?: AccountSimulationSummary[];
}

export const SafeToSpendLedger = ({
  labels,
  formatValue,
  liquidAssetSubtypes,
  accountSummaries,
}: SafeToSpendLedgerProps) => {
  const { theme } = useTheme();

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
                style={{ backgroundColor: withOpacity(theme.surfaceSecondary, 0.8) }}
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
                          isZero ? 0.1 : 0.4,
                        ),
                        paddingHorizontal: Spacing.sm,
                        paddingVertical: Spacing.xs,
                        borderRadius: Shape.radius.sm,
                        opacity: isZero ? 0.6 : 1,
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
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <AppText variant="caption" weight="bold">
                          {acc.accountName}
                        </AppText>
                        <AppIcon
                          name="chevronRight"
                          size={10}
                          color={theme.textSecondary}
                          style={{ opacity: 0.5 }}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                        <AppText variant="caption" color="secondary" style={{ fontSize: 9 }}>
                          Current: {formatValue(acc.startingBalance)}
                        </AppText>
                        <AppText
                          variant="caption"
                          color="secondary"
                          style={{ fontSize: 9, opacity: 0.5 }}
                        >
                          •
                        </AppText>
                        <AppText variant="caption" color="secondary" style={{ fontSize: 9 }}>
                          Floor: {formatValue(acc.minBalance)}
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
                        {formatValue(displayAmount)}
                      </AppText>
                      <AppText
                        variant="caption"
                        color="secondary"
                        style={{ fontSize: 8, textTransform: 'uppercase' }}
                      >
                        {isShortfall ? 'Shortfall' : 'Safe to Spend'}
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
                          let icon = 'arrowDown' as any;
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
                                opacity: 0.7,
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
                                    AppNavigation.toPlannedPaymentDetails(item.id);
                                  }
                                }}
                                disabled={!item.id || item.source !== 'PLANNED_PAYMENT'}
                                activeOpacity={0.6}
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
                                      style={{ opacity: 0.4 }}
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
                                -{formatValue(item.amount)}
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
                              opacity: 0.7,
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
                              +{formatValue(item.amount)}
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
