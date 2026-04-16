import { AppCard, AppIcon, AppText, Badge, IconName } from '@/src/components/core';
import { MotiView } from 'moti';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
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
  isPrivacyMode?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  isSelected?: boolean;
  isSelectionModeActive?: boolean;
}

/**
 * TransactionCard - Unified layout for all transaction-like items
 */
export const TransactionCard = React.memo(
  ({
    title,
    amount,
    currencyCode,
    transactionDate,
    presentation,
    badges = [],
    notes,
    isPrivacyMode: isPrivacyModeOverride,
    onPress,
    onLongPress,
    isSelected,
    isSelectionModeActive,
  }: TransactionCardProps) => {
    const { theme, themeMode } = useTheme();
    const { isPrivacyMode: globalPrivacyMode } = useUI();
    const isPrivacyMode = isPrivacyModeOverride ?? globalPrivacyMode;

    const formattedDate = formatDate(transactionDate, { includeTime: true });
    const formattedAmount = isPrivacyMode ? '••••' : CurrencyFormatter.format(amount, currencyCode);

    const selectionIndicator = (isSelected || isSelectionModeActive) && (
      <Box
        width={24}
        height={24}
        borderRadius="full"
        alignItems="center"
        justifyContent="center"
        background={isSelected ? theme.primary : ('transparent' as any)}
        style={{
          position: 'absolute',
          right: Spacing.md,
          top: '50%',
          marginTop: -12, // Center vertically
          borderWidth: isSelected ? 0 : 2,
          borderColor: isSelected ? 'transparent' : withOpacity(theme.textTertiary, Opacity.hover), // Correct token
          zIndex: 10,
          opacity: isSelected ? Opacity.high : Opacity.medium,
        }}
      >
        {isSelected && <AppIcon name="check" size={12} color={theme.onPrimary} />}
      </Box>
    );

    const content = (
      <MotiView
        animate={{
          scale: isSelected ? Opacity.subtle : Opacity.solid,
        }}
        transition={{
          type: 'timing',
          duration: 100,
        }}
        style={{ position: 'relative' }}
      >
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
                  badge.colorKey
                    ? (theme[badge.colorKey as keyof typeof theme] as string)
                    : undefined
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
                variant="xl"
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
        {selectionIndicator}
      </MotiView>
    );

    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={Opacity.heavy}
        delayLongPress={350}
        style={{ paddingBottom: Spacing.md }}
      >
        <AppCard
          elevation="sm"
          padding="none"
          radius="r2"
          style={[
            styles.container,
            {
              backgroundColor: theme.surface,
              borderWidth: isSelected ? 1.5 : 0,
              borderColor: isSelected ? theme.primary : 'transparent',
            },
          ]}
        >
          <Inset space="lg">{content}</Inset>
        </AppCard>
      </TouchableOpacity>
    );
  },
  (prev, next) => {
    // Robust check for all props that impact visual appearance or behavior
    return (
      prev.isSelected === next.isSelected &&
      prev.isSelectionModeActive === next.isSelectionModeActive &&
      prev.isPrivacyMode === next.isPrivacyMode &&
      prev.title === next.title &&
      prev.amount === next.amount &&
      prev.currencyCode === next.currencyCode &&
      prev.transactionDate === next.transactionDate && // assuming stable or equal
      prev.notes === next.notes &&
      // Presentation is a structured object, we check its core fields
      prev.presentation.label === next.presentation.label &&
      prev.presentation.typeIcon === next.presentation.typeIcon &&
      prev.presentation.typeColor === next.presentation.typeColor &&
      prev.presentation.amountPrefix === next.presentation.amountPrefix &&
      // Badges array comparison (shallow length + content)
      prev.badges.length === next.badges.length &&
      prev.badges.every((b, i) => b.text === next.badges[i].text && b.icon === next.badges[i].icon)
    );
  },
);

TransactionCard.displayName = 'TransactionCard';

const styles = StyleSheet.create({
  container: {
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
