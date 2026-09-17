import { MoneyText } from '@/src/components/shared/MoneyText';
import { Icon, AppIcon, AppText, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import type { PlannedOccurrenceViewModel } from '@/src/features/planned-payments';
import { useEaseInLayoutAnimation } from '@/src/hooks/useEaseInLayoutAnimation';
import { useTheme } from '@/src/hooks/use-theme';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { journalDisplayTypeChrome } from '@/src/services/journal/journalTimelinePresentation';
import { JournalDisplayType } from '@/src/types/enums';
import { getNow } from '@/src/utils/dateUtils';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

/** Compact status pip — no design-token step lands on 6. */
const OVERDUE_DOT_SIZE = 6;

export interface PlannedPaymentsSectionProps {
  items: PlannedOccurrenceViewModel[];
  onItemPress?: (item: PlannedOccurrenceViewModel) => void;
}

function resolveDisplayType(displayType: string): JournalDisplayType {
  if (
    displayType === JournalDisplayType.INCOME ||
    displayType === JournalDisplayType.EXPENSE ||
    displayType === JournalDisplayType.TRANSFER ||
    displayType === JournalDisplayType.MIXED
  ) {
    return displayType;
  }
  return JournalDisplayType.EXPENSE;
}

export function PlannedPaymentsSection({ items, onItemPress }: PlannedPaymentsSectionProps) {
  const { theme } = useTheme();
  const prepareLayoutAnimation = useEaseInLayoutAnimation();
  const [isExpanded, setIsExpanded] = useState(false);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.occurrenceDate - b.occurrenceDate);
  }, [items]);

  const hasOverdue = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    return sortedItems.some(item => new Date(item.occurrenceDate).setHours(0, 0, 0, 0) < today);
  }, [sortedItems]);

  const handleToggle = useCallback(() => {
    prepareLayoutAnimation();
    setIsExpanded(prev => !prev);
  }, [prepareLayoutAnimation]);

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <PressScaleTouchable
        style={styles.headerMargin}
        surfaceStyle={styles.headerRow}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={AppConfig.strings.journal.upcoming}
        accessibilityHint={isExpanded ? 'Collapse upcoming' : 'Expand upcoming'}
        accessibilityState={{ expanded: isExpanded }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
          <AppText
            variant="subheading"
            color={hasOverdue ? 'error' : 'secondary'}
            style={styles.title}
          >
            {AppConfig.strings.journal.upcoming}
          </AppText>
          {hasOverdue && !isExpanded && (
            <View
              style={{
                backgroundColor: theme.error,
                width: OVERDUE_DOT_SIZE,
                height: OVERDUE_DOT_SIZE,
                borderRadius: OVERDUE_DOT_SIZE / 2,
                marginTop: Spacing.xs / 2,
              }}
            />
          )}
        </View>
        <AppIcon
          name={isExpanded ? Icon.ChevronUp : Icon.ChevronDown}
          size={Size.iconSm}
          color={theme.textSecondary}
        />
      </PressScaleTouchable>

      {isExpanded && (
        <View style={styles.list}>
          {sortedItems.map(item => {
            const displayType = resolveDisplayType(String(item.displayType));
            const presentation = journalPresenter.getPresentation(displayType);
            const chrome = journalDisplayTypeChrome(displayType);

            const dateObj = new Date(item.occurrenceDate);
            const dateStr = dateObj.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });
            const isToday =
              new Date(item.occurrenceDate).setHours(0, 0, 0, 0) ===
              new Date().setHours(0, 0, 0, 0);

            const isTomorrow =
              new Date(item.occurrenceDate).setHours(0, 0, 0, 0) ===
              new Date(getNow() + 86400000).setHours(0, 0, 0, 0);

            const isOverdue =
              new Date(item.occurrenceDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);

            let displayDate = dateStr;
            if (isToday) displayDate = 'Today';
            if (isTomorrow) displayDate = 'Tomorrow';

            const isDueSoon = isToday || isTomorrow;
            let dateColor = theme.textSecondary;
            if (isOverdue) dateColor = theme.error;
            else if (isDueSoon) dateColor = theme.warning;

            const typeColor = theme[presentation.colorKey as keyof typeof theme] as
              string | undefined;

            const isSimulated = item.origin === 'SIMULATED_LIABILITY';
            const canPress =
              !isSimulated || !!item.accounts.find(a => a.role === 'DESTINATION')?.id;

            return (
              <PressScaleTouchable
                key={item.id}
                surfaceStyle={styles.row}
                onPress={() => onItemPress?.(item)}
                disabled={!canPress}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${displayDate}`}
              >
                <View style={styles.left}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                    <AppIcon
                      name={isSimulated ? Icon.CreditCard : Icon.Calendar}
                      size={Size.xxs}
                      color={typeColor || theme.textSecondary}
                    />
                    <AppText variant="body" style={{ color: dateColor, flex: 1 }} numberOfLines={1}>
                      {displayDate} — {item.title}
                    </AppText>
                  </View>
                </View>
                <MoneyText
                  amount={item.amount}
                  currencyCode={item.currencyCode}
                  prefix={chrome.amountPrefix || undefined}
                  formatStyle="compact"
                  variant="body"
                  weight="medium"
                  style={{ color: typeColor || theme.text }}
                />
              </PressScaleTouchable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  headerMargin: {
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    marginBottom: 0,
  },
  list: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: {
    flex: 1,
    marginRight: Spacing.sm,
  },
});
