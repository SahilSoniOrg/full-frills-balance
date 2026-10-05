import { MoneyText } from '@/src/components/shared/MoneyText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppCard, AppIcon, AppText, Badge, Icon, PressScaleTouchable } from '@/src/components/core';
import { BorderWidth, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { blendColors, getReadableColor, withOpacity } from '@/src/utils/color-math';
import { Box, Stack } from '@/src/design-system';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatClockTime, formatDate } from '@/src/utils/dateUtils';
import { JournalAccountFlow } from './JournalAccountFlow';
import type { JournalEntryCardProps, JournalEntryLeg } from '@/src/types/journalEntryCard';
import { memo, useMemo } from 'react';
import { Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';

const SELECTION_INDICATOR_SIZE = Size.md;
const SELECTION_CARD_BORDER_WIDTH = 1.5;

function legDirection(leg: JournalEntryLeg): string {
  return leg.role === 'SOURCE' ? 'From' : leg.role === 'DESTINATION' ? 'To' : 'Account';
}

const SelectionIndicator = memo(
  ({
    isSelected,
    isActive,
    color,
    checkColor,
    border,
  }: {
    isSelected?: boolean;
    isActive?: boolean;
    color: string;
    checkColor: string;
    border: string;
  }) => {
    if (!isSelected && !isActive) return null;

    return (
      <Box
        width={SELECTION_INDICATOR_SIZE}
        height={SELECTION_INDICATOR_SIZE}
        borderRadius="full"
        alignItems="center"
        justifyContent="center"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        background={isSelected ? undefined : 'transparent'}
        unsafe_backgroundRaw={isSelected ? color : undefined}
        style={[
          styles.selectionIndicator,
          {
            borderWidth: isSelected ? 0 : BorderWidth.medium,
            borderColor: isSelected ? 'transparent' : border,
            opacity: isSelected ? Opacity.high : Opacity.medium,
          },
        ]}
      >
        {isSelected && <AppIcon name={Icon.Check} size={Size.xxs} color={checkColor} />}
      </Box>
    );
  },
);
SelectionIndicator.displayName = 'SelectionIndicator';

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
  const { fontScale } = useWindowDimensions();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const formatMoney = useMoneyFormat();
  const isPressable = onPress != null || onLongPress != null;
  const typeColor = theme[presentation.typeColor as keyof typeof theme] as string;
  const typeIconBackground = blendColors(typeColor, theme.surface, Opacity.soft);
  const typeIconColor = getReadableColor(typeColor, typeIconBackground, 3);
  const amountColor = getReadableColor(typeColor, theme.surface, 4.5);
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
  const selectionOverlay =
    overlay ??
    (isSelected || isSelectionModeActive ? (
      <SelectionIndicator
        isSelected={isSelected}
        isActive={isSelectionModeActive}
        color={theme.primary}
        checkColor={theme.onPrimary}
        border={withOpacity(theme.textTertiary, Opacity.hover)}
      />
    ) : undefined);
  const resolvedCardStyle = [
    cardStyle,
    isSelected
      ? {
          borderWidth: SELECTION_CARD_BORDER_WIDTH,
          borderColor: theme.primary,
        }
      : undefined,
  ];

  const body = (
    <AppCard
      testID="journal-entry-card"
      elevation="sm"
      paddingSize="none"
      radius="r2"
      accessible={!isPressable}
      accessibilityLabel={!isPressable ? accessibilityLabel : undefined}
      accessibilityState={!isPressable ? accessibilityState : undefined}
      style={[styles.container, { backgroundColor: theme.surface }, resolvedCardStyle]}
    >
      <Box paddingHorizontal="md" paddingVertical="lg">
        <Stack gap="md">
          <View
            style={[styles.header, selectionOverlay != null ? styles.selectionHeader : undefined]}
          >
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

          <JournalAccountFlow accountFlow={accountFlow} timestamp={displayedDate} />
        </Stack>
        {selectionOverlay}
      </Box>
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
  selectionIndicator: {
    position: 'absolute',
    right: Spacing.md,
    top: Spacing.lg,
    zIndex: 10,
  },
  typeBadge: { maxWidth: '100%', flexShrink: 1 },
  shrink: { flexShrink: 1, minWidth: 0 },
});
