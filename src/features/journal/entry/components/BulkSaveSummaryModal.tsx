import { Icon, AppButton, AppIcon, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Shape, Size, Spacing } from '@/src/constants';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { StyleSheet, View } from 'react-native';

export interface BulkSaveSummaryModalProps {
  summary: { count: number; items: SavedJournalSummary[] } | null;
  onClose: () => void;
  onContinueBulk: () => void;
  onDone: () => void;
}

export function BulkSaveSummaryModal({
  summary,
  onClose,
  onContinueBulk,
  onDone,
}: BulkSaveSummaryModalProps) {
  const { theme } = useTheme();

  return (
    <ModalSurface
      visible={!!summary}
      title="Saved Successfully"
      onClose={onClose}
      position="center"
      fixedHeight={false}
      scrollable
      maxHeightPercent={85}
      accessibilityCloseLabel="Close save summary"
      footer={
        <View style={styles.modalActions}>
          <AppButton variant="outline" onPress={onContinueBulk} style={styles.modalButton}>
            Keep Adding
          </AppButton>
          <AppButton variant="primary" onPress={onDone} style={styles.modalButton}>
            Done
          </AppButton>
        </View>
      }
    >
      <View style={styles.successHeader}>
        <AppIcon name={Icon.CheckCircle} size={Size.iconLg} color={theme.primary} />
        <AppText variant="body" color="secondary" style={styles.modalSubtitle}>
          Recorded {summary?.count} entries.
        </AppText>
      </View>

      <View style={styles.summaryListContent}>
        {summary?.items.map((item, idx) => (
          <View
            key={`${item.description}-${item.amount}-${idx}`}
            style={[styles.summaryItem, { backgroundColor: theme.surfaceSecondary }]}
          >
            <AppText variant="body" weight="semibold" style={styles.itemDesc} numberOfLines={1}>
              {item.description}
            </AppText>
            <AppText variant="body" weight="bold" style={{ color: theme.primary }}>
              {CurrencyFormatter.formatAmount(item.amount, item.currency)}
            </AppText>
          </View>
        ))}
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  successHeader: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  modalSubtitle: {
    textAlign: 'center',
  },
  summaryListContent: {
    gap: Spacing.sm,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: Shape.radius.r2,
  },
  itemDesc: {
    flex: 1,
    marginRight: Spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginTop: Spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
});
