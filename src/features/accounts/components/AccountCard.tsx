import { AppCard, AppIcon, IvyIcon } from '@/src/components/core';
import { Opacity, Size } from '@/src/constants';
import { ColorKey } from '@/src/constants/design-tokens';
import { Box, Column, Row, Text } from '@/src/design-system';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import React from 'react';
import { TouchableOpacity } from 'react-native';

interface AccountCardProps {
  account: AccountCardViewModel;
  onPress: () => void;
  onCollapse?: () => void;
  dividerColor: ColorKey;
  surfaceColor: ColorKey;
}

export function AccountCardBase({
  account,
  onPress,
  onCollapse,
  dividerColor,
  surfaceColor,
}: AccountCardProps) {
  const { theme, fonts } = useTheme();
  const resolvedTextColor = resolveThemeColor(theme, account.textColor);

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
                  name={account.icon || undefined}
                  fallbackIcon="wallet"
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
                {account.balanceText}
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
                MONTH INCOME
              </Text>
              <Text variant="sm" weight="bold">
                {account.monthlyIncomeText}
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
                MONTH EXPENSES
              </Text>
              <Text variant="sm" weight="bold">
                {account.monthlyExpenseText}
              </Text>
            </Column>
          </Row>
        )}
      </TouchableOpacity>
    </AppCard>
  );
}

export const AccountCard = React.memo(
  AccountCardBase,
  (prev, next) =>
    prev.account.id === next.account.id &&
    prev.account.balanceText === next.account.balanceText &&
    prev.account.isExpanded === next.account.isExpanded &&
    prev.account.monthlyIncomeText === next.account.monthlyIncomeText &&
    prev.account.monthlyExpenseText === next.account.monthlyExpenseText &&
    prev.account.reconciledAt?.getTime() === next.account.reconciledAt?.getTime() &&
    prev.surfaceColor === next.surfaceColor &&
    prev.dividerColor === next.dividerColor,
);
