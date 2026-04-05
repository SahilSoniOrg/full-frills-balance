import { AppCard, AppIcon, AppText, Badge, IconName } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import { ComponentVariant } from '@/src/utils/style-helpers';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

export interface TransactionBadge {
  text: string;
  icon?: IconName | string | null;
  fallbackIcon?: IconName;
  colorKey?: string; // semantic theme key
  variant?: ComponentVariant;
}

export interface TransactionCardProps {
  title: string;
  amount: number;
  currencyCode: string;
  transactionDate: number | Date;
  presentation: {
    label: string;
    typeIcon: IconName;
    typeColor: string; // semantic key (e.g., 'income', 'expense')
    amountPrefix?: string;
  };
  badges: TransactionBadge[];
  notes?: string;
  onPress?: () => void;
}

/**
 * TransactionCard - Unified layout for all transaction-like items
 */
export const TransactionCard = ({
  title,
  amount,
  currencyCode,
  transactionDate,
  presentation,
  badges = [],
  notes,
  onPress,
}: TransactionCardProps) => {
  const { theme, themeMode } = useTheme();
  const formattedDate = formatDate(transactionDate, { includeTime: true });
  const formattedAmount = CurrencyFormatter.format(amount, currencyCode);

  const content = (
    <Stack gap="lg">
      <Inline gap="sm" wrap>
        <Badge
          variant="default"
          size="sm"
          backgroundColor={withOpacity(
            theme[presentation.typeColor as keyof typeof theme] as string,
            themeMode === 'dark' ? Opacity.muted : Opacity.soft,
          )}
          textColor={theme[presentation.typeColor as keyof typeof theme] as string}
          icon={presentation.typeIcon}
          style={{
            borderRightWidth: 1,
            borderRightColor: withOpacity(theme.border, Opacity.medium),
            paddingRight: Spacing.sm,
          }}
        >
          {presentation.label}
        </Badge>
        {badges.map((badge, idx) => (
          <Badge
            key={`${badge.text}-${idx}`}
            variant={badge.variant}
            size="sm"
            backgroundColor={
              badge.colorKey ? (theme[badge.colorKey as keyof typeof theme] as string) : undefined
            }
            icon={badge.icon}
            fallbackIcon={badge.fallbackIcon}
          >
            {badge.text}
          </Badge>
        ))}
      </Inline>

      <Stack gap="xs">
        <AppText variant="body" weight="bold" numberOfLines={1}>
          {title}
        </AppText>
        {notes && (
          <AppText
            variant="caption"
            color="secondary"
            numberOfLines={2}
            style={{ opacity: Opacity.heavy }}
          >
            {notes}
          </AppText>
        )}
      </Stack>

      <Inline align="center" justify="space-between">
        <Inline align="center" space="sm">
          <Box
            width={Size.iconLg}
            height={Size.iconLg}
            borderRadius="full"
            alignItems="center"
            justifyContent="center"
            background={
              withOpacity(
                theme[presentation.typeColor as keyof typeof theme] as string,
                Opacity.soft,
              ) as any
            }
          >
            <AppIcon
              name={presentation.typeIcon}
              size={Size.iconXs}
              color={theme[presentation.typeColor as keyof typeof theme] as string}
            />
          </Box>
          <AppText
            variant="subheading"
            weight="bold"
            tabular
            style={{ color: theme[presentation.typeColor as keyof typeof theme] as string }}
          >
            {presentation.amountPrefix || ''}
            {formattedAmount}
          </AppText>
        </Inline>

        <AppText variant="caption" color="tertiary" style={{ fontSize: Typography.sizes.xs }}>
          {formattedDate}
        </AppText>
      </Inline>
    </Stack>
  );

  return (
    <AppCard
      elevation="sm"
      padding="none"
      radius="r3"
      style={[styles.container, { backgroundColor: theme.surface }]}
    >
      <Inset space="lg">
        {onPress ? (
          <TouchableOpacity onPress={onPress} activeOpacity={Opacity.heavy}>
            {content}
          </TouchableOpacity>
        ) : (
          content
        )}
      </Inset>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  cardContent: {
    padding: Spacing.lg,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  textSection: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.base,
  },
  notes: {
    marginTop: Spacing.xs,
    fontSize: Typography.sizes.xs,
    opacity: Opacity.heavy,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: Size.iconLg,
    height: Size.iconLg,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  date: {
    fontSize: Typography.sizes.xs,
  },
});
