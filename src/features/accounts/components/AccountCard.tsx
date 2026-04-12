import { AppCard, AppIcon, AppText, IvyIcon } from '@/src/components/core';
import { Opacity, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

interface AccountCardProps {
  account: AccountCardViewModel;
  onPress: () => void;
  onCollapse?: () => void;
  dividerColor: string;
  surfaceColor: string;
}

export function AccountCard({
  account,
  onPress,
  onCollapse,
  dividerColor,
  surfaceColor,
}: AccountCardProps) {
  const { theme, fonts } = useTheme();

  return (
    <AppCard
      elevation="sm"
      padding="none"
      radius="r2"
      style={[
        styles.cardContainer,
        {
          backgroundColor: surfaceColor,
          marginLeft: account.depth * Spacing.lg,
          opacity: account.depth > 0 ? 0.9 : 1,
        },
      ]}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={Opacity.heavy}>
        <Box background={account.accentColor}>
          <Inset space="lg">
            <Stack gap="md">
              <Inline align="center" justify="space-between">
                <Inline gap="md" align="center" flex={1}>
                  <IvyIcon
                    name={account.icon || undefined}
                    fallbackIcon="wallet"
                    label={account.name}
                    color={account.textColor}
                    size={Size.avatarSm}
                  />
                  <AppText
                    variant="body"
                    weight="bold"
                    numberOfLines={1}
                    style={{ color: account.textColor, flex: 1 }}
                  >
                    {account.name}
                  </AppText>
                </Inline>

                <Inline gap="sm" align="center">
                  {account.reconciledAt && (
                    <Box
                      background={withOpacity(theme.pureInverse, Opacity.soft)}
                      paddingHorizontal="sm"
                      paddingVertical="xs"
                      borderRadius="sm"
                      flexDirection="row"
                      alignItems="center"
                      style={{ gap: Spacing.xs }}
                    >
                      <AppIcon name="shieldCheck" color={account.textColor} size={Size.iconXs} />
                      <AppText
                        weight="medium"
                        style={{
                          color: account.textColor,
                          fontSize: Typography.sizes.xs,
                          lineHeight: 12,
                          opacity: Opacity.heavy,
                        }}
                      >
                        {formatRelativeReconciledDate(account.reconciledAt)}
                      </AppText>
                    </Box>
                  )}
                  {account.hasChildren && (
                    <Box>
                      {account.isExpanded ? (
                        <TouchableOpacity
                          onPress={e => {
                            e.stopPropagation();
                            onCollapse?.();
                          }}
                          style={styles.collapseButton}
                        >
                          <AppIcon name="chevronUp" color={account.textColor} size={Size.iconSm} />
                        </TouchableOpacity>
                      ) : (
                        <IvyIcon name="hierarchy" color={account.textColor} size={Size.iconXs} />
                      )}
                    </Box>
                  )}
                </Inline>
              </Inline>

              <Box alignItems="center" justifyContent="center" paddingVertical="md">
                <AppText
                  variant="title"
                  weight="bold"
                  style={{
                    fontSize: Typography.sizes.xxxl,
                    color: account.textColor,
                    fontFamily: fonts.bold,
                  }}
                >
                  {account.balanceText}
                </AppText>
              </Box>
            </Stack>
          </Inset>
        </Box>

        {account.showMonthlyStats && (
          <Inset horizontal="lg" vertical="md">
            <Inline
              align="center"
              justify="space-between"
              accessibilityLabel={`Monthly statistics for ${account.name}`}
              accessibilityRole="summary"
            >
              <Stack
                align="center"
                flex={1}
                accessibilityLabel={`Monthly Income: ${account.monthlyIncomeText}`}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  color="secondary"
                  style={styles.statsLabel}
                >
                  MONTH INCOME
                </AppText>
                <AppText variant="body" weight="bold" style={styles.statsValue}>
                  {account.monthlyIncomeText}
                </AppText>
              </Stack>

              <Box width={1} height={Spacing.xl} background={dividerColor} />

              <Stack
                align="center"
                flex={1}
                accessibilityLabel={`Monthly Expenses: ${account.monthlyExpenseText}`}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  color="secondary"
                  style={styles.statsLabel}
                >
                  MONTH EXPENSES
                </AppText>
                <AppText variant="body" weight="bold" style={styles.statsValue}>
                  {account.monthlyExpenseText}
                </AppText>
              </Stack>
            </Inline>
          </Inset>
        )}
      </TouchableOpacity>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  collapseButton: {
    padding: Spacing.xs,
    marginRight: -Spacing.xs,
  },
  statsLabel: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.xs,
  },
  statsValue: {
    fontSize: Typography.sizes.sm,
  },
});
