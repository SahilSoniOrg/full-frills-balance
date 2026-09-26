import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import {
  Icon,
  AppCard,
  AppIcon,
  IconButton,
  IvyIcon,
  PressScaleTouchable,
} from '@/src/components/core';
import { ArchivedAccountIndicator } from '@/src/components/accounts/ArchivedAccountIndicator';
import { BorderWidth, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { ColorKey } from '@/src/constants/design-tokens';
import { Box, Column, Row, Text } from '@/src/design-system';
import { AccountId } from '@/src/types/ids';

import { getAccountStatsConfig } from '@/src/features/accounts/helpers/accountCardStatsConfig';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { withOpacity } from '@/src/utils/color-math';

interface AccountCardProps {
  account: AccountCardViewModel;
  isLoading?: boolean;
  onPress: (id: AccountId) => void;
  onLongPress?: (account: AccountCardViewModel) => void;
  onActionPress?: (account: AccountCardViewModel) => void;
  onCollapse?: (id: AccountId) => void;
  dividerColor: ColorKey;
  surfaceColor: ColorKey;
  isSelected?: boolean;
  isSelectionModeActive?: boolean;
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
  const { resolvedHourCycle } = useHourCyclePrefs();
  const formatMoney = useMoneyFormat({ loading: isLoading });
  const workplaceCurrencyCode = account.workplaceCurrencyCode ?? account.currencyCode;
  // The account color owns the card surface, so this contrast color is derived
  // from the account surface rather than the category marker.
  const resolvedTextColor = account.textColor;

  const stats = useMemo(
    () =>
      getAccountStatsConfig(account.accountType, account.monthlyIncome, account.monthlyExpenses),
    [account.accountType, account.monthlyIncome, account.monthlyExpenses],
  );

  const categoryIconBg = account.categoryIconBg || withOpacity(account.categoryColor, Opacity.soft);

  const reconciledDateText = useMemo(
    () =>
      account.reconciledAt
        ? formatRelativeReconciledDate(account.reconciledAt, resolvedHourCycle)
        : null,
    [account.reconciledAt, resolvedHourCycle],
  );

  return (
    <PressScaleTouchable
      onPress={() => onPress(account.id)}
      onLongPress={onLongPress ? () => onLongPress(account) : undefined}
      accessibilityRole="button"
      accessibilityLabel={account.name}
      style={[
        styles.touchableWrapper,
        {
          marginBottom: Spacing.md,
          marginLeft: account.depth * Spacing.lg,
          opacity: account.isArchived ? Opacity.medium : account.depth > 0 ? 0.9 : 1,
        },
      ]}
    >
      <AppCard
        elevation="sm"
        paddingSize="none"
        radius="r2"
        background={surfaceColor}
        style={[
          styles.cardContainer,
          {
            borderWidth: isSelected ? BorderWidth.medium : 0,
            borderColor: isSelected ? theme.primary : 'transparent',
          },
        ]}
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
                      backgroundColor: categoryIconBg,
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
                {reconciledDateText && !isSelectionModeActive && (
                  <Row
                    background="pureInverse"
                    backgroundOpacity="soft"
                    paddingHorizontal="sm"
                    paddingVertical="xs"
                    borderRadius="full"
                    align="center"
                    gap="xs"
                  >
                    <AppIcon name={Icon.ShieldCheck} color={resolvedTextColor} size={Size.iconXs} />
                    <Text
                      weight="medium"
                      variant="xs"
                      opacity={0.8}
                      style={{ color: resolvedTextColor, lineHeight: 12 }}
                    >
                      {reconciledDateText}
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
                    {isSelected && (
                      <AppIcon name={Icon.Check} size={Size.xxs} color={theme.onPrimary} />
                    )}
                  </View>
                )}
              </Row>
            </Row>

            <Column align="center" justify="center" paddingVertical="md" gap="xs">
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
              {account.workplaceBalance !== undefined &&
                account.currencyCode !== workplaceCurrencyCode && (
                  <Text
                    variant="sm"
                    weight="medium"
                    opacity={0.8}
                    style={{ color: resolvedTextColor }}
                  >
                    ≈ {formatMoney(account.workplaceBalance, workplaceCurrencyCode)}
                  </Text>
                )}
            </Column>
          </Column>

          {/* Bottom right actions / hierarchy */}
          <View style={styles.bottomActionsOverlay}>
            {account.hasChildren && (
              <IconButton
                name={account.isExpanded ? Icon.ChevronUp : Icon.Hierarchy}
                size={Size.iconSm}
                variant="clear"
                onPress={event => {
                  event?.stopPropagation?.();
                  onCollapse?.(account.id);
                }}
                iconColor={resolvedTextColor}
                accessibilityLabel={
                  account.isExpanded
                    ? `Collapse sub-accounts for ${account.name}`
                    : `Expand sub-accounts for ${account.name}`
                }
              />
            )}
            {onActionPress && !isSelectionModeActive && (
              <IconButton
                name={Icon.More}
                size={Size.iconSm}
                variant="clear"
                onPress={event => {
                  event?.stopPropagation?.();
                  onActionPress(account);
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
                style={{ marginBottom: Spacing.xs, letterSpacing: 0.5 }}
              >
                {stats.leftLabel}
              </Text>
              <Text variant="sm" weight="bold">
                {formatMoney(stats.leftAmount, account.currencyCode)}
              </Text>
            </Column>

            <Box width={BorderWidth.thin} height={Size.md} background={dividerColor} />

            <Column align="center" flex={1}>
              <Text
                variant="xs"
                weight="bold"
                color="secondary"
                opacity={0.6}
                style={{ marginBottom: Spacing.xs, letterSpacing: 0.5 }}
              >
                {stats.rightLabel}
              </Text>
              <Text variant="sm" weight="bold">
                {formatMoney(stats.rightAmount, account.currencyCode)}
              </Text>
            </Column>
          </Row>
        )}
      </AppCard>
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  touchableWrapper: {
    width: '100%',
  },
  cardContainer: {
    overflow: 'hidden',
  },
  categoryIconFrame: {
    padding: Spacing.xs,
    borderWidth: BorderWidth.medium,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicator: {
    width: Size.md,
    height: Size.md,
    borderRadius: Shape.radius.full,
    borderWidth: BorderWidth.medium,
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
