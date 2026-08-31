import { MoneyText } from '@/src/components/common/MoneyText';
import { AppCard, AppIcon, AppText, Badge } from '@/src/components/core';
import { Opacity, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import type { JournalEntryCardProps } from '@/src/types/journalEntryCard';
import { MotiView } from 'moti';
import { memo, useMemo } from 'react';
import { Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';

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
  contentScale = 1,
}: JournalEntryCardProps) => {
  const { theme, themeMode } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();

  const typeColor = theme[presentation.typeColor as keyof typeof theme] as string;

  const formattedDate = useMemo(
    () => formatDate(transactionDate, { includeTime: true, hourCycle: resolvedHourCycle }),
    [transactionDate, resolvedHourCycle],
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
        testID="journal-entry-card"
        elevation="sm"
        paddingSize="none"
        radius="r2"
        style={[styles.container, { backgroundColor: theme.surface }, cardStyle]}
      >
        <Inset space="lg">
          <MotiView
            animate={{ scale: contentScale }}
            transition={{ type: 'timing', duration: 100 }}
          >
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
          </MotiView>
        </Inset>
      </AppCard>
    </Wrapper>
  );
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
