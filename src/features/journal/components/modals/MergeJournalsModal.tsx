import { BulkActionModalSurface } from '@/src/components/common/BulkActionModalSurface';
import { MoneyText } from '@/src/components/common/MoneyText';
import { AppIcon, AppInput, AppText, Badge } from '@/src/components/core';
import { Shape, Spacing, Typography } from '@/src/constants/design-tokens';
import { useAccounts } from '@/src/components/account-selection';
import { useTheme } from '@/src/hooks/use-theme';
import { analyzeJournalsForMerge, MergeJournalsAnalysis } from '@/src/services/journal/bulk';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { formatDate } from '@/src/utils/dateUtils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export interface MergeJournalsModalProps {
  visible: boolean;
  workplaceId: WorkplaceId;
  journalIds: JournalId[];
  onClose: () => void;
  onConfirmMerge: (params: { description: string; journalDate: number }) => Promise<void> | void;
}

function MergeJournalsModalContent({
  workplaceId,
  journalIds,
  onClose,
  onConfirmMerge,
}: Omit<MergeJournalsModalProps, 'visible'>) {
  const { theme, fonts } = useTheme();
  const { accounts } = useAccounts(workplaceId);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<MergeJournalsAnalysis | null>(null);
  const [description, setDescription] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const accountsById = useMemo(() => new Map(accounts.map(a => [a.id, a.name])), [accounts]);

  useEffect(() => {
    let isMounted = true;
    analyzeJournalsForMerge(workplaceId, journalIds)
      .then(res => {
        if (isMounted) {
          setPreview(res);
          setDescription(res.combinedDescription);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workplaceId, journalIds]);

  const handleConfirm = useCallback(async () => {
    if (!preview || !preview.canMerge) return;
    setIsMerging(true);
    try {
      await onConfirmMerge({
        description: description.trim() || preview.combinedDescription,
        journalDate: preview.suggestedDate,
      });
    } finally {
      setIsMerging(false);
    }
  }, [preview, description, onConfirmMerge]);

  return (
    <BulkActionModalSurface
      visible={true}
      onClose={onClose}
      title="Merge Journal Entries"
      itemCount={journalIds.length}
      confirmLabel="Merge Journal Entries"
      onConfirm={handleConfirm}
      isSubmitting={isMerging}
      isConfirmDisabled={!preview?.canMerge}
      testID="merge-journals-modal"
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <AppText style={[styles.loadingText, { color: theme.textSecondary }]}>
            Analyzing merge preview...
          </AppText>
        </View>
      ) : !preview ? (
        <View style={styles.emptyContainer}>
          <AppText style={{ color: theme.textTertiary }}>Unable to load merge preview.</AppText>
        </View>
      ) : !preview.canMerge ? (
        <View style={styles.errorContainer}>
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.error },
            ]}
          >
            <AppIcon name="alert" size={20} color={theme.error} />
            <AppText style={[styles.errorText, { color: theme.error }]}>
              {preview.reason || 'These journal entries cannot be merged.'}
            </AppText>
          </View>
        </View>
      ) : (
        <View>
          {/* Preview Summary */}
          <View
            style={[
              styles.previewSection,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <View style={styles.previewHeader}>
              <Badge size="sm" variant="default">
                MERGED RESULT PREVIEW
              </Badge>
              <AppText style={[styles.previewDate, { color: theme.textSecondary }]}>
                {formatDate(preview.suggestedDate, { includeTime: false })}
              </AppText>
            </View>

            <View style={styles.inputGroup}>
              <AppText style={[styles.inputLabel, { color: theme.textSecondary }]}>
                Merged Description
              </AppText>
              <AppInput
                value={description}
                onChangeText={setDescription}
                placeholder="Enter consolidated description"
                placeholderTextColor={theme.textTertiary}
              />
            </View>

            <View style={styles.totalRow}>
              <AppText style={[styles.totalLabel, { color: theme.textSecondary }]}>
                Total Amount:
              </AppText>
              <MoneyText
                amount={preview.totalDebit}
                currencyCode={preview.currencyCode}
                style={[styles.totalAmount, { fontFamily: fonts.bold, color: theme.text }]}
              />
            </View>
          </View>

          {/* Combined Legs Breakdown */}
          <View style={styles.breakdownHeader}>
            <AppText
              style={[styles.sectionHeading, { fontFamily: fonts.semibold, color: theme.text }]}
            >
              Consolidated Legs ({preview.combinedLines.length})
            </AppText>
          </View>

          {preview.combinedLines.map(line => (
            <View
              key={`${line.accountId}_${line.transactionType}`}
              style={[
                styles.legRow,
                { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
              ]}
            >
              <View style={styles.legMeta}>
                <Badge
                  size="sm"
                  variant={line.transactionType === 'DEBIT' ? 'default' : 'secondary'}
                >
                  {line.transactionType === 'DEBIT' ? 'DEST' : 'SRC'}
                </Badge>
                <AppText style={[styles.accountName, { color: theme.text }]}>
                  {accountsById.get(line.accountId) || 'Account'}
                </AppText>
              </View>
              <MoneyText
                amount={line.amount}
                currencyCode={preview.currencyCode}
                style={[styles.legAmount, { fontFamily: fonts.semibold, color: theme.text }]}
              />
            </View>
          ))}

          {/* Original Journal Entries Reference */}
          <View style={[styles.breakdownHeader, { marginTop: Spacing.md }]}>
            <AppText
              style={[styles.sectionHeading, { fontFamily: fonts.semibold, color: theme.text }]}
            >
              Journal Entries to Merge ({preview.sourceJournals.length})
            </AppText>
          </View>

          {preview.sourceJournals.map(j => (
            <View
              key={j.id}
              style={[
                styles.sourceRow,
                { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
              ]}
            >
              <View style={styles.sourceMeta}>
                <AppText style={[styles.sourceDesc, { color: theme.text }]} numberOfLines={1}>
                  {j.description || 'Transaction'}
                </AppText>
                <AppText style={[styles.sourceDate, { color: theme.textTertiary }]}>
                  {formatDate(j.journalDate, { includeTime: false })}
                </AppText>
              </View>
              <MoneyText
                amount={j.totalAmount}
                currencyCode={j.currencyCode}
                style={[styles.sourceAmount, { fontFamily: fonts.semibold, color: theme.text }]}
              />
            </View>
          ))}
        </View>
      )}
    </BulkActionModalSurface>
  );
}

export function MergeJournalsModal(props: MergeJournalsModalProps) {
  const { visible } = props;
  if (!visible) return null;
  return <MergeJournalsModalContent {...props} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.sizes.sm,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  errorContainer: {
    paddingVertical: Spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
  },
  errorText: {
    fontSize: Typography.sizes.sm,
    flex: 1,
  },
  previewSection: {
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  previewDate: {
    fontSize: Typography.sizes.xs,
  },
  inputGroup: {
    marginBottom: Spacing.sm,
  },
  inputLabel: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
  },
  totalLabel: {
    fontSize: Typography.sizes.sm,
  },
  totalAmount: {
    fontSize: Typography.sizes.base,
  },
  breakdownHeader: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionHeading: {
    fontSize: Typography.sizes.sm,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: Shape.radius.sm,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  legMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  accountName: {
    fontSize: Typography.sizes.sm,
  },
  legAmount: {
    fontSize: Typography.sizes.sm,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: Shape.radius.sm,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  sourceMeta: {
    flex: 1,
    marginRight: Spacing.md,
  },
  sourceDesc: {
    fontSize: Typography.sizes.xs,
  },
  sourceDate: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  sourceAmount: {
    fontSize: Typography.sizes.xs,
  },
});
