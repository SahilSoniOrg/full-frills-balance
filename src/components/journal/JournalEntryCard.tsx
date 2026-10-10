import { LIST_SELECTION_LONG_PRESS_MS } from '@/src/constants/gesture-constants';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { SelectionIndicator } from '@/src/components/shared/SelectionIndicator';
import { AppCard, AppIcon, AppText, Badge, PressScaleTouchable } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import { blendColors, getReadableColor, withOpacity } from '@/src/utils/color-math';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatClockTime, formatDate } from '@/src/utils/dateUtils';
import { EntryCardLayout } from './EntryCardLayout';
import { JournalAccountFlow } from './JournalAccountFlow';
import type { JournalEntryCardProps, JournalEntryLeg } from '@/src/types/journalEntryCard';
import { memo, useMemo } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

const SELECTION_CARD_BORDER_WIDTH = 1.5;

function legDirection(leg: JournalEntryLeg): string {
  return leg.role === 'SOURCE' ? 'From' : leg.role === 'DESTINATION' ? 'To' : 'Account';
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
  isSelectionModeActive,
  notes,
  onPress,
  onLongPress,
  overlay,
  cardStyle,
}: JournalEntryCardProps) => {
  const { theme, themeMode } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const formatMoney = useMoneyFormat({ style: 'trimmed' });
  const isPressable = onPress != null || onLongPress != null;
  const typeColor = theme[presentation.typeColor as keyof typeof theme] as string;
  const typeIconBackground = blendColors(typeColor, theme.surface, Opacity.soft);
  const typeIconColor = getReadableColor(typeColor, typeIconBackground, 3);
  // Signed amounts are green (in) or red (out); unsigned transfers keep their type color.
  const signColor =
    presentation.amountPrefix === '+ '
      ? theme.income
      : presentation.amountPrefix === '− '
        ? theme.expense
        : typeColor;
  const amountColor = getReadableColor(signColor, theme.surface, 4.5);
  const typeBadgeOpacity = themeMode === 'dark' ? Opacity.muted : Opacity.soft;
  const typeBadgeTextColor = getReadableColor(
    typeColor,
    blendColors(typeColor, theme.surface, typeBadgeOpacity),
    4.5,
  );
  const formattedDate = useMemo(
    () => formatDate(transactionDate, { includeTime: true, hourCycle: resolvedHourCycle }),
    [transactionDate, resolvedHourCycle],
  );
  const displayedDate =
    dateDisplay === 'time' ? formatClockTime(transactionDate, resolvedHourCycle) : formattedDate;
  const describeLeg = (leg: JournalEntryLeg) => `${legDirection(leg)} ${leg.name}`;
  const accountLegs = useMemo(
    () => [
      ...(accountFlow.primaryAccount ? [accountFlow.primaryAccount] : []),
      ...accountFlow.sources,
      ...accountFlow.destinations,
      ...accountFlow.neutral,
    ],
    [accountFlow],
  );
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
  const showSelectionIndicator = overlay == null && (isSelected || isSelectionModeActive);

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
      <EntryCardLayout
        leading={
          <View
            style={[styles.typeIcon, { backgroundColor: typeIconBackground }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {showSelectionIndicator ? (
              <SelectionIndicator selected={!!isSelected} borderColor={theme.textTertiary} />
            ) : (
              <AppIcon name={presentation.typeIcon} size={Size.iconSm} color={typeIconColor} />
            )}
          </View>
        }
        title={title}
        subtitle={notes}
        amount={amount}
        currencyCode={currencyCode}
        amountPrefix={presentation.amountPrefix}
        amountColor={amountColor}
        amountCaption={
          accountFlow.showCurrencyCodes ? (
            <AppText variant="caption" color="secondary">
              {currencyCode}
            </AppText>
          ) : undefined
        }
        badge={
          presentation.showTypeBadge ? (
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
          ) : undefined
        }
        footer={
          <JournalAccountFlow
            accountFlow={accountFlow}
            trailing={
              <AppText variant="caption" color="secondary" align="right">
                {displayedDate}
              </AppText>
            }
          />
        }
        overlay={overlay}
      />
      {isSelected ? (
        <View
          testID="journal-entry-card-selection-outline"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.selectionOutline, { borderColor: theme.primary }]}
        />
      ) : null}
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
        delayLongPress={LIST_SELECTION_LONG_PRESS_MS}
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
  selectionOutline: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: SELECTION_CARD_BORDER_WIDTH,
    borderRadius: Shape.radius.r2,
    borderCurve: 'continuous',
    zIndex: 10,
  },
  typeBadge: { maxWidth: '100%', flexShrink: 1 },
});
