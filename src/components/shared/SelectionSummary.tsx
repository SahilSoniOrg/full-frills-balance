import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { Inline } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import type { AccountTypeColorKey } from '@/src/design-system/accountPresentation';
import {
  signColorKey,
  signPrefix,
  type FlowSign,
} from '@/src/domain/accounting/presentationPolicy';
import { Money } from '@/src/domain/money/money';
import type { getSelectionState } from '@/src/hooks/selectionState';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import type { MoneyAmount } from '@/src/types/domainReadModels';
import { MotiView } from 'moti';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SelectionEdgeShadow, useSelectionBarSurface } from './selectionBarChrome';

export type SelectionItemLabel = string | { singular: string; plural: string };

export type SelectionAmountSection = {
  label: string;
  amounts: readonly MoneyAmount[];
  /** Theme color key for the section label (e.g. asset / liability). */
  colorKey?: AccountTypeColorKey;
};

export type SelectionAmountSummary = {
  label: string;
  amounts: readonly MoneyAmount[];
  incomplete?: boolean;
  /** Number of selected items that contributed to `amounts` (defaults to `selectedCount`). */
  includedCount?: number;
  /** Signed flow amounts use presentationPolicy prefixes and income/expense ink. */
  signed?: boolean;
  /** When multiple account types are selected, render each type as its own labeled block. */
  sections?: readonly SelectionAmountSection[];
};

type SelectionSummaryProps = {
  selection: ReturnType<typeof getSelectionState>;
  amountSummary?: SelectionAmountSummary;
  itemTypeLabel: SelectionItemLabel;
  onClear: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
};

const SUMMARY_AMOUNT_FIT = {
  maxFontSize: Typography.roles.heading.fontSize,
  minFontSize: Typography.sizes.sm,
  lineHeightRatio: Typography.roles.heading.lineHeight / Typography.roles.heading.fontSize,
};

const CONTROL_HIT_SLOP = {
  top: Spacing.sm,
  bottom: Spacing.sm,
  left: Spacing.xs,
  right: Spacing.xs,
};

function resolveItemTypeLabel(itemTypeLabel: SelectionItemLabel, count: number): string {
  if (typeof itemTypeLabel === 'string') {
    return count === 1 ? itemTypeLabel : `${itemTypeLabel}s`;
  }
  return count === 1 ? itemTypeLabel.singular : itemTypeLabel.plural;
}

function flowSignFor(amount: number): FlowSign {
  if (amount > 0) return 1;
  if (amount < 0) return -1;
  return 0;
}

function joinMeta(parts: readonly (string | undefined)[]): string | undefined {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(' · ') : undefined;
}

