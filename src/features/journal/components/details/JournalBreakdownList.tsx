import { MoneyText } from '@/src/components/shared/MoneyText';
import { Section } from '@/src/components/shared/Section';
import { Icon, AppIcon, ListRow } from '@/src/components/core';
import { Size, Typography } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { JournalSplitItemViewModel } from '@/src/features/journal/hooks/useJournalDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import React from 'react';

interface JournalBreakdownListProps {
  splitItems: JournalSplitItemViewModel[];
}

export const JournalBreakdownList = React.memo(({ splitItems }: JournalBreakdownListProps) => {
  const { theme } = useTheme();

  return (
    <Section
      title="Breakdown"
      items={splitItems}
      emptyText="No line items recorded."
      keyExtractor={item => item.id}
      renderItem={item => (
        <ListRow
          title={item.accountName}
          subtitle={item.transactionType}
          leading={
            <Box
              background={item.iconBackground}
              backgroundOpacity="soft"
              width={Size.lg}
              height={Size.lg}
              borderRadius="full"
              alignItems="center"
              justifyContent="center"
            >
              <AppIcon
                name={item.iconName || undefined}
                fallbackIcon={item.fallbackIcon}
                size={16}
                color={item.iconColor}
              />
            </Box>
          }
          trailing={
            <Inline space="xs" alignItems="center">
              <MoneyText
                amount={item.amount}
                currencyCode={item.currencyCode}
                prefix={item.amountPrefix}
                variant="subheading"
                color={item.amountColor as ComponentVariant}
              />
              <AppIcon
                name={Icon.ChevronRight}
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
});

JournalBreakdownList.displayName = 'JournalBreakdownList';
