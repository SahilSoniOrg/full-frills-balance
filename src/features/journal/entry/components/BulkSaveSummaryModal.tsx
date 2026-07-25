import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { SavedJournalSummary } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { useTheme } from '@/src/hooks/use-theme';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

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
    <Modal visible={!!summary} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
          <View style={styles.successHeader}>
            <AppIcon name="checkCircle" size={Size.iconLg} color={theme.primary} />
            <AppText variant="heading" weight="bold" style={styles.modalTitle}>
              Saved Successfully
            </AppText>
            <AppText variant="body" color="secondary" style={styles.modalSubtitle}>
              Recorded {summary?.count} journals to the ledger.
            </AppText>
          </View>

          <ScrollView style={styles.summaryList} contentContainerStyle={styles.summaryListContent}>
            {summary?.items.map((item, idx) => (
              <View
                key={`${item.description}-${item.amount}-${idx}`}
                style={[styles.summaryItem, { backgroundColor: theme.surfaceSecondary }]}
              >
                <AppText variant="body" weight="semibold" style={styles.itemDesc} numberOfLines={1}>
                  {item.description}
                </AppText>
                <AppText variant="body" weight="bold" style={{ color: theme.primary }}>
                  {item.amount.toFixed(2)} {item.currency}
                </AppText>
              </View>
            ))}
          </ScrollView>

          <View style={styles.modalActions}>
            <AppButton variant="outline" onPress={onContinueBulk} style={styles.modalButton}>
              Continue Bulk
            </AppButton>
            <AppButton variant="primary" onPress={onDone} style={styles.modalButton}>
              Done
            </AppButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: Shape.radius.r3,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.lg,
    ...Shape.elevation.lg,
  },
  successHeader: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  modalTitle: {
    marginTop: Spacing.sm,
  },
  modalSubtitle: {
    textAlign: 'center',
  },
  summaryList: {
    width: '100%',
    maxHeight: 220,
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
