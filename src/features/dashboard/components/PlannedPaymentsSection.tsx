import { MoneyText } from '@/src/components/common/MoneyText';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing } from '@/src/constants';
import type { PlannedOccurrenceViewModel } from '@/src/features/planned-payments';
import { useTheme } from '@/src/hooks/use-theme';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { journalDisplayTypeChrome } from '@/src/services/accounting/journalTimelineMapper';
import { JournalDisplayType } from '@/src/types/domain';
import { getNow } from '@/src/utils/dateHelpers';
import { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

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
  const [isExpanded, setIsExpanded] = useState(false);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.occurrenceDate - b.occurrenceDate);
  }, [items]);

  const hasOverdue = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    return sortedItems.some(item => new Date(item.occurrenceDate).setHours(0, 0, 0, 0) < today);
  }, [sortedItems]);

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.headerContainer}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={Opacity.heavy}
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
                width: 6,
                height: 6,
                borderRadius: 3,
                marginTop: 2,
              }}
            />
          )}
        </View>
        <AppIcon
          name={isExpanded ? 'chevronUp' : 'chevronDown'}
          size={20}
          color={theme.textSecondary}
        />
      </TouchableOpacity>

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
              <TouchableOpacity
                key={item.id}
                style={styles.row}
                onPress={() => onItemPress?.(item)}
                disabled={!canPress}
                activeOpacity={Opacity.heavy}
              >
                <View style={styles.left}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                    <AppIcon
                      name={isSimulated ? 'creditCard' : 'calendar'}
                      size={14}
                      color={typeColor || theme.textSecondary}
                    />
                    <AppText variant="body" style={{ color: dateColor, flex: 1 }} numberOfLines={1}>
                      {displayDate} — {item.title}
                    </AppText>
                  </View>
                </View>
                <AppText variant="body" weight="medium" style={{ color: typeColor || theme.text }}>
                  {chrome.amountPrefix || ''}
                  <MoneyText
                    amount={item.amount}
                    currencyCode={item.currencyCode}
                    formatStyle="compact"
                    variant="body"
                    weight="medium"
                    style={{ color: typeColor || theme.text }}
                  />
                </AppText>
              </TouchableOpacity>
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
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
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
