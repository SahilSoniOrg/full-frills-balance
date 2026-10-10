import { MoneyText } from '@/src/components/shared/MoneyText';
import {
  Icon,
  AppButton,
  AppCard,
  AppIcon,
  AppText,
  Badge,
  ListGroup,
  type ListRowItem,
} from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useState } from 'react';
import { Opacity, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { InboxProcessingStatus } from '@/src/types/enums';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { alert } from '@/src/utils/alerts';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDateKeepingPattern } from '@/src/utils/dateUtils';
import { StyleSheet, View } from 'react-native';

interface TransactionInboxItemCardViewProps {
  item: TransactionInboxItem;
  currencyCode: string;
  handleDismiss: (item: TransactionInboxItem) => Promise<void>;
  handleUndismiss: (item: TransactionInboxItem) => Promise<void>;
  handleImport: (item: TransactionInboxItem) => void;
  onCompareDuplicate: (item: TransactionInboxItem) => void;
  onOpenJournal: (item: TransactionInboxItem) => void;
  onCreateRule: (item: TransactionInboxItem) => void;
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
  onOpenJournal,
  onCreateRule,
  onSplitImport,
  onEditReparse,
  testID,
}: TransactionInboxItemCardViewProps) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const [menuOpen, setMenuOpen] = useState(false);

  const channelIcon = item.channel === 'voice' ? Icon.Mic : Icon.MessageSquare;
  const channelLabel = item.channel === 'voice' ? 'Spoken' : 'SMS';
  const linkedJournalUnavailable =
    item.linkedJournal?.status === 'DELETED' || item.linkedJournal?.status === 'MISSING';
  const linkedJournalColor = linkedJournalUnavailable ? theme.warning : theme.success;
  const linkedJournalLabel =
    item.linkedJournal?.status === 'DELETED'
      ? 'deleted journal'
      : item.linkedJournal?.status === 'MISSING'
        ? 'unavailable journal'
        : 'linked journal';

  const id = item.deviceSourceId;
  const dismissed = item.processingStatus === InboxProcessingStatus.DISMISSED;
  const sms = item.channel === 'sms';
  const title =
    item.channel === 'voice'
      ? 'Spoken Draft'
      : item.parsedMerchant || item.senderAddress || 'Unknown Origin';
  const run = (fn: (item: TransactionInboxItem) => unknown) => () => {
    setMenuOpen(false);
    void fn(item);
  };
  // ponytail: first applicable action is the primary button; the rest go in the More sheet.
  const [primary, ...more] = (
    [
      item.linkedJournal &&
        !linkedJournalUnavailable && {
          id: 'open',
          title: 'Open Journal',
          icon: Icon.Document,
          onPress: run(onOpenJournal),
        },
      dismissed && {
        id: 'undo',
        title: 'Undo Dismiss',
        icon: Icon.History,
        onPress: run(handleUndismiss),
      },
      !item.linkedJournal &&
        item.duplicateCandidate && {
          id: 'compare',
          title: 'Compare duplicate',
          icon: Icon.Merge,
          onPress: run(onCompareDuplicate),
          testID: `inbox-compare-duplicate-${id}`,
        },
      !item.linkedJournal &&
        item.processingStatus !== InboxProcessingStatus.PARSE_FAILED && {
          id: 'import',
          title: 'Import / Review',
          icon: Icon.Check,
          onPress: run(handleImport),
        },
      sms &&
        !item.linkedJournal && {
          id: 'reparse',
          title: 'Edit & Re-parse',
          icon: Icon.Edit,
          onPress: run(onEditReparse),
          testID: `inbox-edit-reparse-btn-${id}`,
        },
      !item.linkedJournal &&
        !!item.parsedAmount && {
          id: 'split',
          title: 'Split',
          icon: Icon.SwapHorizontal,
          onPress: run(onSplitImport),
          testID: `inbox-split-btn-${id}`,
        },
      !dismissed && { id: 'dismiss', title: 'Dismiss', icon: Icon.X, onPress: run(handleDismiss) },
      sms && {
        id: 'rule',
        title: 'Create Rule',
        icon: Icon.Zap,
        onPress: run(onCreateRule),
        testID: `inbox-create-rule-btn-${id}`,
      },
      {
        id: 'raw',
        title: 'View Raw',
        icon: Icon.MessageSquare,
        onPress: run(() =>
          alert.show({
            title:
              item.channel === 'voice'
                ? 'Raw Voice Transcript'
                : item.senderAddress || 'Raw Message',
            message: item.rawBody || '',
          }),
        ),
      },
    ] as (ListRowItem | false | null | undefined)[]
  ).filter((a): a is ListRowItem => !!a) as [ListRowItem, ...ListRowItem[]];

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
          {item.processingStatus.replace(/_/g, ' ')}
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

      {!!item.consumedWorkplaces?.length && (
        <AppText variant="caption" color="secondary">
          Already handled in {item.consumedWorkplaces.map(workplace => workplace.name).join(', ')}
        </AppText>
      )}
      <AppText variant="body" color="secondary" style={styles.bodyPreview}>
        {item.rawBody}
      </AppText>

      {item.parseReason && (
        <AppText variant="caption" color="secondary" style={styles.parseReason}>
          {item.parseReason}
        </AppText>
      )}

      <View style={styles.actions}>
        <AppButton size="sm" onPress={primary.onPress} testID={primary.testID}>
          {primary.title}
        </AppButton>
        {more.length > 0 ? (
          <AppButton
            size="sm"
            variant="secondary"
            onPress={() => setMenuOpen(true)}
            testID={`inbox-more-${item.deviceSourceId}`}
          >
            More
          </AppButton>
        ) : null}
      </View>
      <ModalSurface
        visible={menuOpen}
        title={title}
        onClose={() => setMenuOpen(false)}
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
    marginBottom: Spacing.md,
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
});
