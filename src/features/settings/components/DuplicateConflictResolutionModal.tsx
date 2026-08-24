import { StyleSheet, View } from 'react-native';
import dayjs from 'dayjs';
import { AppButton, AppCard, AppIcon, AppText, Badge } from '@/src/components/core';
import { MoneyText } from '@/src/components/common/MoneyText';
import { ModalSurface } from '@/src/components/common/ModalSurface';
import { Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { TransactionInboxItem } from '@/src/types/domainJournal';

interface DuplicateConflictResolutionModalProps {
  visible: boolean;
  item: TransactionInboxItem | null;
  defaultCurrencyCode: string;
  onClose: () => void;
  onMarkDuplicateAndDismiss: (item: TransactionInboxItem) => Promise<void> | void;
  onMerge: (item: TransactionInboxItem) => Promise<void> | void;
  onPostAnyway: (item: TransactionInboxItem) => void;
  onViewJournal: (item: TransactionInboxItem) => void;
}

export function DuplicateConflictResolutionModal({
  visible,
  item,
  defaultCurrencyCode,
  onClose,
  onMarkDuplicateAndDismiss,
  onMerge,
  onPostAnyway,
  onViewJournal,
}: DuplicateConflictResolutionModalProps) {
  const { theme } = useTheme();

  if (!item || !item.duplicateCandidate) {
    return null;
  }

  const candidate = item.duplicateCandidate;
  const scorePercent = Math.round(candidate.score * 100);
  const isHighConfidence = scorePercent >= 80;
  const matchColor = isHighConfidence ? theme.warning : theme.primary;

  const executeAction = (action: (item: TransactionInboxItem) => void | Promise<void>) => {
    onClose();
    action(item);
  };

  return (
    <ModalSurface
      visible={visible}
      title="Duplicate Conflict Detected"
      onClose={onClose}
      accessibilityCloseLabel="Close duplicate conflict dialog"
      maxHeightPercent={90}
      fixedHeight={false}
      footer={
        <View style={styles.footerActions}>
          <View style={styles.buttonRow}>
            <AppButton
              variant="outline"
              size="sm"
              style={styles.actionBtn}
              onPress={() => executeAction(onMerge)}
              testID="duplicate-modal-merge-btn"
            >
              Merge into Journal
            </AppButton>
            <AppButton
              variant="secondary"
              size="sm"
              style={styles.actionBtn}
              onPress={() => executeAction(onMarkDuplicateAndDismiss)}
              testID="duplicate-modal-dismiss-btn"
            >
              Mark Duplicate & Dismiss
            </AppButton>
          </View>
          <View style={styles.buttonRow}>
            <AppButton
              variant="outline"
              size="sm"
              style={styles.actionBtn}
              onPress={() => executeAction(onPostAnyway)}
              testID="duplicate-modal-post-anyway-btn"
            >
              Post as Separate Entry
            </AppButton>
            <AppButton
              variant="ghost"
              size="sm"
              style={styles.actionBtn}
              onPress={() => executeAction(onViewJournal)}
              testID="duplicate-modal-view-journal-btn"
            >
              View Existing Journal
            </AppButton>
          </View>
        </View>
      }
    >
      <View style={styles.container}>
        {/* Match Header / Confidence Banner */}
        <View
          style={[
            styles.matchBanner,
            {
              backgroundColor: withOpacity(matchColor, Opacity.soft),
              borderColor: withOpacity(matchColor, Opacity.medium),
            },
          ]}
        >
          <View style={styles.matchBadgeRow}>
            <Badge
              size="sm"
              backgroundColor={withOpacity(matchColor, Opacity.soft)}
              textColor={matchColor}
            >
              {scorePercent > 0 ? `${scorePercent}% Match` : 'Likely Duplicate'}
            </Badge>
            {candidate.reasons.map((reason, idx) => (
              <Badge key={`${reason}-${idx}`} size="sm">
                {reason}
              </Badge>
            ))}
          </View>
          <AppText variant="caption" color="secondary">
            This incoming message matches an existing entry already posted in your ledger. Review
            the comparison below and choose an action.
          </AppText>
        </View>

        {/* Side-by-Side Comparison Container */}
        <View style={styles.comparisonWrapper}>
          {/* Incoming SMS Card */}
          <AppCard
            style={[styles.comparisonCard, { borderColor: theme.border, borderWidth: 1 }]}
            paddingSize="md"
          >
            <View style={styles.cardHeader}>
              <AppIcon name="messageSquare" size={14} color={theme.primary} />
              <AppText variant="caption" weight="bold" color="primary">
                INCOMING SMS / DRAFT
              </AppText>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Origin / Merchant
              </AppText>
              <AppText variant="body" weight="semibold">
                {item.parsedMerchant || item.senderAddress || 'Unknown'}
              </AppText>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Amount
              </AppText>
              {item.parsedAmount != null ? (
                <MoneyText
                  amount={item.parsedAmount}
                  currencyCode={item.parsedCurrencyCode || defaultCurrencyCode}
                  prefix={item.direction === 'credit' ? '+ ' : '- '}
                  variant="subheading"
                  weight="bold"
                  style={{ color: item.direction === 'credit' ? theme.success : theme.text }}
                />
              ) : (
                <AppText variant="body" color="secondary">
                  No amount detected
                </AppText>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Date & Time
              </AppText>
              <AppText variant="caption">
                {dayjs(item.inputDate).format('MMM D, YYYY h:mm A')}
              </AppText>
            </View>

            {item.referenceNumber ? (
              <View style={styles.fieldGroup}>
                <AppText variant="caption" color="secondary">
                  Reference #
                </AppText>
                <AppText variant="caption" weight="semibold">
                  {item.referenceNumber}
                </AppText>
              </View>
            ) : null}

            {item.rawBody ? (
              <View style={styles.fieldGroup}>
                <AppText variant="caption" color="secondary">
                  Raw Text
                </AppText>
                <AppText variant="caption" color="secondary" numberOfLines={3}>
                  {item.rawBody}
                </AppText>
              </View>
            ) : null}
          </AppCard>

          {/* Matched Journal Card */}
          <AppCard
            style={[styles.comparisonCard, { borderColor: theme.border, borderWidth: 1 }]}
            paddingSize="md"
          >
            <View style={styles.cardHeader}>
              <AppIcon name="bookOpen" size={14} color={theme.textSecondary} />
              <AppText variant="caption" weight="bold" color="secondary">
                EXISTING JOURNAL ENTRY
              </AppText>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Description / Title
              </AppText>
              <AppText variant="body" weight="semibold">
                {candidate.description || 'Untitled Transaction'}
              </AppText>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Amount
              </AppText>
              {candidate.totalAmount != null ? (
                <MoneyText
                  amount={candidate.totalAmount}
                  currencyCode={candidate.currencyCode || defaultCurrencyCode}
                  variant="subheading"
                  weight="bold"
                />
              ) : (
                <AppText variant="body" color="secondary">
                  Not available
                </AppText>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Date & Time
              </AppText>
              <AppText variant="caption">
                {dayjs(candidate.journalDate).format('MMM D, YYYY h:mm A')}
              </AppText>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Ledger Status
              </AppText>
              <AppText variant="caption" weight="semibold" color="secondary">
                Posted in Ledger
              </AppText>
            </View>
          </AppCard>
        </View>
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  matchBanner: {
    padding: Spacing.sm,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  matchBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  comparisonWrapper: {
    gap: Spacing.sm,
  },
  comparisonCard: {
    gap: Spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  fieldGroup: {
    marginBottom: Spacing.xs,
  },
  footerActions: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionBtn: {
    flex: 1,
  },
});
