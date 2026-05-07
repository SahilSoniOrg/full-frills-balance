import { AppCard, AppIcon, AppText, Badge, IconName } from '@/src/components/core';
import { Opacity, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { MotiView } from 'moti';
import React, { memo, useMemo } from 'react';
import { Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';

export interface TransactionBadge {
  id?: string;
  text: string;
  icon?: IconName | string | null;
  fallbackIcon?: IconName;
  colorKey?: string;
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
    typeColor: string;
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

const SelectionIndicator = memo(({ isSelected, isActive, color, border }: any) => {
  if (!isSelected && !isActive) return null;

  return (
    <Box
      width={24}
      height={24}
      borderRadius="full"
      alignItems="center"
      justifyContent="center"
      background={isSelected ? color : 'transparent'}
      style={[
        styles.selectionIndicator,
        {
          borderWidth: isSelected ? 0 : 2,
          borderColor: isSelected ? 'transparent' : border,
          opacity: isSelected ? Opacity.high : Opacity.medium,
        },
      ]}
    >
      {isSelected && <AppIcon name="check" size={12} color="white" />}
    </Box>
  );
});
SelectionIndicator.displayName = 'SelectionIndicator';

const TransactionCardComponent = ({
  title,
  amount,
  currencyCode,
  transactionDate,
  presentation,
  badges = [],
  notes,
  isPrivacyMode: overridePrivacy,
  onPress,
  onLongPress,
  isSelected,
  isSelectionModeActive,
}: TransactionCardProps) => {
  const { theme, themeMode } = useTheme();
  const { isPrivacyMode: globalPrivacy } = useUI();

  const isPrivacyMode = overridePrivacy ?? globalPrivacy;

  const typeColor = theme[presentation.typeColor as keyof typeof theme] as string;

  const formattedDate = useMemo(
    () => formatDate(transactionDate, { includeTime: true }),
    [transactionDate],
  );

  const formattedAmount = useMemo(
    () => (isPrivacyMode ? '••••' : CurrencyFormatter.format(amount, currencyCode)),
    [isPrivacyMode, amount, currencyCode],
  );

  const Wrapper = onPress || onLongPress ? TouchableOpacity : View;

  return (
    <Wrapper
      onPress={() => {
        Keyboard.dismiss();
        onPress?.();
      }}
      onLongPress={() => {
        Keyboard.dismiss();
        onLongPress?.();
      }}
      activeOpacity={onPress ? Opacity.heavy : 1}
      delayLongPress={350}
      style={styles.wrapper}
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
        <Inset space="lg">
          <MotiView
            animate={{ scale: isSelected ? 0.96 : 1 }}
            transition={{ type: 'timing', duration: 100 }}
          >
            <Stack gap="lg">
              {/* Badges */}
              <Inline gap="sm" wrap>
                <Badge
                  variant="default"
                  size="sm"
                  backgroundColor={withOpacity(
                    typeColor,
                    themeMode === 'dark' ? Opacity.muted : Opacity.soft,
                  )}
                  textColor={typeColor}
                  icon={presentation.typeIcon}
                  style={styles.primaryBadge}
                >
                  {presentation.label}
                </Badge>

                {badges.map((b, i) => (
                  <Badge
                    key={b.id ?? `${b.text}-${i}`}
                    variant={b.variant}
                    size="sm"
                    backgroundColor={
                      b.colorKey ? (theme[b.colorKey as keyof typeof theme] as string) : undefined
                    }
                    icon={b.icon}
                    fallbackIcon={b.fallbackIcon}
                  >
                    {b.text}
                  </Badge>
                ))}
              </Inline>

              {/* Title + Notes */}
              <Stack gap="xs">
                <AppText variant="body" weight="bold" numberOfLines={1}>
                  {title}
                </AppText>

                {notes && (
                  <AppText
                    variant="caption"
                    color="secondary"
                    numberOfLines={2}
                    style={styles.notes}
                  >
                    {notes}
                  </AppText>
                )}
              </Stack>

              {/* Footer */}
              <Inline align="center" justify="space-between">
                <Inline align="center" space="sm">
                  <Box
                    width={Size.iconLg}
                    height={Size.iconLg}
                    borderRadius="full"
                    alignItems="center"
                    justifyContent="center"
                    background={withOpacity(typeColor, Opacity.soft) as any}
                  >
                    <AppIcon name={presentation.typeIcon} size={Size.iconXs} color={typeColor} />
                  </Box>

                  <AppText variant="xl" weight="bold" tabular style={{ color: typeColor }}>
                    {presentation.amountPrefix || ''}
                    {formattedAmount}
                  </AppText>
                </Inline>

                <AppText variant="caption" color="tertiary" style={styles.date}>
                  {formattedDate}
                </AppText>
              </Inline>
            </Stack>

            <SelectionIndicator
              isSelected={isSelected}
              isActive={isSelectionModeActive}
              color={theme.primary}
              border={withOpacity(theme.textTertiary, Opacity.hover)}
            />
          </MotiView>
        </Inset>
      </AppCard>
    </Wrapper>
  );
};

export const TransactionCard = memo(TransactionCardComponent);

TransactionCard.displayName = 'TransactionCard';

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: Spacing.md,
  },
  container: {
    overflow: 'hidden',
  },
  primaryBadge: {
    borderRightWidth: 1,
    paddingRight: Spacing.sm,
  },
  notes: {
    opacity: Opacity.heavy,
  },
  date: {
    fontSize: Typography.sizes.xs,
  },
  selectionIndicator: {
    position: 'absolute',
    right: Spacing.md,
    top: '50%',
    marginTop: -12,
    zIndex: 10,
  },
});
