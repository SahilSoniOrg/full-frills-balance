import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { EnrichedJournal } from '@/src/types/domain';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { getNow } from '@/src/utils/dateHelpers';
import { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { mapJournalToCardProps } from '../utils/journalUiUtils';

export interface PlannedPaymentsSectionProps {
  items: EnrichedJournal[];
  onItemPress?: (item: EnrichedJournal) => void;
  isPrivacyMode?: boolean;
}

export function PlannedPaymentsSection({
  items,
  onItemPress,
  isPrivacyMode: isPrivacyModeOverride,
}: PlannedPaymentsSectionProps) {
  const { theme } = useTheme();
  const { isPrivacyMode: globalPrivacyMode } = useUI();
  const isPrivacyMode = isPrivacyModeOverride ?? globalPrivacyMode;
  const [isExpanded, setIsExpanded] = useState(false);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.journalDate - b.journalDate);
  }, [items]);

  const hasOverdue = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    return sortedItems.some(item => new Date(item.journalDate).setHours(0, 0, 0, 0) < today);
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
            const mapped = mapJournalToCardProps(item);

            const dateObj = new Date(mapped.transactionDate);
            const dateStr = dateObj.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });
            const isToday =
              new Date(mapped.transactionDate).setHours(0, 0, 0, 0) ===
              new Date().setHours(0, 0, 0, 0);

            const isTomorrow =
              new Date(mapped.transactionDate).setHours(0, 0, 0, 0) ===
              new Date(getNow() + 86400000).setHours(0, 0, 0, 0);

            const isOverdue =
              new Date(mapped.transactionDate).setHours(0, 0, 0, 0) <
              new Date().setHours(0, 0, 0, 0);

            let displayDate = dateStr;
            if (isToday) displayDate = 'Today';
            if (isTomorrow) displayDate = 'Tomorrow';

            const isDueSoon = isToday || isTomorrow;
            let dateColor = theme.textSecondary;
            if (isOverdue) dateColor = theme.error;
            else if (isDueSoon) dateColor = theme.warning;

            const amountStr = isPrivacyMode
              ? '••••'
              : CurrencyFormatter.format(mapped.amount, mapped.currencyCode, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                });
            const typeColor = theme[mapped.presentation.typeColor as keyof typeof theme] as
              | string
              | undefined;

            const isSynthetic = item.id.startsWith('synthetic_');

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.row}
                onPress={() => onItemPress?.(item)}
                disabled={isSynthetic && !item.accounts.find(a => a.role === 'DESTINATION')?.id}
                activeOpacity={Opacity.heavy}
              >
                <View style={styles.left}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                    <AppIcon
                      name={isSynthetic ? 'creditCard' : 'calendar'}
                      size={14}
                      color={typeColor || theme.textSecondary}
                    />
                    <AppText variant="body" style={{ color: dateColor, flex: 1 }} numberOfLines={1}>
                      {displayDate} — {mapped.title}
                    </AppText>
                  </View>
                </View>
                <AppText variant="body" weight="medium" style={{ color: typeColor || theme.text }}>
                  {mapped.presentation.amountPrefix || ''}
                  {amountStr}
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
    // override previous bottom margin because the container now handles spacing
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
