import { BulkActionModalSurface } from '@/src/components/common/BulkActionModalSurface';
import { MoneyText } from '@/src/components/common/MoneyText';
import { AppInput, AppText, Badge } from '@/src/components/core';
import { Shape, Spacing, Typography } from '@/src/constants/design-tokens';
import { EnrichedJournal, JournalDisplayType, JournalId } from '@/src/types/domain';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface BulkRenameJournalsModalProps {
  visible: boolean;
  journals: EnrichedJournal[];
  onClose: () => void;
  onSave: (namesByJournalId: Record<JournalId, string>) => Promise<void> | void;
}

function buildInitialNames(journals: EnrichedJournal[]): Record<JournalId, string> {
  const initial: Record<JournalId, string> = {};
  for (const journal of journals) {
    initial[journal.id] =
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
    <BulkActionModalSurface
      visible={true}
      onClose={onClose}
      title="Edit Names"
      itemCount={journals.length}
      confirmLabel="Save Changes"
      onConfirm={handleSave}
      isSubmitting={isSaving}
      testID="bulk-rename-journals-modal"
    >
      {journals.map(journal => {
        const id = journal.id;
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
    </BulkActionModalSurface>
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
});
