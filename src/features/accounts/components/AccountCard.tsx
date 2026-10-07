import { LIST_SELECTION_LONG_PRESS_MS } from '@/src/constants/gesture-constants';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { SelectionIndicator } from '@/src/components/shared/SelectionIndicator';
import {
  Icon,
  AppCard,
  IconButton,
  IvyIcon,
  PressScaleTouchable,
  AppText,
} from '@/src/components/core';
import { ArchivedAccountIndicator } from '@/src/components/accounts/ArchivedAccountIndicator';
import { BorderWidth, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { ColorKey } from '@/src/constants/design-tokens';
import { Box, Column, Row } from '@/src/design-system';
import { AccountId } from '@/src/types/ids';

import { getAccountStatsConfig } from '@/src/features/accounts/helpers/accountFlowLabels';
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

function AccountCardBase({
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
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const formatMoney = useMoneyFormat({ loading: isLoading });
  const workplaceCurrencyCode = account.workplaceCurrencyCode ?? account.currencyCode;
  // The account color owns the card surface, so this contrast color is derived
  // from the account surface rather than the category marker.
  const resolvedTextColor = account.textColor;

  const stats = getAccountStatsConfig(
    account.accountType,
    account.monthlyIncome,
    account.monthlyExpenses,
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
      delayLongPress={LIST_SELECTION_LONG_PRESS_MS}
      accessibilityRole="button"
      accessibilityLabel={[
        account.name,
        `level ${Math.max(account.depth, 0) + 1}`,
        `balance ${formatMoney(account.balance, account.currencyCode)}`,
        account.workplaceBalance !== undefined && account.currencyCode !== workplaceCurrencyCode
          ? `approximately ${formatMoney(account.workplaceBalance, workplaceCurrencyCode)}`
          : null,
        account.isArchived ? 'Archived' : null,
        reconciledDateText ? `Reconciled ${reconciledDateText}` : null,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ selected: isSelected }}
      style={[
        styles.touchableWrapper,
        {
          marginBottom: Spacing.md,
          marginLeft: Math.max(account.depth, 0) * Spacing.sm,
          opacity: account.isArchived ? Opacity.medium : account.depth > 0 ? 0.9 : 1,
        },
      ]}
    >
      <AppCard
        testID="account-card"
        elevation="sm"
        paddingSize="none"
        radius="r2"
        background={surfaceColor}
        style={styles.cardContainer}
      >
        <Box
          unsafe_backgroundRaw={account.accountColor}
          paddingHorizontal="lg"
          paddingVertical="md"
          style={{ position: 'relative', overflow: 'hidden' }}
        >
          <Column gap="sm">
            <Row align="center" justify="space-between">
              <Row gap="sm" align="center" flex={1} style={{ minWidth: 0 }}>
                <View
                  style={[
                    styles.categoryIconFrame,
                    {
                      borderColor: account.categoryColor,
                      backgroundColor: categoryIconBg,
                    },
                  ]}
                >
                  <View style={styles.identityIcon}>
                    {isSelectionModeActive || isSelected ? (
                      <View
                        testID="account-card-selection-indicator"
                        accessibilityRole="checkbox"
                        accessibilityLabel={`${account.name} selected`}
                        accessibilityState={{ checked: isSelected }}
                      >
                        <SelectionIndicator selected={isSelected} borderColor={resolvedTextColor} />
                      </View>
                    ) : (
                      <IvyIcon
                        name={account.icon}
                        label={account.name}
                        color={account.textColor}
                        size={Size.avatarSm}
                      />
                    )}
                  </View>
                </View>
                <AppText
                  variant="body"
                  weight="bold"
                  style={{ color: resolvedTextColor, flex: 1, minWidth: 0 }}
                >
                  {account.name}
                </AppText>
                {account.isArchived ? <ArchivedAccountIndicator /> : null}
              </Row>

              <Row gap="xs" align="center" testID="account-card-header-actions">
                {account.hasChildren && (
                  <IconButton
                    name={account.isExpanded ? Icon.ChevronUp : Icon.Hierarchy}
                    size={Size.iconSm}
                    style={styles.actionButton}
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
                    accessibilityState={{ expanded: account.isExpanded }}
                  />
                )}
                {onActionPress && (
                  <View style={styles.actionButton}>
                    {!isSelectionModeActive && (
                      <IconButton
                        name={Icon.More}
                        size={Size.iconSm}
                        style={styles.actionButton}
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
                )}
              </Row>
            </Row>

            <Column align="center" justify="center" gap="xs">
              <AppText
                variant="title"
                fontRole="numeric"
                weight="semibold"
                tabular
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                style={{
                  color: resolvedTextColor,
                }}
              >
                {formatMoney(account.balance, account.currencyCode)}
              </AppText>
              {account.workplaceBalance !== undefined &&
                account.currencyCode !== workplaceCurrencyCode && (
                  <AppText variant="bodySmall" weight="medium" style={{ color: resolvedTextColor }}>
                    ≈ {formatMoney(account.workplaceBalance, workplaceCurrencyCode)}
                  </AppText>
                )}
            </Column>
          </Column>
        </Box>

        {account.showMonthlyStats && (
          <Row paddingHorizontal="lg" paddingVertical="sm" align="center" justify="space-between">
            <Column align="center" flex={1}>
              <AppText
                variant="caption"
                weight="medium"
                color="secondary"
                style={{ marginBottom: Spacing.xs }}
              >
                {stats.leftLabel}
              </AppText>
              <AppText variant="bodySmall" weight="semibold">
                {formatMoney(stats.leftAmount, account.currencyCode)}
              </AppText>
            </Column>

            <Box width={BorderWidth.thin} height={Size.md} background={dividerColor} />

            <Column align="center" flex={1}>
              <AppText
                variant="caption"
                weight="medium"
                color="secondary"
                style={{ marginBottom: Spacing.xs }}
              >
                {stats.rightLabel}
              </AppText>
              <AppText variant="bodySmall" weight="semibold">
                {formatMoney(stats.rightAmount, account.currencyCode)}
              </AppText>
            </Column>
          </Row>
        )}
        {isSelected ? (
          <View
            testID="account-card-selection-outline"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.selectionOutline, { borderColor: theme.primary }]}
          />
        ) : null}
      </AppCard>
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  touchableWrapper: {
    alignSelf: 'stretch',
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
  identityIcon: {
    width: Size.avatarSm,
    height: Size.avatarSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionOutline: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: BorderWidth.medium,
    borderRadius: Shape.radius.r2,
    borderCurve: 'continuous',
    zIndex: 10,
  },
  actionButton: {
    width: Size.touchTarget,
    height: Size.touchTarget,
  },
});

export const AccountCard = React.memo(AccountCardBase);
