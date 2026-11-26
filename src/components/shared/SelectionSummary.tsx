import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { Inline } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import type { AccountTypeColorKey } from '@/src/design-system/accountPresentation';
import {
  flowSignForAmount,
  signColorKey,
  signPrefix,
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

type SelectionAmountSummaryBase = {
  label: string;
  incomplete?: boolean;
  /** Number of selected items that contributed to `amounts` (defaults to `selectedCount`). */
  includedCount?: number;
  /** Signed flow amounts use presentationPolicy prefixes and income/expense ink. */
  signed?: boolean;
};

export type SelectionAmountSummary =
  | (SelectionAmountSummaryBase & {
      amounts: readonly MoneyAmount[];
      sections?: never;
    })
  | (SelectionAmountSummaryBase & {
      /** When multiple account types are selected, render each type as its own labeled block. */
      sections: readonly SelectionAmountSection[];
      amounts?: never;
    });

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

function joinMeta(parts: readonly (string | undefined)[]): string | undefined {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(' · ') : undefined;
}

type ThemeColors = ReturnType<typeof useSelectionBarSurface>['theme'];

type FormattedSummaryMoney = {
  displayAmount: number;
  prefix: string | undefined;
  color: string;
};

function formatSummaryMoney(
  amount: number,
  currencyCode: string,
  signed: boolean,
  theme: ThemeColors,
): FormattedSummaryMoney {
  // Round to currency precision before deriving sign so tiny averages (e.g. -0.01 / 3) don't render "− $0.00".
  const rounded = Money.from(amount, currencyCode).round().amount || 0;
  if (!signed) {
    return { displayAmount: rounded, prefix: undefined, color: theme.text };
  }
  const sign = flowSignForAmount(rounded);
  return {
    displayAmount: Math.abs(rounded),
    prefix: signPrefix(sign),
    color: theme[signColorKey(sign)],
  };
}

function SummaryMoneyList({
  amounts,
  signed,
  theme,
  keyPrefix,
}: {
  amounts: readonly MoneyAmount[];
  signed: boolean;
  theme: ThemeColors;
  keyPrefix?: string;
}) {
  return (
    <>
      {amounts.map(({ amount, currencyCode }) => {
        const formatted = formatSummaryMoney(amount, currencyCode, signed, theme);
        return (
          <MoneyText
            key={keyPrefix ? `${keyPrefix}-${currencyCode}` : currencyCode}
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
    </>
  );
}

function resolveDisplayAmounts(amountSummary: SelectionAmountSummary | undefined): {
  displayAmounts: readonly MoneyAmount[];
  showSections: boolean;
  sections: readonly SelectionAmountSection[] | undefined;
  label: string | undefined;
  incomplete: boolean | undefined;
  includedCount: number | undefined;
  signed: boolean;
} {
  const {
    amounts,
    sections,
    label,
    incomplete,
    includedCount,
    signed = false,
  } = amountSummary ?? {};
  const showSections = (sections?.length ?? 0) > 1;
  const displayAmounts = showSections
    ? []
    : (amounts ?? (sections?.length === 1 ? sections[0].amounts : []));
  return {
    displayAmounts,
    showSections,
    sections,
    label,
    incomplete,
    includedCount,
    signed,
  };
}

function buildSelectionMeta({
  selectedCount,
  selectableCount,
  selectedSelectableCount,
  itemTypeLabel,
  amountSummary,
  formatMoney,
  theme,
}: {
  selectedCount: number;
  selectableCount: number;
  selectedSelectableCount: number;
  itemTypeLabel: SelectionItemLabel;
  amountSummary: SelectionAmountSummary | undefined;
  formatMoney: ReturnType<typeof useMoneyFormat>;
  theme: ThemeColors;
}): {
  countLabel: string;
  metaLine: string | undefined;
  displayAmounts: readonly MoneyAmount[];
  showSections: boolean;
  sections: readonly SelectionAmountSection[] | undefined;
  signed: boolean;
  incomplete: boolean | undefined;
  singleAmount: MoneyAmount | null;
  singleMoney: FormattedSummaryMoney | null;
} {
  const copy = AppConfig.strings.selection;
  const showRatio = selectableCount > 0 && selectedSelectableCount === selectedCount;
  const itemLabel = resolveItemTypeLabel(
    itemTypeLabel,
    showRatio ? selectableCount : selectedCount,
  );
  // Ratio: "2 of 10"; otherwise just the count — never "2 selected transactions".
  const compactCount = showRatio
    ? copy.countOfTotal(selectedCount, selectableCount)
    : String(selectedCount);
  const countWithType = `${compactCount} ${itemLabel}`;
  const countLabel = copy.selectedCount(
    showRatio ? copy.countOfTotal(selectedCount, selectableCount) : selectedCount,
    itemLabel,
  );
  const remaining = Math.max(0, selectableCount - selectedSelectableCount);
  const { displayAmounts, showSections, sections, label, incomplete, includedCount, signed } =
    resolveDisplayAmounts(amountSummary);
  const hasAmounts = displayAmounts.length > 0 || showSections;
  const amountLabel =
    hasAmounts && label
      ? incomplete
        ? copy.partialAmount(label)
        : label
      : incomplete
        ? copy.totalUnavailable
        : undefined;
  const multipleCurrencies = displayAmounts.length > 1;
  const singleAmount =
    hasAmounts && !multipleCurrencies && !showSections ? (displayAmounts[0] ?? null) : null;
  const singleMoney = singleAmount
    ? formatSummaryMoney(singleAmount.amount, singleAmount.currencyCode, signed, theme)
    : null;
  const contributingCount = includedCount ?? selectedCount;
  const averageMeta =
    singleAmount && !incomplete && selectedCount > 1 && contributingCount === selectedCount
      ? (() => {
          const avg = formatSummaryMoney(
            singleAmount.amount / selectedCount,
            singleAmount.currencyCode,
            signed,
            theme,
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

  return {
    countLabel,
    metaLine,
    displayAmounts,
    showSections,
    sections,
    signed,
    incomplete,
    singleAmount,
    singleMoney,
  };
}

function PartialAmountBadge({
  incomplete,
  label,
  theme,
}: {
  incomplete: boolean | undefined;
  label: string | undefined;
  theme: ThemeColors;
}) {
  const copy = AppConfig.strings.selection;
  if (!incomplete) return null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={copy.partialAmount(label ?? copy.signedTotal)}
    >
      <AppIcon name={Icon.Alert} size={Size.iconXs} color={theme.warning} />
    </View>
  );
}

function AmountBreakdown({
  showSections,
  sections,
  displayAmounts,
  signed,
  theme,
  maxBreakdownHeight,
  incomplete,
  label,
}: {
  showSections: boolean;
  sections: readonly SelectionAmountSection[] | undefined;
  displayAmounts: readonly MoneyAmount[];
  signed: boolean;
  theme: ThemeColors;
  maxBreakdownHeight: number;
  incomplete: boolean | undefined;
  label: string | undefined;
}) {
  const multipleCurrencies = displayAmounts.length > 1;
  if (!(showSections || multipleCurrencies)) return null;

  return (
    <Inline align={showSections ? 'flex-start' : 'center'} gap="xs">
      <ScrollView
        style={[styles.breakdownScroll, { maxHeight: maxBreakdownHeight }]}
        contentContainerStyle={showSections ? styles.sectionStack : styles.amountStack}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        testID="selection-summary-breakdown"
      >
        {showSections && sections ? (
          sections.map(section => (
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
                <SummaryMoneyList
                  amounts={section.amounts}
                  signed={signed}
                  theme={theme}
                  keyPrefix={section.label}
                />
              </View>
            </View>
          ))
        ) : (
          <SummaryMoneyList amounts={displayAmounts} signed={signed} theme={theme} />
        )}
      </ScrollView>
      <PartialAmountBadge incomplete={incomplete} label={label} theme={theme} />
    </Inline>
  );
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

  const {
    countLabel,
    metaLine,
    displayAmounts,
    showSections,
    sections,
    signed,
    incomplete,
    singleAmount,
    singleMoney,
  } = buildSelectionMeta({
    selectedCount,
    selectableCount,
    selectedSelectableCount,
    itemTypeLabel,
    amountSummary,
    formatMoney,
    theme,
  });

  const multipleCurrencies = displayAmounts.length > 1;
  const toggleDisabled = selectableCount === 0;
  const allSelected = checked === true;
  const toggleIcon = allSelected ? Icon.CheckSquare : Icon.Square;
  const toggleTint = toggleDisabled ? theme.textTertiary : allSelected ? theme.primary : theme.text;

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
            {showSections || multipleCurrencies ? (
              <AmountBreakdown
                showSections={showSections}
                sections={sections}
                displayAmounts={displayAmounts}
                signed={signed}
                theme={theme}
                maxBreakdownHeight={maxBreakdownHeight}
                incomplete={incomplete}
                label={amountSummary?.label}
              />
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
                <PartialAmountBadge
                  incomplete={incomplete}
                  label={amountSummary?.label}
                  theme={theme}
                />
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