export function SelectionSummary({
  selection,
  amountSummary,
  itemTypeLabel,
  onClear,
  onSelectAll,
  onDeselectAll,
}: SelectionSummaryProps) {
  const { selectedCount, selectedSelectableCount, selectableCount, checked } = selection;
  const { cardStyle, isDark, theme } = useSelectionBarSurface('top');
  const { height: windowHeight } = useWindowDimensions();
  const maxBreakdownHeight = Math.min(144, Math.max(84, Math.round(windowHeight * 0.2)));
  const reduceMotion = useReducedMotion();
  const formatMoney = useMoneyFormat();
  const copy = AppConfig.strings.selection;
  const innerChipSurface = isDark ? theme.surface : theme.surfaceSecondary;
  const showRatio = selectableCount > 0 && selectedSelectableCount === selectedCount;
  const count = showRatio ? copy.countOfTotal(selectedCount, selectableCount) : selectedCount;
  const compactCount = showRatio
    ? copy.countOfTotal(selectedCount, selectableCount)
    : copy.countSelected(selectedCount);
  const itemLabel = resolveItemTypeLabel(
    itemTypeLabel,
    showRatio ? selectableCount : selectedCount,
  );
  const countLabel = copy.selectedCount(count, itemLabel);
  const countWithType = `${compactCount} ${itemLabel}`;
  const remaining = Math.max(0, selectableCount - selectedSelectableCount);
  const {
    amounts = [],
    label,
    incomplete,
    includedCount,
    signed = false,
    sections = [],
  } = amountSummary ?? {};
  const showSections = sections.length > 1;
  const displayAmounts = showSections ? [] : amounts;
  const multipleCurrencies = displayAmounts.length > 1;
  const hasAmounts = displayAmounts.length > 0 || showSections;
  const amountLabel =
    hasAmounts && label
      ? incomplete
        ? copy.partialAmount(label)
        : label
      : incomplete
        ? copy.totalUnavailable
        : undefined;

  const formatSummaryMoney = (amount: number, currencyCode: string) => {
    // Round to currency precision before deriving sign so tiny averages (e.g. -0.01 / 3) don't render "− $0.00".
    const rounded = Money.from(amount, currencyCode).round().amount || 0;
    if (!signed) {
      return { displayAmount: rounded, prefix: undefined, color: theme.text };
    }
    const sign = flowSignFor(rounded);
    return {
      displayAmount: Math.abs(rounded),
      prefix: signPrefix(sign),
      color: theme[signColorKey(sign)],
    };
  };

  const singleAmount =
    hasAmounts && !multipleCurrencies && !showSections ? displayAmounts[0] : null;
  const singleMoney = singleAmount
    ? formatSummaryMoney(singleAmount.amount, singleAmount.currencyCode)
    : null;
  const contributingCount = includedCount ?? selectedCount;
  // Skip "N currencies" — stacked amounts already show that. Only average when every
  // selected item contributed to the single-currency total.
  const averageMeta =
    singleAmount && !incomplete && selectedCount > 1 && contributingCount === selectedCount
      ? (() => {
          const avg = formatSummaryMoney(
            singleAmount.amount / selectedCount,
            singleAmount.currencyCode,
          );
          return copy.average(
            formatMoney(avg.displayAmount, singleAmount.currencyCode, { prefix: avg.prefix }),
          );
        })()
      : undefined;
  const selectionStatus =
    selectableCount > 0 && selectedCount > 0 && remaining === 0
      ? copy.allSelected
      : !showRatio && remaining > 0
        ? copy.remaining(remaining)
        : undefined;

  const metaLine = hasAmounts
    ? joinMeta([
        countWithType,
        amountLabel,
        showSections ? undefined : averageMeta,
        incomplete ? undefined : selectionStatus,
      ])
    : incomplete
      ? copy.totalUnavailable
      : selectedCount === 0
        ? copy.tapToSelect
        : selectionStatus;

  const toggleDisabled = selectableCount === 0;
  const allSelected = checked === true;
  // Square / CheckSquare only — MinusSquare beside "All" reads as a broken control.
  const toggleIcon = allSelected ? Icon.CheckSquare : Icon.Square;
  const toggleTint = toggleDisabled ? theme.textTertiary : allSelected ? theme.primary : theme.text;

  const partialBadge = incomplete ? (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={copy.partialAmount(label ?? copy.signedTotal)}
    >
      <AppIcon name={Icon.Alert} size={Size.iconXs} color={theme.warning} />
    </View>
  ) : null;

  return (
    <MotiView
      pointerEvents="box-none"
      from={{
        opacity: 0,
        scale: reduceMotion ? 1 : 0.96,
        translateY: reduceMotion ? 0 : -14,
      }}
      animate={{ opacity: 1, scale: 1, translateY: 0 }}
      transition={{
        type: 'timing',
        duration: 180,
      }}
      style={styles.wrapper}
    >
      <SelectionEdgeShadow edge="top" />
      <View style={[styles.summaryCard, cardStyle]}>
        <Inline align="center" justify="space-between" gap="xs" style={styles.row}>
          <PressScaleTouchable
            onPress={onClear}
            hitSlop={CONTROL_HIT_SLOP}
            pressScale="subtle"
            haptic="selection"
            accessibilityLabel={copy.exitSelection}
            accessibilityRole="button"
            surfaceStyle={[
              styles.exitChip,
              {
                backgroundColor: innerChipSurface,
                borderColor: theme.border,
              },
            ]}
          >
            <AppIcon name={Icon.Close} size={Size.iconSm} color={theme.textSecondary} />
          </PressScaleTouchable>

          <View style={styles.summaryContent} accessibilityLiveRegion="polite">
            {showSections ? (
              <Inline align="flex-start" gap="xs">
                <ScrollView
                  style={[styles.breakdownScroll, { maxHeight: maxBreakdownHeight }]}
                  contentContainerStyle={styles.sectionStack}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  testID="selection-summary-breakdown"
                >
                  {sections.map(section => (
                    <View key={section.label} style={styles.sectionBlock}>
                      <AppText
                        variant="caption"
                        weight="bold"
                        style={{
                          color: section.colorKey ? theme[section.colorKey] : theme.textSecondary,
                        }}
                      >
                        {section.label}
                      </AppText>
                      <View style={styles.amountStack}>
                        {section.amounts.map(({ amount, currencyCode }) => {
                          const formatted = formatSummaryMoney(amount, currencyCode);
                          return (
                            <MoneyText
                              key={`${section.label}-${currencyCode}`}
                              amount={formatted.displayAmount}
                              currencyCode={currencyCode}
                              prefix={formatted.prefix}
                              variant="body"
                              weight="bold"
                              numberOfLines={1}
                              style={{ color: formatted.color }}
                            />
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </ScrollView>
                {partialBadge}
              </Inline>
            ) : multipleCurrencies ? (
              <Inline align="center" gap="xs">
                <ScrollView
                  style={[styles.breakdownScroll, { maxHeight: maxBreakdownHeight }]}
                  contentContainerStyle={styles.amountStack}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  testID="selection-summary-breakdown"
                >
                  {displayAmounts.map(({ amount, currencyCode }) => {
                    const formatted = formatSummaryMoney(amount, currencyCode);
                    return (
                      <MoneyText
                        key={currencyCode}
                        amount={formatted.displayAmount}
                        currencyCode={currencyCode}
                        prefix={formatted.prefix}
                        variant="body"
                        weight="bold"
                        numberOfLines={1}
                        style={{ color: formatted.color }}
                      />
                    );
                  })}
                </ScrollView>
                {partialBadge}
              </Inline>
            ) : singleMoney && singleAmount ? (
              <Inline align="center" gap="xs">
                <MoneyText
                  amount={singleMoney.displayAmount}
                  currencyCode={singleAmount.currencyCode}
                  prefix={singleMoney.prefix}
                  variant="heading"
                  weight="bold"
                  fit={SUMMARY_AMOUNT_FIT}
                  style={[styles.amountText, { color: singleMoney.color }]}
                />
                {partialBadge}
              </Inline>
            ) : (
              <AppText
                variant="body"
                weight="semibold"
                numberOfLines={1}
                style={{ color: theme.text }}
              >
                {countLabel}
              </AppText>
            )}

            {metaLine ? (
              <AppText
                variant="caption"
                weight="medium"
                style={[styles.metaLine, { color: theme.textSecondary }]}
              >
                {metaLine}
              </AppText>
            ) : null}
          </View>

          <PressScaleTouchable
            onPress={allSelected ? onDeselectAll : onSelectAll}
            disabled={toggleDisabled}
            hitSlop={CONTROL_HIT_SLOP}
            pressScale="subtle"
            haptic="selection"
            accessibilityLabel={copy.toggleAll}
            accessibilityRole="checkbox"
            accessibilityState={{
              checked,
              disabled: toggleDisabled,
            }}
            surfaceStyle={[
              styles.togglePill,
              {
                backgroundColor: allSelected
                  ? withOpacity(theme.primary, Opacity.soft)
                  : innerChipSurface,
                borderColor: allSelected ? withOpacity(theme.primary, Opacity.muted) : theme.border,
                opacity: toggleDisabled ? Opacity.medium : Opacity.solid,
              },
            ]}
          >
            <AppIcon name={toggleIcon} size={Size.iconSm} color={toggleTint} />
            <AppText variant="caption" weight="bold" style={{ color: toggleTint }}>
              {allSelected ? copy.clearShort : copy.selectAllShort}
            </AppText>
          </PressScaleTouchable>
        </Inline>
      </View>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    alignItems: 'center',
  },
  summaryCard: {
    borderRadius: Shape.radius.xl,
    borderWidth: 1,
    width: '100%',
    maxWidth: 440,
  },
  row: {
    minHeight: 56,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  exitChip: {
    width: 34,
    height: 34,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  breakdownScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  sectionStack: {
    gap: Spacing.xs,
  },
  sectionBlock: {
    gap: 1,
  },
  amountStack: {
    gap: 1,
  },
  amountText: {
    flexShrink: 1,
  },
  metaLine: {
    flexShrink: 1,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 34,
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
  },
});
