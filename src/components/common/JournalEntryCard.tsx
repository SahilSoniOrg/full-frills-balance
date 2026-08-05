import { MoneyText } from '@/src/components/common/MoneyText';
import { AppCard, AppIcon, AppText, Badge, IconName } from '@/src/components/core';
import { Opacity, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { MotiView } from 'moti';
import { memo, useMemo, type ReactNode } from 'react';
import {
  Keyboard,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export interface JournalEntryBadge {
  id?: string;
  text: string;
  icon?: IconName | string | null;
  fallbackIcon?: IconName;
  colorKey?: string;
  variant?: ComponentVariant;
}

export interface JournalEntryCardProps {
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
  badges: JournalEntryBadge[];
  notes?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Optional chrome rendered inside the card (e.g. selection indicator). */
  overlay?: ReactNode;
  /** Extra styles applied to the card surface. */
  cardStyle?: StyleProp<ViewStyle>;
  /** Scale applied to card content (e.g. selection press-in). */
  contentScale?: number;
}

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

  const typeColor = theme[presentation.typeColor as keyof typeof theme] as string;

  const formattedDate = useMemo(
    () => formatDate(transactionDate, { includeTime: true }),
    [transactionDate],
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
        padding="none"
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
                    background={withOpacity(typeColor, Opacity.soft) as any}
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
