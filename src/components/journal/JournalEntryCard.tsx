import { MoneyText } from '@/src/components/shared/MoneyText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppCard, AppIcon, AppText, Badge, PressScaleTouchable } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import {
  blendColors,
  getContrastRatio,
  getLuminance,
  getReadableColor,
  withOpacity,
} from '@/src/utils/color-math';
import { Inset, Stack } from '@/src/design-system';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatClockTime, formatDate } from '@/src/utils/dateUtils';
import { JournalAccountFlow } from './JournalAccountFlow';
import type { JournalEntryCardProps, JournalEntryLeg } from '@/src/types/journalEntryCard';
import { memo, useMemo } from 'react';
import { Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';

export type { JournalEntryCardProps } from '@/src/types/journalEntryCard';

function legDirection(leg: JournalEntryLeg): string {
  return leg.role === 'SOURCE' ? 'From' : leg.role === 'DESTINATION' ? 'To' : 'Account';
}

function readableColor(
  preferred: string,
  background: string,
  fallback: string,
  minimumRatio: number,
): string {
  return getContrastRatio(getLuminance(preferred), getLuminance(background)) >= minimumRatio
    ? preferred
    : fallback;
}

const JournalEntryCardComponent = ({
  title,
  amount,
  currencyCode,
  transactionDate,
  dateDisplay = 'full',
  presentation,
  accountFlow,
  isSelected,
  notes,
  onPress,
  onLongPress,
  overlay,
  cardStyle,
}: JournalEntryCardProps) => {
  const { theme, themeMode } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const formatMoney = useMoneyFormat();
  const isPressable = onPress != null || onLongPress != null;
  const typeColor = theme[presentation.typeColor as keyof typeof theme] as string;
  const typeIconBackground = blendColors(typeColor, theme.surface, Opacity.soft);
  const typeIconColor = getReadableColor(typeColor, typeIconBackground, 3);
  const amountColor = readableColor(typeColor, theme.surface, theme.text, 4.5);
  const typeBadgeOpacity = themeMode === 'dark' ? Opacity.muted : Opacity.soft;
  const typeBadgeTextColor = readableColor(
    typeColor,
    blendColors(typeColor, theme.surface, typeBadgeOpacity),
    theme.text,
    4.5,
  );
  const formattedDate = useMemo(
    () => formatDate(transactionDate, { includeTime: true, hourCycle: resolvedHourCycle }),
    [transactionDate, resolvedHourCycle],
  );
  const displayedDate =
    dateDisplay === 'time' ? formatClockTime(transactionDate, resolvedHourCycle) : formattedDate;
  const describeLeg = (leg: JournalEntryLeg) => `${legDirection(leg)} ${leg.name}`;
  const accountLegs = [
    ...(accountFlow.primaryAccount ? [accountFlow.primaryAccount] : []),
    ...accountFlow.sources,
    ...accountFlow.destinations,
    ...accountFlow.neutral,
  ];
  const accountLabels = accountLegs.map(describeLeg);
  const accessibilityLabel = [
    title,
    presentation.label,
    formatMoney(amount, currencyCode, { prefix: presentation.amountPrefix }),
    ...accountLabels,
    formattedDate,
    notes,
  ]
    .filter(Boolean)
    .join('. ');
  const accessibilityState = isSelected == null ? undefined : { selected: isSelected };

  const body = (
    <AppCard
      testID="journal-entry-card"
      elevation="sm"
      paddingSize="none"
      radius="r2"
      accessible={!isPressable}
      accessibilityLabel={!isPressable ? accessibilityLabel : undefined}
      accessibilityState={!isPressable ? accessibilityState : undefined}
      style={[styles.container, { backgroundColor: theme.surface }, cardStyle]}
    >
      <Inset horizontal="md" vertical="lg">
        <Stack gap="md">
          <View style={[styles.header, overlay != null ? styles.selectionHeader : undefined]}>
            <View style={[styles.identity, fontScale > 1 ? styles.enlargedIdentity : undefined]}>
              <View
                style={[styles.typeIcon, { backgroundColor: typeIconBackground }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <AppIcon name={presentation.typeIcon} size={Size.iconSm} color={typeIconColor} />
              </View>
              <Stack gap="xs" style={styles.headerContent}>
                <AppText
                  variant="body"
                  weight="bold"
                  numberOfLines={2}
                  testID="journal-entry-card-title"
                >
                  {title}
                </AppText>
                {notes ? (
                  <AppText
                    variant="caption"
                    color="secondary"
                    numberOfLines={2}
                    style={styles.shrink}
                  >
                    {notes}
                  </AppText>
                ) : null}
              </Stack>
            </View>
            <Stack gap="xs" align="flex-end" style={styles.amountColumn}>
              {/* Buffer the line height so native fitting tolerates fractional selection frames. */}
              <MoneyText
                amount={amount}
                currencyCode={currencyCode}
                prefix={presentation.amountPrefix}
                variant="xl"
                weight="bold"
                tabular
                align="right"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                style={{ color: amountColor, minHeight: Math.ceil(Size.lg * fontScale) }}
              />
              {accountFlow.showCurrencyCodes && (
                <AppText variant="caption" color="secondary">
                  {currencyCode}
                </AppText>
              )}
            </Stack>
          </View>
          {presentation.showTypeBadge && (
            <Badge
              testID="transaction-type-badge"
              variant="default"
              size="sm"
              backgroundColor={withOpacity(typeColor, typeBadgeOpacity)}
              textColor={typeBadgeTextColor}
              style={styles.typeBadge}
            >
              {presentation.label}
            </Badge>
          )}

          <JournalAccountFlow
            legs={accountLegs}
            primaryId={accountFlow.primaryAccount?.id}
            timestamp={displayedDate}
          />
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
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
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
  wrapper: { paddingBottom: Spacing.lg },
  container: { overflow: 'hidden' },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: Spacing.md },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexGrow: 1,
    flexBasis: '50%',
    minWidth: 0,
  },
  enlargedIdentity: { flexBasis: '100%' },
  typeIcon: {
    width: Size.lg,
    height: Size.lg,
    borderRadius: Shape.radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    flexShrink: 0,
  },
  headerContent: { flex: 1, minWidth: 0 },
  amountColumn: { flexShrink: 1, maxWidth: '100%', marginLeft: 'auto' },
  selectionHeader: { paddingRight: Size.md + Spacing.sm },
  typeBadge: { maxWidth: '100%', flexShrink: 1 },
  shrink: { flexShrink: 1, minWidth: 0 },
});
