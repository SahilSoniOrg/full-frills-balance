import { StyleSheet, View } from 'react-native';
import { Icon, AppCard, AppIcon, AppText, Badge } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { ModalActions } from '@/src/components/overlays/ModalActions';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { AppConfig, BorderWidth, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { transactionCaptureStrings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { withOpacity } from '@/src/design-system/colorMath';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDateKeepingPattern } from '@/src/utils/dateFormatting';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import {
  bankEntrySign,
  signColorKey,
  signPrefix,
} from '@/src/domain/accounting/presentationPolicy';

interface DuplicateConflictResolutionModalProps {
  visible: boolean;
  item: TransactionInboxItem | null;
  defaultCurrencyCode: string;
  onClose: () => void;
  onDismiss?: () => void;
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
  onDismiss,
  onMarkDuplicateAndDismiss,
  onMerge,
  onPostAnyway,
  onViewJournal,
}: DuplicateConflictResolutionModalProps) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const privateMode = useEffectivePrivacyMode();
  const afterDismiss = useAfterDismiss();

  if (!item || !item.duplicateCandidate) {
    return null;
  }

  const candidate = item.duplicateCandidate;
  const scorePercent = Math.round(candidate.score * 100);
  const isHighConfidence = scorePercent >= 80;
  const matchColor = isHighConfidence ? theme.warning : theme.primary;

  const executeAction = (action: (item: TransactionInboxItem) => void | Promise<void>) => {
    afterDismiss.run(() => {
      void action(item);
    });
    onClose();
  };

  return (
    <ModalSurface
      visible={visible}
      title="Duplicate Conflict Detected"
      onClose={() => {
        afterDismiss.cancel();
        onClose();
      }}
      onDismiss={() => {
        afterDismiss.onDismiss();
        onDismiss?.();
      }}
      accessibilityCloseLabel="Close duplicate conflict dialog"
      contentTestID="duplicate-modal-body"
      maxHeightPercent={90}
      fixedHeight={false}
      footer={
        <ModalActions
          layout="stacked"
          actions={[
            {
              label: 'Merge into Journal',
              variant: 'primary',
              onPress: () => executeAction(onMerge),
              testID: 'duplicate-modal-merge-btn',
            },
            {
              label: 'Mark Duplicate & Dismiss',
              variant: 'secondary',
              role: 'secondary',
              onPress: () => executeAction(onMarkDuplicateAndDismiss),
              testID: 'duplicate-modal-dismiss-btn',
            },
            {
              label: 'Post as Separate Entry',
              variant: 'outline',
              role: 'secondary',
              onPress: () => executeAction(onPostAnyway),
              testID: 'duplicate-modal-post-anyway-btn',
            },
            {
              label: 'View Existing Journal',
              variant: 'ghost',
              role: 'secondary',
              onPress: () => executeAction(onViewJournal),
              testID: 'duplicate-modal-view-journal-btn',
            },
          ]}
        />
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
            {!privateMode &&
              candidate.reasons.map((reason, idx) => (
                <Badge key={`${reason}-${idx}`} size="sm">
                  {reason}
                </Badge>
              ))}
          </View>
          <AppText variant="caption" color="secondary">
            This incoming message matches an existing entry already saved in your books. Review the
            comparison below and choose an action.
          </AppText>
        </View>

        {/* Side-by-Side Comparison Container */}
        <View style={styles.comparisonWrapper}>
          {/* Incoming SMS Card */}
          <AppCard
            style={[
              styles.comparisonCard,
              { borderColor: theme.border, borderWidth: BorderWidth.thin },
            ]}
            padding="lg"
          >
            <View style={styles.cardHeader}>
              <AppIcon name={Icon.MessageSquare} size={Size.iconXs} color={theme.primary} />
              <AppText variant="caption" weight="bold" color="primary">
                INCOMING SMS / DRAFT
              </AppText>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Origin / Merchant
              </AppText>
              <AppText variant="body" weight="semibold">
                {privateMode
                  ? transactionCaptureStrings.privateDescription
                  : item.parsedMerchant || item.senderAddress || 'Unknown'}
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
                  prefix={signPrefix(bankEntrySign(item.direction)) || undefined}
                  variant="subheading"
                  weight="bold"
                  style={{ color: theme[signColorKey(bankEntrySign(item.direction))] }}
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
                {formatDateKeepingPattern(item.inputDate, 'MMM D, YYYY', resolvedHourCycle, ' ')}
              </AppText>
            </View>

            {item.referenceNumber ? (
              <View style={styles.fieldGroup}>
                <AppText variant="caption" color="secondary">
                  Reference #
                </AppText>
                <AppText variant="caption" weight="semibold">
                  {privateMode ? AppConfig.privacyMask : item.referenceNumber}
                </AppText>
              </View>
            ) : null}

            {item.rawBody ? (
              <View style={styles.fieldGroup}>
                <AppText variant="caption" color="secondary">
                  Raw Text
                </AppText>
                <AppText variant="caption" color="secondary" numberOfLines={3}>
                  {privateMode ? AppConfig.strings.journalDetails.hiddenSms : item.rawBody}
                </AppText>
              </View>
            ) : null}
          </AppCard>

          {/* Matched Journal Card */}
          <AppCard
            style={[
              styles.comparisonCard,
              { borderColor: theme.border, borderWidth: BorderWidth.thin },
            ]}
            padding="lg"
          >
            <View style={styles.cardHeader}>
              <AppIcon name={Icon.Document} size={Size.iconXs} color={theme.textSecondary} />
              <AppText variant="caption" weight="bold" color="secondary">
                EXISTING ENTRY
              </AppText>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Description / Title
              </AppText>
              <AppText variant="body" weight="semibold">
                {privateMode
                  ? AppConfig.privacyMask
                  : candidate.description || 'Untitled Transaction'}
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
                {formatDateKeepingPattern(
                  candidate.journalDate,
                  'MMM D, YYYY',
                  resolvedHourCycle,
                  ' ',
                )}
              </AppText>
            </View>

            <View style={styles.fieldGroup}>
              <AppText variant="caption" color="secondary">
                Status
              </AppText>
              <AppText variant="caption" weight="semibold" color="secondary">
                Saved in Books
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
    borderWidth: BorderWidth.thin,
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
});
