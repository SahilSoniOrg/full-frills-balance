import { MoneyText } from '@/src/components/shared/MoneyText';
import {
  Icon,
  AppButton,
  AppCard,
  AppIcon,
  AppText,
  Badge,
  ListGroup,
} from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useEffect, useRef, useState } from 'react';
import { Opacity, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDateKeepingPattern } from '@/src/utils/dateUtils';
import { inboxProcessingStatusLabel } from './inboxProcessingStatusLabel';
import { Platform, StyleSheet, View } from 'react-native';
import { EmailPreviewModal } from './EmailPreviewModal';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { accountMatcherStrings } from '@/src/constants/copy/domains/accountMatcherStrings';
import { transactionCaptureStrings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { useInboxItemActions } from '@/src/features/settings/hooks/useInboxItemActions';

/** Android Modal does not fire onDismiss; wait for the More sheet to finish closing. */
const MENU_CLOSE_BEFORE_ATTACH_MS = Platform.OS === 'android' ? 320 : 0;

interface TransactionInboxItemCardViewProps {
  item: TransactionInboxItem;
  currencyCode: string;
  handleDismiss: (item: TransactionInboxItem) => Promise<void>;
  handleUndismiss: (item: TransactionInboxItem) => Promise<void>;
  handleImport: (item: TransactionInboxItem) => void;
  onCompareDuplicate: (item: TransactionInboxItem) => void;
  onAttachToJournal: (item: TransactionInboxItem) => void;
  onDetachFromJournal: (item: TransactionInboxItem) => void;
  onOpenJournal: (item: TransactionInboxItem) => void;
  onSplitImport: (item: TransactionInboxItem) => void;
  onEditReparse: (item: TransactionInboxItem) => void;
  testID?: string;
}

export function TransactionInboxItemCardView({
  item,
  currencyCode,
  handleDismiss,
  handleUndismiss,
  handleImport,
  onCompareDuplicate,
  onAttachToJournal,
  onDetachFromJournal,
  onOpenJournal,
  onSplitImport,
  onEditReparse,
  testID,
}: TransactionInboxItemCardViewProps) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const privateMode = useEffectivePrivacyMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const pendingAfterMenuClose = useRef<(() => void) | null>(null);

  const flushPendingAfterMenuClose = () => {
    const next = pendingAfterMenuClose.current;
    if (!next) return;
    pendingAfterMenuClose.current = null;
    next();
  };

  useEffect(() => {
    if (menuOpen || !pendingAfterMenuClose.current) return;
    const timer = setTimeout(flushPendingAfterMenuClose, MENU_CLOSE_BEFORE_ATTACH_MS);
    return () => clearTimeout(timer);
  }, [menuOpen]);

  const channelIcon =
    item.channel === 'voice' ? Icon.Mic : item.channel === 'email' ? Icon.Mail : Icon.MessageSquare;
  const channelLabel =
    item.channel === 'voice'
      ? transactionCaptureStrings.inboxChannelSpoken
      : item.channel === 'email'
        ? transactionCaptureStrings.inboxChannelEmail
        : transactionCaptureStrings.inboxChannelSms;
  const linkedJournalUnavailable =
    item.linkedJournal?.status === 'DELETED' || item.linkedJournal?.status === 'MISSING';
  const linkedJournalColor = linkedJournalUnavailable ? theme.warning : theme.success;
  const linkedJournalLabel =
    item.linkedJournal?.status === 'DELETED'
      ? 'deleted journal'
      : item.linkedJournal?.status === 'MISSING'
        ? 'unavailable journal'
        : 'linked journal';

  const title = privateMode
    ? transactionCaptureStrings.privateDescription
    : item.channel === 'voice'
      ? transactionCaptureStrings.inboxSpokenDraft
      : item.parsedMerchant || item.senderAddress || transactionCaptureStrings.inboxUnknownOrigin;
  const { primary, more, split } = useInboxItemActions(
    item,
    {
      handleDismiss,
      handleUndismiss,
      handleImport,
      onCompareDuplicate,
      // Queue attach until More closes so Android does not stack native modals.
      onAttachToJournal: attachItem => {
        pendingAfterMenuClose.current = () => onAttachToJournal(attachItem);
        setMenuOpen(false);
      },
      onDetachFromJournal: detachItem => {
        pendingAfterMenuClose.current = () => onDetachFromJournal(detachItem);
        setMenuOpen(false);
      },
      onOpenJournal,
      onSplitImport,
      onEditReparse,
    },
    { onBeforeAction: () => setMenuOpen(false) },
  );

  return (
    <AppCard style={styles.card} testID={testID}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.channelHeader}>
            <AppIcon name={channelIcon} size={14} color={theme.textTertiary} />
            <AppText variant="caption" color="secondary" weight="bold">
              {channelLabel}
            </AppText>
          </View>
          <AppText variant="subheading">{title}</AppText>
          <AppText variant="caption" color="secondary">
            {formatDateKeepingPattern(item.inputDate, 'MMM D, YYYY', resolvedHourCycle, ' ')}
          </AppText>
        </View>
        <View style={styles.amountColumn}>
          {item.parsedAmount != null ? (
            <MoneyText
              amount={item.parsedAmount}
              currencyCode={item.parsedCurrencyCode || currencyCode}
              prefix={item.direction === 'credit' ? '+ ' : '- '}
              variant="subheading"
              style={{ color: item.direction === 'credit' ? theme.success : theme.text }}
            />
          ) : (
            <AppText variant="subheading">No amount</AppText>
          )}
          {item.parsedCurrencyCode && (
            <AppText variant="caption" color="secondary">
              {item.parsedCurrencyCode}
            </AppText>
          )}
        </View>
      </View>

      <View style={styles.badges}>
        <Badge
          size="sm"
          backgroundColor={withOpacity(theme.primary, Opacity.soft)}
          textColor={theme.primary}
        >
          {inboxProcessingStatusLabel(item.processingStatus)}
        </Badge>
        {item.duplicateCandidate && (
          <Badge
            size="sm"
            backgroundColor={withOpacity(theme.warning, Opacity.soft)}
            textColor={theme.warning}
          >
            likely duplicate
          </Badge>
        )}
        {item.linkedJournal && (
          <Badge
            size="sm"
            backgroundColor={withOpacity(linkedJournalColor, Opacity.soft)}
            textColor={linkedJournalColor}
          >
            {linkedJournalLabel}
          </Badge>
        )}
      </View>

      {item.recognitionRefreshState ? (
        <AppText variant="caption" color="secondary">
          {item.recognitionRefreshState === 'updating'
            ? 'Updating account recognition…'
            : 'Account recognition could not be updated.'}
        </AppText>
      ) : !privateMode && (item.recognition?.hold || !!item.recognizedAccountNames?.length) ? (
        <View
          style={styles.recognitionNote}
          accessibilityRole={item.recognition?.hold ? 'alert' : undefined}
        >
          <AppIcon
            name={item.recognition?.hold ? Icon.Alert : Icon.Check}
            size={Size.iconXs}
            color={item.recognition?.hold ? theme.warning : theme.textSecondary}
          />
          <View style={styles.recognitionText}>
            {item.recognition?.hold ? (
              <AppText variant="bodySmall" weight="medium">
                {item.recognition.hold === 'contradictory'
                  ? accountMatcherStrings.recognitionConflict
                  : "Couldn't check the account"}
              </AppText>
            ) : null}
            {item.recognizedAccountNames?.length ? (
              <AppText variant="caption" color="secondary">
                Recognized: {item.recognizedAccountNames.join(', ')}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      {!privateMode && !!item.consumedWorkplaces?.length && (
        <AppText variant="caption" color="secondary">
          Already handled in {item.consumedWorkplaces.map(workplace => workplace.name).join(', ')}
        </AppText>
      )}
      {!privateMode ? (
        <AppText
          variant="bodySmall"
          color="secondary"
          numberOfLines={3}
          ellipsizeMode="tail"
          style={styles.bodyPreview}
        >
          {item.channel === 'email'
            ? 'The original email remains with your email provider.'
            : item.rawBody}
        </AppText>
      ) : null}

      {!privateMode && item.channel === 'email' ? (
        <View>
          {item.senderAddress ? (
            <AppText variant="caption" color="secondary">
              From: {item.senderAddress}
            </AppText>
          ) : null}
          {item.emailSubject ? (
            <AppText variant="caption" color="secondary">
              Subject: {item.emailSubject}
            </AppText>
          ) : null}
          {item.parsedAccountSource ? (
            <AppText variant="caption" color="secondary">
              Account hint: {item.parsedAccountSource}
            </AppText>
          ) : null}
          {item.referenceNumber ? (
            <AppText variant="caption" color="secondary">
              Reference: {item.referenceNumber}
            </AppText>
          ) : null}
          {item.gmailMessageId && Platform.OS !== 'web' ? (
            <AppButton
              variant="ghost"
              size="sm"
              testID="inbox-open-gmail"
              onPress={() => setPreviewOpen(true)}
            >
              View original email
            </AppButton>
          ) : null}
        </View>
      ) : null}
      {previewOpen && item.gmailMessageId && !privateMode ? (
        <EmailPreviewModal
          messageId={item.gmailMessageId}
          sourceId={item.deviceSourceId}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      {!privateMode && item.parseReason && (
        <AppText variant="caption" color="secondary" style={styles.parseReason}>
          {item.parseReason}
        </AppText>
      )}

      <View style={styles.actions}>
        <AppButton
          size="sm"
          onPress={primary.onPress}
          testID={primary.testID}
          style={styles.actionButton}
        >
          {primary.title}
        </AppButton>
        {split ? (
          <AppButton
            size="sm"
            variant="outline"
            onPress={split.onPress}
            testID={split.testID}
            style={styles.actionButton}
          >
            {split.title}
          </AppButton>
        ) : null}
        {more.length > 0 ? (
          <AppButton
            size="sm"
            variant="secondary"
            onPress={() => setMenuOpen(true)}
            testID={`inbox-more-${item.deviceSourceId}`}
            style={styles.actionButton}
          >
            {transactionCaptureStrings.inboxActionMore}
          </AppButton>
        ) : null}
      </View>
      <ModalSurface
        visible={menuOpen}
        title={title}
        onClose={() => setMenuOpen(false)}
        onDismiss={flushPendingAfterMenuClose}
        position="bottomSheet"
        fixedHeight={false}
        scrollable={false}
      >
        <ListGroup items={more} />
      </ModalSurface>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 0,
  },
  cardTop: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  amountColumn: {
    alignItems: 'flex-end',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  recognitionNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  recognitionText: { flex: 1, minWidth: 0, gap: Spacing.xs },
  bodyPreview: {
    marginBottom: Spacing.sm,
  },
  parseReason: {
    marginBottom: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionButton: {
    minHeight: Size.touchTargetLg,
  },
});
