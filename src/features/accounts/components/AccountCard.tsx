import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppCard, AppIcon, IvyIcon } from '@/src/components/core';
import { Opacity, Size } from '@/src/constants';
import { ColorKey } from '@/src/constants/design-tokens';
import { Box, Column, Row, Text } from '@/src/design-system';
import { AccountType } from '@/src/types/domain';

import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { ArchivedAccountIndicator } from '@/src/features/accounts/components/ArchivedAccountIndicator';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import React from 'react';
import { TouchableOpacity } from 'react-native';

interface AccountCardProps {
  account: AccountCardViewModel;
  isLoading?: boolean;
  onPress: () => void;
  onCollapse?: () => void;
  dividerColor: ColorKey;
  surfaceColor: ColorKey;
}

function getAccountStatsConfig(
  accountType: AccountType | undefined,
  monthlyIncome: number,
  monthlyExpense: number,
) {
  switch (accountType) {
    case AccountType.EXPENSE:
      return {
        leftLabel: 'MONTH SPENT',
        leftAmount: monthlyExpense,
        rightLabel: 'REFUNDS / CREDITS',
        rightAmount: monthlyIncome,
      };
    case AccountType.INCOME:
      return {
        leftLabel: 'MONTH EARNED',
        leftAmount: monthlyIncome,
        rightLabel: 'ADJUSTMENTS',
        rightAmount: monthlyExpense,
      };
    case AccountType.LIABILITY:
      return {
        leftLabel: 'PAYMENTS MADE',
        leftAmount: monthlyExpense,
        rightLabel: 'NEW CHARGES',
        rightAmount: monthlyIncome,
      };
    case AccountType.EQUITY:
      return {
        leftLabel: 'ADDITIONS',
        leftAmount: monthlyIncome,
        rightLabel: 'REDUCTIONS',
        rightAmount: monthlyExpense,
      };
    case AccountType.ASSET:
    default:
      return {
        leftLabel: 'MONEY IN',
        leftAmount: monthlyIncome,
        rightLabel: 'MONEY OUT',
        rightAmount: monthlyExpense,
      };
  }
}

export function AccountCardBase({
  account,
  isLoading = false,
  onPress,
  onCollapse,
  dividerColor,
  surfaceColor,
}: AccountCardProps) {
  const { theme, fonts } = useTheme();
  const formatMoney = useMoneyFormat({ loading: isLoading });
  const resolvedTextColor = resolveThemeColor(theme, account.textColor);

  const stats = getAccountStatsConfig(
    account.accountType,
    account.monthlyIncome,
    account.monthlyExpenses,
  );

  return (
    <AppCard
      elevation="sm"
      paddingSize="none"
      radius="r2"
      background={surfaceColor}
      style={{
        marginBottom: 12,
        marginLeft: account.depth * 16,
        opacity: account.depth > 0 ? 0.9 : 1,
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={Opacity.heavy}
        style={{ opacity: account.isArchived ? Opacity.medium : 1 }}
      >
        <Box unsafe_backgroundRaw={account.accentColor} padding="lg">
          <Column gap="md">
            <Row align="center" justify="space-between">
              <Row gap="md" align="center" flex={1}>
                <IvyIcon
                  name={account.icon}
                  label={account.name}
                  color={account.textColor}
                  size={Size.avatarSm}
                />
                <Text
                  variant="base"
                  weight="bold"
                  numberOfLines={1}
                  style={{ color: resolvedTextColor, flex: 1 }}
                >
                  {account.name}
                </Text>
                {account.isArchived ? <ArchivedAccountIndicator /> : null}
              </Row>

              <Row gap="sm" align="center">
                {account.reconciledAt && (
                  <Row
                    background="pureInverse"
                    backgroundOpacity="soft"
                    paddingHorizontal="sm"
                    paddingVertical="xs"
                    borderRadius="sm"
                    align="center"
                    gap="xs"
                  >
                    <AppIcon name="shieldCheck" color={account.textColor} size={Size.iconXs} />
                    <Text
                      weight="medium"
                      variant="xs"
                      opacity={0.7}
                      style={{ color: resolvedTextColor, lineHeight: 12 }}
                    >
                      {formatRelativeReconciledDate(account.reconciledAt)}
                    </Text>
                  </Row>
                )}
                {account.hasChildren && (
                  <Box>
                    {account.isExpanded ? (
                      <TouchableOpacity
                        onPress={e => {
                          e.stopPropagation();
                          onCollapse?.();
                        }}
                        style={{ padding: 4, marginRight: -4 }}
                      >
                        <AppIcon name="chevronUp" color={account.textColor} size={Size.iconSm} />
                      </TouchableOpacity>
                    ) : (
                      <IvyIcon name="hierarchy" color={account.textColor} size={Size.iconXs} />
                    )}
                  </Box>
                )}
              </Row>
            </Row>

            <Column align="center" justify="center" paddingVertical="md">
              <Text
                variant="xxxl"
                weight="bold"
                style={{
                  color: resolvedTextColor,
                  fontFamily: fonts.bold,
                }}
              >
                {formatMoney(account.balance, account.currencyCode)}
              </Text>
            </Column>
          </Column>
        </Box>

        {account.showMonthlyStats && (
          <Row paddingHorizontal="lg" paddingVertical="md" align="center" justify="space-between">
            <Column align="center" flex={1}>
              <Text
                variant="xs"
                weight="bold"
                color="secondary"
                opacity={0.6}
                style={{ marginBottom: 4, letterSpacing: 0.5 }}
              >
                {stats.leftLabel}
              </Text>
              <Text variant="sm" weight="bold">
                {formatMoney(stats.leftAmount, account.currencyCode)}
              </Text>
            </Column>

            <Box width={1} height={24} background={dividerColor} />

            <Column align="center" flex={1}>
              <Text
                variant="xs"
                weight="bold"
                color="secondary"
                opacity={0.6}
                style={{ marginBottom: 4, letterSpacing: 0.5 }}
              >
                {stats.rightLabel}
              </Text>
              <Text variant="sm" weight="bold">
                {formatMoney(stats.rightAmount, account.currencyCode)}
              </Text>
            </Column>
          </Row>
        )}
      </TouchableOpacity>
    </AppCard>
  );
}

export const AccountCard = React.memo(AccountCardBase);
