import { MoneyText } from '@/src/components/common/MoneyText';
import { Section } from '@/src/components/common/Section';
import { AppIcon, AppText, ListRow } from '@/src/components/core';
import { Size, Typography } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { TransactionSplitItemViewModel } from '@/src/features/journal/hooks/useTransactionDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo } from 'react';

interface TransactionBreakdownListProps {
  splitItems: TransactionSplitItemViewModel[];
}

export const TransactionBreakdownList = React.memo(
  ({ splitItems }: TransactionBreakdownListProps) => {
    const { theme } = useTheme();

    const displayItems = useMemo(() => {
      return splitItems.map(item => ({
        id: item.id,
        title: item.accountName,
        subtitle: item.transactionType,
        amount: item.amount,
        currencyCode: item.currencyCode,
        amountPrefix: item.amountPrefix,
        amountColor: item.amountColor,
        iconName: item.iconName,
        fallbackIcon: item.fallbackIcon,
        iconColor: item.iconColor,
        iconBackground: item.iconBackground,
        onPress: item.onPress,
      }));
    }, [splitItems]);

    return (
      <Section
        title="Breakdown"
        items={displayItems}
        emptyText="No line items recorded."
        keyExtractor={item => item.id}
        renderItem={item => (
          <ListRow
            title={item.title}
            subtitle={item.subtitle}
            leading={
              <Box
                background={item.iconBackground as any}
                backgroundOpacity="soft"
                width={Size.lg}
                height={Size.lg}
                borderRadius="full"
                alignItems="center"
                justifyContent="center"
              >
                <AppIcon
                  name={item.iconName as any}
                  fallbackIcon={item.fallbackIcon}
                  size={16}
                  color={item.iconColor}
                />
              </Box>
            }
            trailing={
              <Inline space="xs" alignItems="center">
                <Inline space={0} alignItems="center">
                  <AppText variant="subheading" color={item.amountColor as any}>
                    {item.amountPrefix}
                  </AppText>
                  <MoneyText
                    amount={item.amount}
                    currencyCode={item.currencyCode}
                    variant="subheading"
                    color={item.amountColor as any}
                  />
                </Inline>
                <AppIcon
                  name="chevronRight"
                  size={Typography.sizes.sm}
                  color={theme.textSecondary}
                />
              </Inline>
            }
            onPress={item.onPress}
            padding="md"
          />
        )}
      />
    );
  },
);

TransactionBreakdownList.displayName = 'TransactionBreakdownList';
