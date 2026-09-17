import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppCard, AppIcon, AppText, Badge, PressScaleTouchable } from '@/src/components/core';
import { Opacity, Size, Spacing, Typography } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import type { JournalEntryCardProps } from '@/src/types/journalEntryCard';
import { memo, useMemo } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

export type { JournalEntryBadge, JournalEntryCardProps } from '@/src/types/journalEntryCard';

const JournalEntryCardComponent = ({
  title,
  amount,
  currencyCode,
  transactionDate,
  presentation,
  badges = [],
  notes,
  onPress,
  onLongPress,
  overlay,
  cardStyle,
}: JournalEntryCardProps) => {
  const { theme, themeMode } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const isPressable = onPress != null || onLongPress != null;

  const typeColor = theme[presentation.typeColor as keyof typeof theme] as string;

  const formattedDate = useMemo(
    () => formatDate(transactionDate, { includeTime: true, hourCycle: resolvedHourCycle }),
    [transactionDate, resolvedHourCycle],
  );

  const body = (
    <AppCard
      testID="journal-entry-card"
      elevation="sm"
      paddingSize="none"
      radius="r2"
      style={[styles.container, { backgroundColor: theme.surface }, cardStyle]}
    >
      <Inset space="lg">
        <Stack gap="lg">
          <Inline gap="sm" wrap>
            <Badge
              testID="transaction-type-badge"
              variant="default"
              size="sm"
              backgroundColor={withOpacity(
                typeColor,
                themeMode === 'dark' ? Opacity.muted : Opacity.soft,
              )}
              textColor={typeColor}
              icon={presentation.typeIcon}
            >
              {presentation.label}
            </Badge>

            {badges.map((b, i) => (
              <Badge
                key={b.id ?? `${b.text}-${i}`}
                testID="transaction-account-badge"
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

          <Stack gap="xs">
            <AppText
              variant="body"
              weight="bold"
              numberOfLines={1}
              testID="journal-entry-card-title"
            >
              {title}
            </AppText>

            {notes && (
              <AppText variant="caption" color="secondary" numberOfLines={2} style={styles.notes}>
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
                unsafe_backgroundRaw={withOpacity(typeColor, Opacity.soft)}
              >
                <AppIcon name={presentation.typeIcon} size={Size.iconXs} color={typeColor} />
              </Box>

              <MoneyText
                amount={amount}
                currencyCode={currencyCode}
                prefix={presentation.amountPrefix}
                variant="xl"
                weight="bold"
                tabular
                style={{ color: typeColor }}
              />
            </Inline>

            <AppText variant="caption" color="tertiary" style={styles.date}>
              {formattedDate}
            </AppText>
          </Inline>
        </Stack>

        {overlay}
      </Inset>
    </AppCard>
  );

  if (isPressable) {
    return (
      <PressScaleTouchable
        onPress={() => {
          Keyboard.dismiss();
          onPress?.();
        }}
        onLongPress={() => {
          Keyboard.dismiss();
          onLongPress?.();
        }}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={styles.wrapper}
      >
        {body}
      </PressScaleTouchable>
    );
  }

  return <View style={styles.wrapper}>{body}</View>;
};

export const JournalEntryCard = memo(JournalEntryCardComponent);

JournalEntryCard.displayName = 'JournalEntryCard';

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: Spacing.md,
  },
  container: {
    overflow: 'hidden',
  },
  notes: {
    opacity: Opacity.heavy,
  },
  date: {
    fontSize: Typography.sizes.xs,
  },
});
