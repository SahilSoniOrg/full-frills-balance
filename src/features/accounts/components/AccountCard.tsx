import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppCard, AppIcon, IconButton, IvyIcon } from '@/src/components/core';
import { ArchivedAccountIndicator } from '@/src/components/common/ArchivedAccountIndicator';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import { ColorKey } from '@/src/constants/design-tokens';
import { Box, Column, Row, Text } from '@/src/design-system';
import { AccountType } from '@/src/types/domain';

import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { withOpacity } from '@/src/utils/color-math';

interface AccountCardProps {
  account: AccountCardViewModel;
  isLoading?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onActionPress?: () => void;
  onCollapse?: () => void;
  dividerColor: ColorKey;
  surfaceColor: ColorKey;
  isSelected?: boolean;
  isSelectionModeActive?: boolean;
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
  onLongPress,
  onActionPress,
  onCollapse,
  dividerColor,
  surfaceColor,
  isSelected = false,
  isSelectionModeActive = false,
}: AccountCardProps) {
  const { fonts, theme } = useTheme();
  const formatMoney = useMoneyFormat({ loading: isLoading });
  // The account color owns the card surface, so this contrast color is derived
  // from the account surface rather than the category marker.
  const resolvedTextColor = account.textColor;

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
      style={[
        {
          marginBottom: Spacing.md,
          marginLeft: account.depth * Spacing.lg,
          opacity: account.depth > 0 ? 0.9 : 1,
        },
        isSelected && {
          borderColor: theme.primary,
          borderWidth: 2,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={Opacity.heavy}
        style={{ opacity: account.isArchived ? Opacity.medium : 1 }}
      >
        <Box
          unsafe_backgroundRaw={account.accountColor}
          padding="lg"
          style={{ position: 'relative', overflow: 'hidden' }}
        >
          <Column gap="md">
            <Row align="center" justify="space-between">
              <Row gap="md" align="center" flex={1}>
                <View
                  style={[
                    styles.categoryIconFrame,
                    {
                      borderColor: account.categoryColor,
                      backgroundColor: withOpacity(account.categoryColor, Opacity.soft),
                    },
                  ]}
                >
                  <IvyIcon
                    name={account.icon}
                    label={account.name}
                    color={account.textColor}
                    size={Size.avatarSm}
                  />
                </View>
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

              <Row gap="xs" align="center">
                {account.reconciledAt && !isSelectionModeActive && (
                  <Row
                    background="pureInverse"
                    backgroundOpacity="soft"
                    paddingHorizontal="sm"
                    paddingVertical="xs"
                    borderRadius="full"
                    align="center"
                    gap="xs"
                  >
                    <AppIcon name="shieldCheck" color={resolvedTextColor} size={Size.iconXs} />
                    <Text
                      weight="medium"
                      variant="xs"
                      opacity={0.8}
                      style={{ color: resolvedTextColor, lineHeight: 12 }}
                    >
                      {formatRelativeReconciledDate(account.reconciledAt)}
                    </Text>
                  </Row>
                )}
                {isSelectionModeActive && (
                  <View
                    testID="account-card-selection-indicator"
                    style={[
                      styles.selectionIndicator,
                      {
                        borderColor: isSelected
                          ? theme.primary
                          : withOpacity(resolvedTextColor, Opacity.medium),
                        backgroundColor: isSelected ? theme.primary : 'transparent',
                      },
                    ]}
                  >
                    {isSelected && <AppIcon name="check" size={12} color={theme.onPrimary} />}
                  </View>
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

          {/* Bottom right actions / hierarchy */}
          <View style={styles.bottomActionsOverlay}>
            {account.hasChildren && (
              <TouchableOpacity
                onPress={event => {
                  event.stopPropagation();
                  onCollapse?.();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={
                  account.isExpanded
                    ? `Collapse sub-accounts for ${account.name}`
                    : `Expand sub-accounts for ${account.name}`
                }
              >
                <IvyIcon
                  name={account.isExpanded ? 'chevronUp' : 'hierarchy'}
                  color={resolvedTextColor}
                  size={Size.iconSm}
                />
              </TouchableOpacity>
            )}
            {onActionPress && !isSelectionModeActive && (
              <IconButton
                name="more"
                size={Size.iconSm}
                variant="clear"
                onPress={event => {
                  event?.stopPropagation?.();
                  onActionPress();
                }}
                iconColor={resolvedTextColor}
                accessibilityLabel={`Actions for ${account.name}`}
              />
            )}
          </View>
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

const styles = StyleSheet.create({
  categoryIconFrame: {
    padding: Spacing.xs,
    borderWidth: 2,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicator: {
    width: 22,
    height: 22,
    borderRadius: Shape.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.xs,
  },
  bottomActionsOverlay: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});

export const AccountCard = React.memo(AccountCardBase);
