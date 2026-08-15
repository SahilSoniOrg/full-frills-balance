import { ModalSurface } from '@/src/components/common/ModalSurface';
import { MoneyText } from '@/src/components/common/MoneyText';
import { AppButton, AppInput, AppText, Badge } from '@/src/components/core';
import { Shape, Spacing, Typography } from '@/src/constants/design-tokens';
import Journal from '@/src/data/models/Journal';
import { useTheme } from '@/src/hooks/use-theme';
import { EnrichedJournal, JournalDisplayType, JournalId } from '@/src/types/domain';
import { formatDate } from '@/src/utils/dateUtils';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface BulkRenameJournalsModalProps {
  visible: boolean;
  journals: (Journal | EnrichedJournal)[];
  onClose: () => void;
  onSave: (namesByJournalId: Record<JournalId, string>) => Promise<void> | void;
}

function buildInitialNames(journals: (Journal | EnrichedJournal)[]): Record<JournalId, string> {
  const initial: Record<JournalId, string> = {};
  for (const journal of journals) {
    initial[journal.id as JournalId] =
      journal.description || ('semanticLabel' in journal ? journal.semanticLabel : '') || '';
  }
  return initial;
}

function BulkRenameJournalsModalContent({
  journals,
  onClose,
  onSave,
}: Omit<BulkRenameJournalsModalProps, 'visible'>) {
  const { theme, fonts } = useTheme();
  const [names, setNames] = useState<Record<JournalId, string>>(() => buildInitialNames(journals));
  const [isSaving, setIsSaving] = useState(false);

  const handleChangeText = useCallback((id: JournalId, text: string) => {
    setNames(prev => ({ ...prev, [id]: text }));
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(names);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [names, onSave, onClose]);

  return (
    <ModalSurface
      visible={true}
      onClose={onClose}
      title="Edit Names"
      fixedHeight={false}
      scrollable={true}
      footer={
        <View style={styles.footerRow}>
          <AppButton variant="outline" onPress={onClose} style={styles.button} disabled={isSaving}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onPress={handleSave}
            style={styles.button}
            loading={isSaving}
          >
            Save Changes
          </AppButton>
        </View>
      }
    >
      {journals.map(journal => {
        const id = journal.id as JournalId;
        const dateStr = formatDate(journal.journalDate, { includeTime: false });
        const displayType = (journal.displayType || 'expense') as JournalDisplayType;

        return (
          <View
            key={id}
            style={[
              styles.row,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <View style={styles.rowTop}>
              <View style={styles.rowMeta}>
                <Badge size="sm" variant="default">
                  {displayType.toUpperCase()}
                </Badge>
                <AppText style={[styles.dateText, { color: theme.textSecondary }]}>
                  {dateStr}
                </AppText>
              </View>
              <MoneyText
                amount={journal.totalAmount}
                currencyCode={journal.currencyCode}
                style={[styles.amountText, { fontFamily: fonts.semibold, color: theme.text }]}
              />
            </View>

            <AppInput
              value={names[id] ?? ''}
              onChangeText={text => handleChangeText(id, text)}
              placeholder="Transaction description / payee"
              placeholderTextColor={theme.textTertiary}
            />
          </View>
        );
      })}
    </ModalSurface>
  );
}

export function BulkRenameJournalsModal(props: BulkRenameJournalsModalProps) {
  const { visible } = props;
  if (!visible) return null;
  return <BulkRenameJournalsModalContent {...props} />;
}

const styles = StyleSheet.create({
  row: {
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dateText: {
    fontSize: Typography.sizes.xs,
  },
  amountText: {
    fontSize: Typography.sizes.sm,
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  button: {
    flex: 1,
  },
});
