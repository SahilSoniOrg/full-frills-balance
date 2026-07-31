import { AppCard, AppIcon, IvyIcon } from '@/src/components/core';
import { AppConfig, Opacity, Size } from '@/src/constants';
import { ColorKey } from '@/src/constants/design-tokens';
import { Box, Column, Row, Text } from '@/src/design-system';
import { AccountType } from '@/src/data/models/Account';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import React, { useMemo } from 'react';
import { TouchableOpacity } from 'react-native';

interface AccountCardProps {
  account: AccountCardViewModel;
  isPrivacyMode: boolean;
  isLoading?: boolean;
  onPress: () => void;
  onCollapse?: () => void;
  dividerColor: ColorKey;
  surfaceColor: ColorKey;
}

function formatAmount(
  amount: number,
  currencyCode: string,
  isPrivacyMode: boolean,
  isLoading: boolean,
) {
  if (isLoading) return '...';
  if (isPrivacyMode) return AppConfig.privacyMask;
  return CurrencyFormatter.format(amount, currencyCode);
}

function getAccountStatsConfig(
  accountType: AccountType | undefined,
  monthlyIncomeText: string,
  monthlyExpenseText: string,
) {
  switch (accountType) {
    case AccountType.EXPENSE:
      return {
        leftLabel: 'MONTH SPENT',
        leftValue: monthlyExpenseText,
        rightLabel: 'REFUNDS / CREDITS',
        rightValue: monthlyIncomeText,
      };
    case AccountType.INCOME:
      return {
        leftLabel: 'MONTH EARNED',
        leftValue: monthlyIncomeText,
        rightLabel: 'ADJUSTMENTS',
        rightValue: monthlyExpenseText,
      };
    case AccountType.LIABILITY:
      return {
        leftLabel: 'PAYMENTS MADE',
        leftValue: monthlyExpenseText,
        rightLabel: 'NEW CHARGES',
        rightValue: monthlyIncomeText,
      };
    case AccountType.EQUITY:
      return {
        leftLabel: 'ADDITIONS',
        leftValue: monthlyIncomeText,
        rightLabel: 'REDUCTIONS',
        rightValue: monthlyExpenseText,
      };
    case AccountType.ASSET:
    default:
      return {
        leftLabel: 'MONEY IN',
        leftValue: monthlyIncomeText,
        rightLabel: 'MONEY OUT',
        rightValue: monthlyExpenseText,
      };
  }
}

export function AccountCardBase({
  account,
  isPrivacyMode,
  isLoading = false,
  onPress,
  onCollapse,
  dividerColor,
  surfaceColor,
}: AccountCardProps) {
  const { theme, fonts } = useTheme();
  const resolvedTextColor = resolveThemeColor(theme, account.textColor);

  const balanceText = useMemo(
    () => formatAmount(account.balance, account.currencyCode, isPrivacyMode, isLoading),
    [account.balance, account.currencyCode, isPrivacyMode, isLoading],
  );
  const monthlyIncomeText = useMemo(
    () => formatAmount(account.monthlyIncome, account.currencyCode, isPrivacyMode, isLoading),
    [account.monthlyIncome, account.currencyCode, isPrivacyMode, isLoading],
  );
  const monthlyExpenseText = useMemo(
    () => formatAmount(account.monthlyExpenses, account.currencyCode, isPrivacyMode, isLoading),
    [account.monthlyExpenses, account.currencyCode, isPrivacyMode, isLoading],
  );

  const stats = getAccountStatsConfig(account.accountType, monthlyIncomeText, monthlyExpenseText);

  return (
    <AppCard
      elevation="sm"
      padding="none"
      radius="r2"
      background={surfaceColor}
      style={{
        marginBottom: 12,
        marginLeft: account.depth * 16,
        opacity: account.depth > 0 ? 0.9 : 1,
      }}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={Opacity.heavy}>
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
                {balanceText}
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
                {stats.leftValue}
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
                {stats.rightValue}
              </Text>
            </Column>
          </Row>
        )}
      </TouchableOpacity>
    </AppCard>
  );
}

export const AccountCard = React.memo(AccountCardBase);
